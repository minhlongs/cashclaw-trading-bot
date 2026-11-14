"""Tests for Stream 3 Automated TS <-> Python Gate G13 Checkpoint Bridge & Geo-Block Fallback."""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[2]
ART = REPO / "artifacts"
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load_g13_script():
    spec = importlib.util.spec_from_file_location("g13_paper_forward", SCRIPTS / "g13_paper_forward.py")
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules["g13_paper_forward"] = mod
    spec.loader.exec_module(mod)
    return mod


def _build_snapshot_variant(g13_mod, base_snap: dict[str, Any], observed_at_utc: str, bnb_spot: float, bnb_perp: float, bnb_fund_8h: float) -> dict[str, Any]:
    snap = copy.deepcopy(base_snap)
    snap.pop("cache_hit", None)
    snap.pop("snapshot_sha256", None)
    snap["observed_at_utc"] = observed_at_utc
    bnb = snap["symbols"]["BNBUSDT"]
    bnb["binance_spot_mid"] = bnb_spot
    bnb["binance_perp_mark"] = bnb_perp
    bnb["binance_funding_8h_rate"] = bnb_fund_8h
    basis_bps = (bnb_perp / bnb_spot - 1.0) * 1e4
    bnb["binance_spot_perp_basis_bps"] = round(basis_bps, 4)
    bnb["binance_instantaneous_annual_basis_bps"] = round(basis_bps * 365.0, 2)
    snap["snapshot_sha256"] = g13_mod.compute_snapshot_sha256(snap)
    return snap


def _make_marks_and_funding(snap: dict[str, Any], universe: list[str]) -> tuple[dict[str, Any], dict[str, list[float]]]:
    marks: dict[str, Any] = {}
    funding: dict[str, list[float]] = {}
    for sym in universe:
        q = snap["symbols"][sym]
        r_bps = round(float(q["binance_funding_8h_rate"]) * 10_000.0, 6)
        marks[sym] = {
            "spotMidUsd": float(q["binance_spot_mid"]),
            "perpMidUsd": float(q["binance_perp_mark"]),
            "spreadBps": 4.0,
        }
        funding[sym] = [0.0, 0.0, 0.0] if r_bps == 0.0 else [r_bps, r_bps, r_bps]
    return marks, funding


