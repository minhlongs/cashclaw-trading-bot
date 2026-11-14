"""Tests for Issue #63: Millisecond L2/aggTrades FIFO Calibration, Strategy Archival & Gate G13."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import pytest

from verification_lab.execution import tick_fifo_calibrator as tfc
from verification_lab.runner import strategy_archive as sa

REPO = Path(__file__).resolve().parents[2]
ART = REPO / "artifacts"
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load_script(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


# --- 1. FIFO Queue Depletion, Adverse Selection & Two-Leg Sync Physics ------


def test_fifo_queue_depletion_requires_aggressor_to_clear_queue_ahead_before_our_clip():
    # Construct synthetic passive BUY at 100.00 with $1,000 queue ahead and $500 clip.
    stream = tfc.TickStream(
        symbol="TESTUSDT",
        leg="perp",
        ts_ms=np.array([1_000, 2_000, 3_000, 4_000, 5_000, 15_000], dtype=np.int64),
        price=np.array([100.00, 100.10, 100.00, 100.00, 100.00, 99.80], dtype=np.float64),
        # t=2000 is buyer aggressor at 100.10 (ignored); t=3000 is buyer aggressor at 100.00 (is_bm=False -> ignored);
        # t=4000 is seller aggressor $700 (depletes queue ahead to $300, 0 fill for us);
        # t=5000 is seller aggressor $600 (clears remaining $300 queue ahead, fills $300 of our $500 clip!);
        # t=15000 is 10s after t=5000 at 99.80 -> mid drops ~20 bps (positive adverse selection!).
        qty_usd=np.array([200.0, 500.0, 900.0, 700.0, 600.0, 400.0], dtype=np.float64),
        is_buyer_maker=np.array([True, False, False, True, True, True], dtype=bool),
        tick_size=0.10,
    )
    res = tfc.simulate_single_leg_fifo_slice(
        stream,
        side="buy",
        t0_ms=1_500,
        passive_horizon_ms=5_000,
        clip_usd=500.0,
        queue_ahead_usd=1_000.0,
        limit_price=100.00,
        entry_mid_price=100.05,
    )
    assert res["valid"] is True
    assert res["completed"] is False
    assert res["filled_usd"] == pytest.approx(300.0)
    assert res["fill_fraction"] == pytest.approx(0.60)
    assert res["first_fill_ts_ms"] == 5_000
    # ref_mid = 100.05 (bid=100.00, ask=100.10), post_mid at t=15000 = 99.90 (bid=99.80, ask=100.00):
    # adverse markout = (100.05 - 99.90) / 100.05 * 1e4 = 14.992504 bps!
    assert res["markouts_mid_adverse_bps"]["10s"] == pytest.approx(
        (100.05 - 99.90) / 100.05 * 1e4, abs=1e-5
    )


def test_fifo_price_through_sweeps_queue_and_completes_passive_sell_immediately():
    stream = tfc.TickStream(
        symbol="TESTUSDT",
        leg="spot",
        ts_ms=np.array([1_000, 2_500, 3_500], dtype=np.int64),
        price=np.array([100.00, 100.25, 100.40], dtype=np.float64),
        qty_usd=np.array([100.0, 50.0, 100.0], dtype=np.float64),
        is_buyer_maker=np.array([False, False, False], dtype=bool),
        tick_size=0.05,
    )
    # Passive SELL resting at 100.10 with huge $50,000 queue ahead: print at 100.25 > 100.10 sweeps level!
    res = tfc.simulate_single_leg_fifo_slice(
        stream,
        side="sell",
        t0_ms=1_000,
        passive_horizon_ms=5_000,
        clip_usd=1_000.0,
        queue_ahead_usd=50_000.0,
        limit_price=100.10,
        entry_mid_price=100.05,
    )
    assert res["completed"] is True
    assert res["filled_usd"] == pytest.approx(1_000.0)
    assert res["complete_fill_ts_ms"] == 2_500
    # Post-fill price moved higher (100.40 > 100.25) -> positive adverse selection against passive seller!
    assert res["markouts_mid_adverse_bps"]["1s"] > 10.0


def test_two_leg_hedge_window_triggers_emergency_taker_when_second_leg_misses_deadline():
    spot_done = {
        "clip_usd": 25_000.0,
        "filled_usd": 25_000.0,
        "complete_fill_ts_ms": 10_000,
        "fill_events": [(10_000, 25_000.0)],
    }
    # Perp fills $10,000 at t=20s (inside 30s hedge window) and $15,000 at t=55s (AFTER t=10s+30s=40s deadline!).
    perp_lagging = {
        "clip_usd": 25_000.0,
        "filled_usd": 25_000.0,
        "complete_fill_ts_ms": 55_000,
        "fill_events": [(20_000, 10_000.0), (55_000, 25_000.0)],
    }
    hw_30s = tfc.evaluate_two_leg_hedge_window(
        spot_done,
        perp_lagging,
        t0_ms=0,
        passive_horizon_ms=300_000,
        hedge_window_ms=30_000,
    )
    assert hw_30s["leg_miss_triggered"] is True
    assert hw_30s["emergency_taker_usd"] == pytest.approx(15_000.0)
    # Unhedged $15k out of $50k two-leg notional = 0.30 per-leg emergency taker share.
    assert hw_30s["per_leg_emergency_taker_share"] == pytest.approx(0.30)

    # Under a 60s hedge window (deadline = 70s), perp's t=55s passive fill arrives in time -> 0 leg miss!
    hw_60s = tfc.evaluate_two_leg_hedge_window(
        spot_done,
        perp_lagging,
        t0_ms=0,
        passive_horizon_ms=300_000,
        hedge_window_ms=60_000,
    )
    assert hw_60s["leg_miss_triggered"] is False
    assert hw_60s["emergency_taker_usd"] == pytest.approx(0.0)
    assert hw_60s["per_leg_emergency_taker_share"] == pytest.approx(0.0)


def test_tick_bounce_half_spread_recovers_constructed_bid_ask_half_spread():
    # Alternating seller-initiated prints at 99.95 (bid) and buyer-initiated prints at 100.05 (ask) -> 5.0 bps half-spread.
    n = 40
    ts = np.arange(n, dtype=np.int64) * 1_000
    is_bm = np.arange(n) % 2 == 0
    px = np.where(is_bm, 99.95, 100.05)
    stream = tfc.TickStream(
        symbol="SYNTHUSDT",
        leg="perp",
        ts_ms=ts,
        price=px,
        qty_usd=np.full(n, 1_000.0),
        is_buyer_maker=is_bm,
        tick_size=0.01,
    )
    est = tfc.measure_tick_bounce_half_spread(stream)
    assert est["vwap_60s_median_half_spread_bps"] == pytest.approx(5.0, rel=1e-3)
    assert est["sign_flip_median_half_spread_bps"] == pytest.approx(5.0, rel=1e-3)
    assert est["effective_half_spread_bps"] == pytest.approx(5.0, rel=1e-3)


def test_fetch_verified_vision_zip_rejects_corrupted_checksum_and_offline_never_touches_network(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(
        tfc.requests,
        "get",
        lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("network forbidden in offline test")),
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("BNBUSDT-aggTrades-2023-10-17.csv", "1,210.0,1.0,1,1,1697500800100,true\n")
    raw_zip = buf.getvalue()
    good_sha = hashlib.sha256(raw_zip).hexdigest()

    tdir = tmp_path / "perp_agg_trades" / "BNBUSDT"
    tdir.mkdir(parents=True)
    zpath = tdir / "BNBUSDT-aggTrades-2023-10-17.zip"
    cpath = tdir / "BNBUSDT-aggTrades-2023-10-17.zip.CHECKSUM"
    zpath.write_bytes(raw_zip)
    cpath.write_text(f"{good_sha}  BNBUSDT-aggTrades-2023-10-17.zip\n", encoding="utf-8")

    loaded_bytes, meta = tfc.fetch_verified_vision_zip(
        "perp_agg_trades", "BNBUSDT", "2023-10-17", tmp_path, offline=True
    )
    assert loaded_bytes == raw_zip
    assert meta["checksum_verified"] is True
    assert meta["cache_hit"] is True

    # Tamper the cached .CHECKSUM -> must raise ValueError in offline mode!
    cpath.write_text(f"{'0' * 64}  BNBUSDT-aggTrades-2023-10-17.zip\n", encoding="utf-8")
    with pytest.raises(ValueError, match="SHA-256 mismatch"):
        tfc.fetch_verified_vision_zip(
            "perp_agg_trades", "BNBUSDT", "2023-10-17", tmp_path, offline=True
        )


def test_committed_tick_calibration_and_g6_artifacts_enforce_zero_oos_leakage():
    cal = json.loads((ART / "h3_maker_tick_queue_calibration.json").read_text(encoding="utf-8"))
    assert cal["provenance"]["all_sha256_checksums_verified"] is True
    assert cal["provenance"]["total_archive_mb"] < 40.0
    assert cal["provenance"]["n_archives"] == 21

    for d in cal["train_calibration"]["days"]:
        assert d["date"] <= "2024-12-31", f"OOS date leaked into train calibration: {d['date']}"
    for d in cal["locked_oos_verification"]["days"]:
        assert d["date"] >= "2025-04-01", f"Train/embargo date in locked_oos verification: {d['date']}"

    g6 = json.loads((ART / "g6_execution_tca.json").read_text(encoding="utf-8"))
    # Coarse OHLCV band must remain preserved untouched!
    assert g6["spread_band"]["floor_half_spread_bps"] == pytest.approx(3.0)
    assert g6["spread_band"]["ceiling_half_spread_bps"] == pytest.approx(24.8772, abs=1e-3)
    tc = g6["tick_calibrated_h3_maker"]
    assert tc["available"] is True
    assert tc["zero_oos_leakage_verified"] is True
    assert tc["by_venue"]["hyperliquid"]["clears_2x_on_both_train_bounds_and_oos_ticks"] is True


# --- 2. Strategy Archival / Kill-Freeze Registry ----------------------------


def test_lifecycle_registry_archives_all_five_falsified_families_and_permits_only_h3_maker(tmp_path):
    reg_path = ART / "strategy_lifecycle_registry.json"
    reg = json.loads(reg_path.read_text(encoding="utf-8"))
    assert sa.verify_lifecycle_registry(reg) is True
    assert reg["live_trading_locked"] is True

    by_id = {row["strategy_id"]: row for row in reg["strategies"]}
    assert set(by_id) == {"H1", "H2", "H3", "H1_G1", "H2_G1", "H3_MAKER"}

    for falsified_id in ("H1", "H2", "H3", "H1_G1", "H2_G1"):
        row = by_id[falsified_id]
        assert row["status"] == "ARCHIVED_FALSIFIED"
        assert row["paper_forward_allowed"] is False
        assert row["archive_reason"] and "DSR" in row["archive_reason"]
        with pytest.raises(PermissionError, match="ARCHIVED_FALSIFIED"):
            sa.assert_paper_forward_eligible(falsified_id, reg_path)

    with pytest.raises(PermissionError, match="Unknown strategy_id"):
        sa.assert_paper_forward_eligible("UNKNOWN_STRAT", reg_path)

    h3m = sa.assert_paper_forward_eligible("H3_MAKER", reg_path)
    assert h3m["status"] == "PAPER_FORWARD_ELIGIBLE"
    assert h3m["paper_forward_allowed"] is True
    assert h3m["archive_reason"] is None

    # Tampering live_trading_locked or flipping H1 to PAPER_FORWARD_ELIGIBLE without re-signing fails closed!
    tampered = json.loads(reg_path.read_text(encoding="utf-8"))
    tampered["strategies"][0]["status"] = "PAPER_FORWARD_ELIGIBLE"
    tampered["strategies"][0]["paper_forward_allowed"] = True
    bad_path = tmp_path / "tampered_registry.json"
    bad_path.write_text(json.dumps(tampered), encoding="utf-8")
    with pytest.raises(PermissionError, match="integrity"):
        sa.assert_paper_forward_eligible("H1", bad_path)


# --- 3. SignedStrategySpec Canonical SHA-256 & Tamper Rejection -------------


def test_signed_strategy_spec_canonical_sha256_and_authority_tamper_rejection():
    spec = json.loads((ART / "signed_strategy_spec_h3_maker.json").read_text(encoding="utf-8"))
    ok, errs = sa.verify_signed_strategy_spec(spec)
    assert ok is True and errs == []
    assert spec["strategyId"] == "H3_MAKER"
    assert spec["executionMode"] == "PAPER_ONLY"
    assert spec["liveOrderAuthority"] is False
    assert spec["aiOrderAuthority"] is False

    # Re-ordering dictionary keys must produce the EXACT same canonical SHA-256!
    reversed_spec = {k: spec[k] for k in reversed(list(spec.keys()))}
    assert sa.compute_canonical_sha256(reversed_spec, exclude_key="payloadSha256") == spec["payloadSha256"]

    # Parameter mutation without updating hash -> rejected.
    mut_param = json.loads(json.dumps(spec))
    mut_param["parameters"]["entryAnnualBps"] = 500
    ok_p, errs_p = sa.verify_signed_strategy_spec(mut_param)
    assert ok_p is False and any("mismatch" in e for e in errs_p)

    # Even if re-hashed, enabling liveOrderAuthority or aiOrderAuthority MUST fail closed!
    mut_live = json.loads(json.dumps(spec))
    mut_live["liveOrderAuthority"] = True
    mut_live["payloadSha256"] = sa.compute_canonical_sha256(mut_live, exclude_key="payloadSha256")
    ok_l, errs_l = sa.verify_signed_strategy_spec(mut_live)
    assert ok_l is False and any("liveOrderAuthority" in e for e in errs_l)

    mut_ai = json.loads(json.dumps(spec))
    mut_ai["aiOrderAuthority"] = True
    mut_ai["payloadSha256"] = sa.compute_canonical_sha256(mut_ai, exclude_key="payloadSha256")
    ok_a, errs_a = sa.verify_signed_strategy_spec(mut_ai)
    assert ok_a is False and any("aiOrderAuthority" in e for e in errs_a)


# --- 4. Gate G13 Fail-Closed Clock & Tracking Error State Machine -----------


def test_committed_g13_artifact_is_honestly_day0_inconclusive_and_offline_safe(monkeypatch, tmp_path):
    g13_mod = _load_script("g13_paper_forward")
    g13 = json.loads((ART / "g13_paper_tracking_error.json").read_text(encoding="utf-8"))

    assert g13["gate"] == "G13"
    assert g13["status"] == "OBSERVATION_ACTIVE_INCONCLUSIVE"
    assert g13["g13_pass"] is False
    assert g13["live_trading_unlocked"] is False
    assert g13["elapsed_days"] < g13["min_required_days"]
    assert g13["min_required_days"] == 60
    assert g13["harness_shadow_parity_check"]["passes_15bps_per_month_gate"] is True
    assert g13["harness_shadow_parity_check"]["harness_shadow_tracking_error_bps_per_month"] < 15.0
    assert g13["day0_live_public_snapshot"]["orders_submitted"] == 0

    # Redirect output paths to tmp_path so pytest never mutates committed artifacts/*.json!
    monkeypatch.setattr(g13_mod, "LIFECYCLE_PATH", tmp_path / "strategy_lifecycle_registry.json")
    monkeypatch.setattr(g13_mod, "SIGNED_SPEC_PATH", tmp_path / "signed_strategy_spec_h3_maker.json")
    monkeypatch.setattr(g13_mod, "G13_OUT_PATH", tmp_path / "g13_paper_tracking_error.json")

    # Verify `--offline` runs cleanly with network completely blocked.
    monkeypatch.setattr(
        g13_mod.requests,
        "get",
        lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("GET forbidden in --offline")),
    )
    monkeypatch.setattr(
        g13_mod.requests,
        "post",
        lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("POST forbidden in --offline")),
    )
    rc = g13_mod.main(["--offline"])
    assert rc == 0
    assert (tmp_path / "g13_paper_tracking_error.json").exists()


def test_g13_state_machine_fails_closed_under_60d_passes_low_te_at_60d_and_fails_high_te():
    g13_mod = _load_script("g13_paper_forward")
    shadow_ok = {
        "harness_shadow_tracking_error_bps_per_month": 0.05,
        "passes_15bps_per_month_gate": True,
    }
    snap_stub = {"observed_at_utc": "2026-11-14T00:00:00Z", "orders_submitted": 0}

    # Case A: 59 elapsed days (< 60 required) with 1.0 bps/mo TE -> MUST remain INCONCLUSIVE (`g13_pass == False`).
    res_59d = g13_mod.evaluate_g13_checkpoints(
        spec_path_rel="artifacts/signed_strategy_spec_h3_maker.json",
        spec_sha256="a" * 64,
        genesis_utc="2026-11-14T00:00:00Z",
        checkpoints=[
            {"checkpoint_index": 0, "observed_at_utc": "2026-11-14T00:00:00Z", "paper_nav": 1.0, "oracle_nav": 1.0},
            {"checkpoint_index": 1, "observed_at_utc": "2027-01-12T00:00:00Z", "paper_nav": 1.0102, "oracle_nav": 1.0100},
        ],
        harness_shadow_parity_check=shadow_ok,
        day0_live_public_snapshot=snap_stub,
    )
    assert res_59d["elapsed_days"] == 59
    assert res_59d["status"] == "OBSERVATION_ACTIVE_INCONCLUSIVE"
    assert res_59d["g13_pass"] is False
    assert res_59d["live_trading_unlocked"] is False

    # Case B: 60 elapsed days (2.0 months) with 6.0 bps cum diff = 3.0 bps/mo (< 15.0 bps/mo) -> `g13_pass == True`!
    res_60d_pass = g13_mod.evaluate_g13_checkpoints(
        spec_path_rel="artifacts/signed_strategy_spec_h3_maker.json",
        spec_sha256="a" * 64,
        genesis_utc="2026-11-14T00:00:00Z",
        checkpoints=[
            {"checkpoint_index": 0, "observed_at_utc": "2026-11-14T00:00:00Z", "paper_nav": 1.0, "oracle_nav": 1.0},
            {"checkpoint_index": 1, "observed_at_utc": "2027-01-13T00:00:00Z", "paper_nav": 1.0126, "oracle_nav": 1.0120},
        ],
        harness_shadow_parity_check=shadow_ok,
        day0_live_public_snapshot=snap_stub,
    )
    assert res_60d_pass["elapsed_days"] == 60
    assert res_60d_pass["realized_tracking_error_bps_per_month"] == pytest.approx(3.0, abs=1e-4)
    assert res_60d_pass["status"] == "PASS"
    assert res_60d_pass["g13_pass"] is True
    # Live trading MUST STILL remain locked pending separate G15 owner sign-off!
    assert res_60d_pass["live_trading_unlocked"] is False

    # Case C: 60 elapsed days (2.0 months) with 36.0 bps cum diff = 18.0 bps/mo (>= 15.0 bps/mo) -> FAIL!
    res_60d_fail = g13_mod.evaluate_g13_checkpoints(
        spec_path_rel="artifacts/signed_strategy_spec_h3_maker.json",
        spec_sha256="a" * 64,
        genesis_utc="2026-11-14T00:00:00Z",
        checkpoints=[
            {"checkpoint_index": 0, "observed_at_utc": "2026-11-14T00:00:00Z", "paper_nav": 1.0, "oracle_nav": 1.0},
            {"checkpoint_index": 1, "observed_at_utc": "2027-01-13T00:00:00Z", "paper_nav": 1.0156, "oracle_nav": 1.0120},
        ],
        harness_shadow_parity_check=shadow_ok,
        day0_live_public_snapshot=snap_stub,
    )
    assert res_60d_fail["elapsed_days"] == 60
    assert res_60d_fail["realized_tracking_error_bps_per_month"] == pytest.approx(18.0, abs=1e-4)
    assert res_60d_fail["status"] == "FAIL_TRACKING_ERROR_EXCEEDED"
    assert res_60d_fail["g13_pass"] is False
    assert res_60d_fail["live_trading_unlocked"] is False


def test_archive_ingestion_blocks_path_traversal_and_oversized_zip_entries(tmp_path):
    with pytest.raises(ValueError, match="Invalid archive symbol"):
        tfc.fetch_verified_vision_zip("spot_agg_trades", "../etc", "2024-03-04", tmp_path, offline=True)
    with pytest.raises(ValueError, match="Invalid archive date"):
        tfc.fetch_verified_vision_zip("spot_agg_trades", "BTCUSDT", "2024-03-04/../../x", tmp_path, offline=True)
    with pytest.raises(ValueError, match="Non-existent calendar date"):
        tfc.fetch_verified_vision_zip("spot_agg_trades", "BTCUSDT", "2024-02-31", tmp_path, offline=True)

    # Unsafe `../` ZIP entry path must be rejected before decompression.
    traversal_buf = io.BytesIO()
    with zipfile.ZipFile(traversal_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("../escape.csv", b"1,100,1,1,1,1700000000000,true\n")
    with pytest.raises(ValueError, match="Unsafe ZIP entry path"):
        tfc.parse_agg_trades_zip(traversal_buf.getvalue(), symbol="BTCUSDT", leg="spot")

    # Bounded uncompressed byte ceiling rejects oversized payloads cleanly.
    bomb_buf = io.BytesIO()
    with zipfile.ZipFile(bomb_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("BTCUSDT-aggTrades-2024-03-04.csv", b"0" * 4096)
    with pytest.raises(ValueError, match="ceiling"):
        tfc._read_bounded_single_csv_from_zip(bomb_buf.getvalue(), max_uncompressed_bytes=1024)

    # Multi-entry ZIPs and Windows backslash paths are rejected.
    multi_buf = io.BytesIO()
    with zipfile.ZipFile(multi_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("a.csv", b"1,100,1,1,1,1700000000000,true\n")
        zf.writestr("b.csv", b"1,100,1,1,1,1700000000000,true\n")
    with pytest.raises(ValueError, match="single-entry"):
        tfc.parse_book_depth_zip(multi_buf.getvalue(), symbol="BTCUSDT")

    win_buf = io.BytesIO()
    with zipfile.ZipFile(win_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("sub\\escape.csv", b"1,100,1,1,1,1700000000000,true\n")
    with pytest.raises(ValueError, match="Unsafe ZIP entry path"):
        tfc.parse_book_depth_zip(win_buf.getvalue(), symbol="BTCUSDT")