def test_multiday_ts_reconciliation_bridge_progression_and_fail_closed_tamper_guards(monkeypatch, tmp_path):
    g13_mod = _load_g13_script()
    committed_g13 = json.loads((ART / "g13_paper_tracking_error.json").read_text(encoding="utf-8"))
    signed_spec = json.loads((ART / "signed_strategy_spec_h3_maker.json").read_text(encoding="utf-8"))
    base_snap = committed_g13["day0_live_public_snapshot"]
    universe = signed_spec["universe"]
    half_adv = float(signed_spec["parameters"]["adverseSelectionBps"]) / 2.0
    spot_fee = float(signed_spec["venueSchedule"]["spotMakerBps"])
    perp_fee = float(signed_spec["venueSchedule"]["perpMakerBps"])

    out_g13 = tmp_path / "g13_progression.json"
    state_file = tmp_path / "runner_state.json"
    state_file.write_text('{"schemaVersion":"1.0.0"}\n', encoding="utf-8")
    monkeypatch.setattr(g13_mod, "G13_OUT_PATH", out_g13)

    # --- Day 0 (2026-11-14T13:07:31.631351Z) ---
    snap_d0 = _build_snapshot_variant(g13_mod, base_snap, "2026-11-14T13:07:31.631351Z", 611.365, 611.564682, 0.0)
    snap_d0_path = tmp_path / "snap_d0.json"
    snap_d0_path.write_text(json.dumps(snap_d0), encoding="utf-8")

    recon_d0 = {
        "schemaVersion": "1.0.0",
        "strategyId": "H3_MAKER",
        "specSha256": signed_spec["payloadSha256"],
        "snapshotSha256": snap_d0["snapshot_sha256"],
        "observedAtUtc": snap_d0["observed_at_utc"],
        "paperNav": 1.0,
        "oracleNav": 999.0,  # Ignored: Python computes Decimal(prec=50) oracle_nav independently!
        "initialCapitalUsd": 1_000_000,
        "equityMicroUsd": "1000000000000",
        "discrepancyMicroUsd": "0",
        "doubleEntryBalanced": True,
        "executedOrders": 0,
        "fundingEvents": 0,
        "protectionViolations": 0,
        "ledgerBreachCount": 0,
        "positions": [],
        "fills": [],
        "days": [],
        "liveTradingUnlocked": False,
    }
    recon_d0_path = tmp_path / "recon_d0.json"
    recon_d0_path.write_text(json.dumps(recon_d0), encoding="utf-8")

    rc0 = g13_mod.main([
        "--snapshot-json", str(snap_d0_path),
        "--ts-reconciliation-json", str(recon_d0_path),
        "--out-g13", str(out_g13),
        "--state-file", str(state_file),
    ])
    assert rc0 == 0
    doc0 = json.loads(out_g13.read_text(encoding="utf-8"))
    assert doc0["genesis_utc"] == "2026-11-14T13:07:31.631351Z"
    assert doc0["elapsed_days"] == 0
    assert doc0["g13_pass"] is False
    assert doc0["live_trading_unlocked"] is False
    assert len(doc0["checkpoints"]) == 1
    assert doc0["checkpoints"][0]["oracle_nav"] == 1.0

    # --- Day 1 (2026-11-15T14:00:00Z): paired spot+perp entry on BNBUSDT (40 BNB = 4_000_000_000 base units) ---
    snap_d1 = _build_snapshot_variant(g13_mod, base_snap, "2026-11-15T14:00:00Z", 612.0, 613.5, 0.00012)
    snap_d1_path = tmp_path / "snap_d1.json"
    snap_d1_path.write_text(json.dumps(snap_d1), encoding="utf-8")
    marks_d1, fund_d1 = _make_marks_and_funding(snap_d1, universe)

    qty_base = 4_000_000_000  # 40.0 BNB
    fills_d1 = [
        {
            "dayIndex": 1,
            "clientOrderId": "h3m_d1_BNBUSDT_spot_entry",
            "symbol": "BNBUSDT:SPOT",
            "side": "buy",
            "filledQtyBase": str(qty_base),
            "referenceMidUsd": 612.0,
            "slipBps": half_adv,
            "feeBps": spot_fee,
            "fillPriceMicroUsd": "612098942",
            "timestampMs": 1_794_751_200_010,
        },
        {
            "dayIndex": 1,
            "clientOrderId": "h3m_d1_BNBUSDT_perp_entry",
            "symbol": "BNBUSDT:PERP",
            "side": "sell",
            "filledQtyBase": str(qty_base),
            "referenceMidUsd": 613.5,
            "slipBps": half_adv,
            "feeBps": perp_fee,
            "fillPriceMicroUsd": "613400815",
            "timestampMs": 1_794_751_200_020,
        },
    ]
    positions_open = [
        {"symbol": "BNBUSDT:SPOT", "signedQtyBase": str(qty_base), "openNotionalMicroUsd": "24483957680", "openMarginMicroUsd": "24483957680"},
        {"symbol": "BNBUSDT:PERP", "signedQtyBase": str(-qty_base), "openNotionalMicroUsd": "24536032600", "openMarginMicroUsd": "12268016300"},
    ]
    day1_entry = {
        "dayIndex": 1,
        "timestampMs": 1_794_751_200_000,
        "observedAtUtc": snap_d1["observed_at_utc"],
        "snapshotSha256": snap_d1["snapshot_sha256"],
        "marks": marks_d1,
        "fundingIntervalsBpsBySymbol": fund_d1,
    }
    # Expected NAV after entry fees (spot 4bps + perp 1.5bps + 2*half_adv on $24.5k out of $1M ~= 0.9999787575)
    spot_exec = 612.0 * (1.0 + half_adv / 1e4)
    perp_exec = 613.5 * (1.0 - half_adv / 1e4)
    fees_d1 = 40.0 * spot_exec * (spot_fee / 1e4) + 40.0 * perp_exec * (perp_fee / 1e4)
    unreal_d1 = 40.0 * (612.0 - spot_exec) + 40.0 * (perp_exec - 613.5)
    paper_nav_d1 = round((1_000_000.0 - fees_d1 + unreal_d1) / 1_000_000.0, 10)

    recon_d1 = {
        **recon_d0,
        "snapshotSha256": snap_d1["snapshot_sha256"],
        "observedAtUtc": snap_d1["observed_at_utc"],
        "paperNav": paper_nav_d1,
        "executedOrders": 2,
        "positions": positions_open,
        "fills": fills_d1,
        "days": [day1_entry],
    }
    recon_d1_path = tmp_path / "recon_d1.json"
    recon_d1_path.write_text(json.dumps(recon_d1), encoding="utf-8")

    rc1 = g13_mod.main([
        "--snapshot-json", str(snap_d1_path),
        "--ts-reconciliation-json", str(recon_d1_path),
        "--out-g13", str(out_g13),
        "--state-file", str(state_file),
    ])
    assert rc1 == 0
    doc1 = json.loads(out_g13.read_text(encoding="utf-8"))
    assert doc1["genesis_utc"] == "2026-11-14T13:07:31.631351Z"
    assert doc1["elapsed_days"] == 1
    assert doc1["status"] == "OBSERVATION_ACTIVE_INCONCLUSIVE"
    assert doc1["g13_pass"] is False
    assert doc1["live_trading_unlocked"] is False
    assert len(doc1["checkpoints"]) == 2
    assert doc1["checkpoints"][1]["day_offset"] == 1
    assert doc1["realized_tracking_error_bps_per_month"] is not None
    assert doc1["realized_tracking_error_bps_per_month"] < 15.0

    # Re-running on the same UTC date ("2026-11-15") is idempotent and never fabricates elapsed_days.
    rc1_idem = g13_mod.main([
        "--snapshot-json", str(snap_d1_path),
        "--ts-reconciliation-json", str(recon_d1_path),
        "--out-g13", str(out_g13),
    ])
    assert rc1_idem == 0
    assert len(json.loads(out_g13.read_text(encoding="utf-8"))["checkpoints"]) == 2

    # --- Day 2 (2026-11-16T15:00:00Z): short perp collects 3x 8h positive funding, basis converges ---
    snap_d2 = _build_snapshot_variant(g13_mod, base_snap, "2026-11-16T15:00:00Z", 614.0, 614.4, 0.00015)
    snap_d2_path = tmp_path / "snap_d2.json"
    snap_d2_path.write_text(json.dumps(snap_d2), encoding="utf-8")
    marks_d2, fund_d2 = _make_marks_and_funding(snap_d2, universe)
    day2_entry = {
        "dayIndex": 2,
        "timestampMs": 1_794_841_200_000,
        "observedAtUtc": snap_d2["observed_at_utc"],
        "snapshotSha256": snap_d2["snapshot_sha256"],
        "marks": marks_d2,
        "fundingIntervalsBpsBySymbol": fund_d2,
    }
    funding_d2 = 3.0 * (40.0 * 614.4 * 0.00015)
    unreal_d2 = 40.0 * (614.0 - spot_exec) + 40.0 * (perp_exec - 614.4)
    paper_nav_d2 = round((1_000_000.0 - fees_d1 + funding_d2 + unreal_d2) / 1_000_000.0, 10)

    recon_d2 = {
        **recon_d1,
        "snapshotSha256": snap_d2["snapshot_sha256"],
        "observedAtUtc": snap_d2["observed_at_utc"],
        "paperNav": paper_nav_d2,
        "fundingEvents": 3,
        "days": [day1_entry, day2_entry],
    }
    recon_d2_path = tmp_path / "recon_d2.json"
    recon_d2_path.write_text(json.dumps(recon_d2), encoding="utf-8")

    rc2 = g13_mod.main([
        "--snapshot-json", str(snap_d2_path),
        "--ts-reconciliation-json", str(recon_d2_path),
        "--out-g13", str(out_g13),
        "--state-file", str(state_file),
    ])
    assert rc2 == 0
    doc2 = json.loads(out_g13.read_text(encoding="utf-8"))
    assert doc2["genesis_utc"] == "2026-11-14T13:07:31.631351Z"
    assert doc2["elapsed_days"] == 2
    assert doc2["g13_pass"] is False
    assert doc2["live_trading_unlocked"] is False
    assert len(doc2["checkpoints"]) == 3
    assert [cp["day_offset"] for cp in doc2["checkpoints"]] == [0, 1, 2]
    assert json.loads(state_file.read_text(encoding="utf-8"))["lastOracleVerification"]["oracleNav"] == pytest.approx(
        paper_nav_d2, abs=1e-8
    )

    # --- Fail-closed tamper Case 1: Tampered specSha256 -> exit != 0 ---
    bad_spec_path = tmp_path / "bad_spec.json"
    bad_spec_path.write_text(json.dumps({**recon_d2, "specSha256": "0" * 64}), encoding="utf-8")
    assert g13_mod.main(["--snapshot-json", str(snap_d2_path), "--ts-reconciliation-json", str(bad_spec_path), "--out-g13", str(out_g13)]) != 0

    # --- Fail-closed tamper Case 2: Unbalanced ledger (discrepancyMicroUsd != "0") -> exit != 0 ---
    bad_bal_path = tmp_path / "bad_bal.json"
    bad_bal_path.write_text(json.dumps({**recon_d2, "discrepancyMicroUsd": "250"}), encoding="utf-8")
    assert g13_mod.main(["--snapshot-json", str(snap_d2_path), "--ts-reconciliation-json", str(bad_bal_path), "--out-g13", str(out_g13)]) != 0

    # --- Fail-closed tamper Case 3: Tracking error > 15.0 bps/month -> exit != 0 ---
    bad_te_path = tmp_path / "bad_te.json"
    bad_te_path.write_text(json.dumps({**recon_d2, "paperNav": paper_nav_d2 + 0.005}), encoding="utf-8")
    assert g13_mod.main(["--snapshot-json", str(snap_d2_path), "--ts-reconciliation-json", str(bad_te_path), "--out-g13", str(out_g13)]) != 0

    # --- Fail-closed tamper Case 4: Gate G15 violation (liveTradingUnlocked=True) -> exit != 0 ---
    bad_g15_path = tmp_path / "bad_g15.json"
    bad_g15_path.write_text(json.dumps({**recon_d2, "liveTradingUnlocked": True}), encoding="utf-8")
    assert g13_mod.main(["--snapshot-json", str(snap_d2_path), "--ts-reconciliation-json", str(bad_g15_path), "--out-g13", str(out_g13)]) != 0


def test_geoblock_http_451_fallback_and_missing_parquet_ci_resilience(monkeypatch, tmp_path):
    g13_mod = _load_g13_script()
    signed_spec = json.loads((ART / "signed_strategy_spec_h3_maker.json").read_text(encoding="utf-8"))
    universe = signed_spec["universe"]

    # Simulate clean GitHub Actions ubuntu-latest runner (no gitignored verification_lab/data/*).
    empty_norm = tmp_path / "empty_norm"
    empty_raw = tmp_path / "empty_raw"
    monkeypatch.setattr(g13_mod, "NORM_DIR", empty_norm)
    monkeypatch.setattr(g13_mod, "RAW_DIR", empty_raw)
    monkeypatch.setattr(g13_mod, "DAY0_CACHE_PATH", empty_raw / "g13_day0_snapshot.json")

    class FakeResp:
        def __init__(self, status_code: int, payload: Any):
            self.status_code = status_code
            self._payload = payload

        def raise_for_status(self) -> None:
            if self.status_code >= 400:
                raise g13_mod.requests.HTTPError(f"HTTP {self.status_code}")

        def json(self) -> Any:
            return self._payload

    spot_rows = [
        {"symbol": sym, "bidPrice": "100.00", "askPrice": "100.04"}
        for sym in universe
    ]
    hl_universe = [{"name": sym.replace("USDT", "")} for sym in universe]
    hl_ctxs = [
        {"markPx": "100.30", "midPx": "100.29", "oraclePx": "100.02", "funding": "0.000025"}
        for _ in universe
    ]

    def fake_get_451(url: str, timeout: int = 15):
        if "bookTicker" in url:
            return FakeResp(200, spot_rows)
        # Both fapi.binance.com and www.binance.com/fapi return HTTP 451 from US CI IPs!
        return FakeResp(451, {"code": 0, "msg": "Service unavailable from a restricted location"})

    def fake_post_hl(url: str, json: Any = None, timeout: int = 20):
        assert "hyperliquid" in url
        return FakeResp(200, [{"universe": hl_universe}, hl_ctxs])

    monkeypatch.setattr(g13_mod.requests, "get", fake_get_451)
    monkeypatch.setattr(g13_mod.requests, "post", fake_post_hl)

    snap = g13_mod.fetch_or_load_day0_public_snapshot(
        universe,
        signed_spec["parameters"],
        cache_path=tmp_path / "live_snap.json",
        offline=False,
    )
    assert snap["perp_source"] == "hyperliquid_meta_and_asset_ctxs_fallback"
    assert snap["orders_submitted"] == 0
    assert snap["universe_count"] == len(universe)
    assert snap["symbols"]["BNBUSDT"]["binance_spot_mid"] == pytest.approx(100.02)
    assert snap["symbols"]["BNBUSDT"]["binance_perp_mark"] == pytest.approx(100.30)
    assert snap["symbols"]["BNBUSDT"]["binance_funding_8h_rate"] == pytest.approx(0.0002)
    assert g13_mod.compute_snapshot_sha256(snap) == snap["snapshot_sha256"]

    # Also verify `--offline` fallback from committed G13_OUT_PATH works when DAY0_CACHE_PATH & NORM_DIR are absent!
    ci_offline_out = tmp_path / "ci_offline_out.json"
    rc_ci = g13_mod.main(["--offline", "--out-g13", str(ci_offline_out)])
    assert rc_ci == 0
    ci_doc = json.loads(ci_offline_out.read_text(encoding="utf-8"))
    assert ci_doc["live_trading_unlocked"] is False
    assert ci_doc["elapsed_days"] == 0
