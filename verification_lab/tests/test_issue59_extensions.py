"""Tests for Issue #59 Verification Lab extensions (G2, G4, G5, G6, Regimes, Parity, N>93)."""

from __future__ import annotations

import importlib.util
import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import polars as pl
import pytest

from verification_lab.execution import cost_model, event_ledger_oracle, fees, maker_queue
from verification_lab.runner import run_grid
from verification_lab.runner.trial_registry import TrialRecord, TrialRegistry
from verification_lab.stats import regimes as regimes_mod
from verification_lab.strategies import (
    h3_basis_carry as h3,
    hyperliquid_loader as hl_loader,
    loaders as L,
    overlay_g1,
)

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


# --- 1. 7-Regime Classifier & Attribution (§8.3) ---------------------------


def test_regimes_cover_all_seven_mandatory_labels_and_are_strictly_t_minus_1_causal():
    assert len(regimes_mod.REGIME_ORDER) == 7
    assert set(regimes_mod.REGIME_ORDER) == {
        "bull_uptrend",
        "bear_downtrend",
        "sideways_choppy",
        "low_vol_compression",
        "high_vol_expansion",
        "liquidity_crisis_cascading_liq",
        "exchange_disruption_depeg",
    }

    rng = np.random.default_rng(20261114)
    t_len = 320
    # Start outside known calendar disruption windows (`day = 18628 + k`) and inject shocks.
    days = np.arange(18628, 18628 + t_len, dtype=np.int64)
    rets = rng.normal(0.0005, 0.02, size=t_len)
    rets[0] = np.nan
    px = 100.0 * np.cumprod(np.concatenate([[1.0], 1.0 + rets[1:]]))
    basis_vals = rng.normal(0.0002, 0.0003, size=t_len)

    close_df = pl.DataFrame({"day": days, "BTCUSDT": px})
    ret_df = pl.DataFrame({"day": days, "BTCUSDT": rets})
    basis_df = pl.DataFrame({"day": days, "BTCUSDT": basis_vals})

    base_labels = regimes_mod.classify_regimes(close_df, ret_df, basis_df)
    assert len(base_labels) == t_len

    # Mutate everything from bar `cut` onward (`[cut:]`): labels on `[0 .. cut]` MUST NOT change!
    cut = 180
    rets_mut = rets.copy()
    rets_mut[cut:] = -0.25  # catastrophic crash starting on bar `cut`
    px_mut = px.copy()
    px_mut[cut:] = px[cut - 1] * 0.1
    basis_mut = basis_vals.copy()
    basis_mut[cut:] = 0.05  # huge basis depeg on bar `cut`

    mut_labels = regimes_mod.classify_regimes(
        pl.DataFrame({"day": days, "BTCUSDT": px_mut}),
        pl.DataFrame({"day": days, "BTCUSDT": rets_mut}),
        pl.DataFrame({"day": days, "BTCUSDT": basis_mut}),
    )
    assert mut_labels[: cut + 1] == base_labels[: cut + 1], (
        "regime label on bar `cut` leaked bar `cut` or future data"
    )
    # And bar `cut + 1` DOES respond causally to bar `cut`'s basis dislocation!
    assert mut_labels[cut + 1] == "exchange_disruption_depeg"


def test_attribute_by_regime_partitions_days_and_net_pnl_exhaustively():
    regimes = [
        "bull_uptrend",
        "bull_uptrend",
        "bear_downtrend",
        "sideways_choppy",
        "low_vol_compression",
        "high_vol_expansion",
        "liquidity_crisis_cascading_liq",
        "exchange_disruption_depeg",
    ]
    net = np.array([0.01, 0.02, -0.015, 0.0, 0.004, -0.005, -0.03, 0.008])
    turn = np.full(8, 0.12)
    attr = regimes_mod.attribute_by_regime(regimes, net, turn)
    assert sum(v["days"] for v in attr.values()) == 8
    assert sum(v["cum_net"] for v in attr.values()) == pytest.approx(float(np.sum(net)), abs=1e-6)


# --- 2. Independent Decimal Event-Driven Ledger Oracle (§13 & §18) ---------


def test_decimal_event_ledger_matches_vectorized_on_8h_and_1h_funding_within_1bps():
    days = [10, 11, 12, 13]
    perp_px = [100.0, 104.0, 101.92, 105.0]
    spot_px = [99.8, 103.6, 101.8, 104.7]
    w_pair = [0.0, 0.8, 0.8, 0.2]

    pos_df = pl.DataFrame({"day": days, "BTCUSDT": w_pair})
    perp_close = pl.DataFrame({"day": days, "BTCUSDT": perp_px})
    spot_close = pl.DataFrame({"day": days, "BTCUSDT": spot_px})
    perp_rets = L.returns_from_wide(perp_close)
    spot_rets = L.returns_from_wide(spot_close)

    # Build 24 hourly funding prints per day (96 events total -> 1h Hyperliquid cadence).
    f_rows = []
    for d in days:
        for h in range(24):
            f_rows.append(("BTCUSDT", d * L.DAY_MS + h * 3_600_000, 0.000025 + (h % 3) * 1e-6))
    f_1h = pl.DataFrame(f_rows, schema=["symbol", "ts_ms", "funding_rate"], orient="row")
    f_daily = pl.DataFrame(
        {
            "day": days,
            "BTCUSDT": [
                float(f_1h.filter((pl.col("ts_ms") // L.DAY_MS) == d)["funding_rate"].sum())
                for d in days
            ],
        }
    )

    # Price two-leg carry pair via vectorized engine and compare against Decimal oracle.
    res = h3.evaluate(pos_df, perp_rets, spot_rets, f_daily, cost_bps_per_turn=0.0)
    legs = [cost_model.Leg("spot", "hyperliquid", 0.5), cost_model.Leg("perp", "hyperliquid", 0.5)]
    adv = np.full((4, 1), 5e8)
    vol = np.full((4, 1), 0.03)
    assump = cost_model.CostAssumptions()
    dc = cost_model.daily_cost(
        np.array(w_pair)[:, None],
        legs=legs,
        leg_fee_bps={"spot": 7.0, "perp": 4.5},
        half_spread_bps_value=1.8,
        adv_usd=adv,
        vol_daily=vol,
        assumptions=assump,
    )
    vec_net = res["gross"] - dc["total"]

    parity = event_ledger_oracle.run_decimal_ledger(
        positions=pos_df,
        perp_close=perp_close,
        spot_close=spot_close,
        has_spot_leg=True,
        funding_events=f_1h,
        vec_net=vec_net,
        leg_fee_bps={"spot": 7.0, "perp": 4.5},
        half_spread_bps_per_leg={"spot": 1.8, "perp": 1.8},
        latency_bps_per_leg={"spot": assump.latency_slippage_bps, "perp": assump.latency_slippage_bps},
        adv_usd=adv,
        vol_daily=vol,
    )
    assert parity["funding_events_replayed"] == 96
    assert parity["passes_1bps_gate"] is True
    assert parity["terminal_nav_discrepancy_bps"] < 1e-6
    assert parity["unrebalanced_unit_drift_bps"] > 0.0  # day 12 has dw==0 with price move -> non-zero unit drift!

    # Perturbing vectorized net by +3 bps must fail the <1 bps gate.
    broken = event_ledger_oracle.run_decimal_ledger(
        positions=pos_df,
        perp_close=perp_close,
        spot_close=spot_close,
        has_spot_leg=True,
        funding_events=f_1h,
        vec_net=vec_net + np.array([0.0, 0.0003, 0.0, 0.0]),
        leg_fee_bps={"spot": 7.0, "perp": 4.5},
        half_spread_bps_per_leg={"spot": 1.8, "perp": 1.8},
        latency_bps_per_leg={"spot": assump.latency_slippage_bps, "perp": assump.latency_slippage_bps},
        adv_usd=adv,
        vol_daily=vol,
    )
    assert broken["passes_1bps_gate"] is False
    assert broken["terminal_nav_discrepancy_bps"] == pytest.approx(3.0, abs=1e-4)


# --- 3. Survivorship Zombie-Bar Filter, UNIUSDT Checksum & OI --------------


def test_g2_parse_zip_filters_zero_volume_zombie_klines_and_stamps_available_at_utc():
    g2 = _load_script("g2_ingest")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "FTMUSDT-1d-2025-01.csv",
            "open_time,open,high,low,close,volume\n"
            "1735689600000,0.80,0.85,0.78,0.82,1250000\n"
            "1735776000000,0.82,0.82,0.82,0.82,0\n"
            "1735862400000,0.82,0.82,0.82,0.82,0.0\n",
        )
    frame, zombies = g2.parse_zip_with_stats(buf.getvalue(), "perp_1d")
    assert zombies == 2
    assert frame.height == 1
    assert frame["available_at_ms"][0] == 1735689600000 + L.DAY_MS
    assert frame["available_at_utc"][0] == "2025-01-02T00:00:00Z"


def test_committed_provenance_has_zero_hard_errors_verified_uniusdt_checksum_and_oi():
    prov = pl.read_parquet(ART / "g2_data_provenance.parquet")
    g2 = _load_script("g2_ingest")
    hard = [r for r in prov.to_dicts() if g2.is_hard_failure_status(str(r["status"]))]
    assert hard == [], f"expected 0 hard errors in provenance, got {hard[:3]}"

    uni = prov.filter(
        (pl.col("dataset") == "perp_1d")
        & (pl.col("symbol") == "UNIUSDT")
        & (pl.col("month") == "2023-01")
    ).to_dicts()
    assert len(uni) == 1
    assert uni[0]["status"] == "ok"
    assert uni[0]["sha256"] == "bf368553082004394bd4a5eb8774ee7d1dd56c80c946285f682866507cc0ffbd"
    assert uni[0]["checksum_verified"] is True

    oi = L.load_oi_monthly()
    assert oi.height > 1000
    assert "available_at_utc" in oi.columns
    assert oi["symbol"].n_unique() == 23

    p_core = run_grid.build_panel("CORE_19")
    p_surv = run_grid.build_panel("SURVIVORSHIP_23")
    assert len([c for c in p_core.perp_close.columns if c != "day"]) == 19
    assert len([c for c in p_surv.perp_close.columns if c != "day"]) == 23


# --- 4. Hyperliquid Loader Offline & Schema Invariants ---------------------


def test_hyperliquid_loader_offline_never_calls_network_and_builds_valid_schemas(monkeypatch, tmp_path):
    monkeypatch.setattr(
        hl_loader.requests,
        "post",
        lambda *_a, **_kw: (_ for _ in ()).throw(AssertionError("network forbidden in offline mode")),
    )
    # Uncached offline returns cache_miss cleanly.
    miss = hl_loader.fetch_coin_funding_history("BTC", tmp_path / "raw", offline=True)
    assert miss["status"] == "cache_miss"

    # Seed raw cache for 1 coin and verify deterministic normalisation.
    hl_raw = tmp_path / "raw" / "hyperliquid"
    hl_raw.mkdir(parents=True, exist_ok=True)
    (hl_raw / "funding_BTC.json").write_text(
        json.dumps(
            {
                "coin": "BTC",
                "retrieved_at": "2026-11-14T00:00:00Z",
                "rows": [
                    {"coin": "BTC", "fundingRate": "0.0000125", "premium": "0.0001", "time": 1727740800123},
                    {"coin": "BTC", "fundingRate": "-0.0000050", "premium": "-0.0002", "time": 1727744400050},
                ],
            }
        ),
        encoding="utf-8",
    )
    (hl_raw / "l1_and_meta_snapshot.json").write_text(
        json.dumps(
            {
                "retrieved_at": "2026-11-14T00:00:00Z",
                "meta_and_asset_ctxs": [
                    {"universe": [{"name": "BTC"}]},
                    [{"markPx": "68000.5", "midPx": "68000.5", "impactPxs": ["67999.0", "68002.0"], "funding": "0.0000125", "openInterest": "12000", "dayNtlVlm": "2500000000"}],
                ],
                "l2_books": {
                    "BTC": {
                        "coin": "BTC",
                        "time": 1763000000000,
                        "levels": [[{"px": "68000.0", "sz": "1.5", "n": 4}], [{"px": "68001.0", "sz": "2.0", "n": 5}]],
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    recs, f_df, q_df = hl_loader.ingest_hyperliquid(
        tmp_path / "raw", tmp_path / "norm", funding_coins=("BTC",), quote_coins=("BTC",), offline=True
    )
    assert all(r["status"] == "ok" for r in recs)
    assert f_df is not None and f_df.height == 2
    assert "available_at_utc" in f_df.columns
    assert q_df is not None and q_df.height == 1
    assert q_df["snapshot_nature"][0] == "point_in_time_top_of_book_snapshot"
    assert q_df["impact_half_spread_bps"][0] > q_df["l1_half_spread_bps"][0] > 0.0


# --- 5. FIFO Maker Adverse-Selection & G1 Overlay Causality ----------------


def test_h3_fifo_maker_partial_fills_and_no_double_counting_of_spread():
    target = np.array([[0.0], [1.0], [1.0], [0.0], [0.0]])
    partial = maker_queue.apply_fifo_partial_fills(target, p_fill=0.5, dust_threshold=0.01)
    assert partial[:, 0].tolist() == pytest.approx([0.0, 0.5, 0.75, 0.375, 0.1875])

    full = maker_queue.apply_fifo_partial_fills(target, p_fill=1.0)
    assert full[:, 0].tolist() == pytest.approx([0.0, 1.0, 1.0, 0.0, 0.0])

    # With p_leg_miss=0.0 (100% passive fill), taker_half_spread_bps must contribute ZERO cost,
    # while adverse_selection_bps and maker fees are charged once.
    legs = [cost_model.Leg("spot", "hyperliquid", 0.5), cost_model.Leg("perp", "hyperliquid", 0.5)]
    c_low = maker_queue.maker_daily_cost(
        np.array([[0.0], [1.0]]),
        legs=legs,
        venue_name="hyperliquid",
        taker_half_spread_bps=3.0,
        adv_usd=np.ones((2, 1)),
        vol_daily=np.zeros((2, 1)),
        assumptions=cost_model.CostAssumptions(latency_slippage_bps=5.0, impact_coefficient=0.0, assumed_impact_bps=0.0),
        queue=maker_queue.MakerQueueAssumptions(p_fill=1.0, adverse_selection_bps=2.0, p_leg_miss=0.0),
    )
    c_high_spread = maker_queue.maker_daily_cost(
        np.array([[0.0], [1.0]]),
        legs=legs,
        venue_name="hyperliquid",
        taker_half_spread_bps=99.0,
        adv_usd=np.ones((2, 1)),
        vol_daily=np.zeros((2, 1)),
        assumptions=cost_model.CostAssumptions(latency_slippage_bps=5.0, impact_coefficient=0.0, assumed_impact_bps=0.0),
        queue=maker_queue.MakerQueueAssumptions(p_fill=1.0, adverse_selection_bps=2.0, p_leg_miss=0.0),
    )
    assert float(c_low["total"][1]) == pytest.approx(float(c_high_spread["total"][1]))
    # HL maker: 0.5*4.0 + 0.5*1.5 = 2.75 bps fee + 2.0 bps adverse selection = 4.75 bps total.
    assert float(c_low["total"][1]) == pytest.approx(4.75 / 1e4)
    assert fees.venue("binance").maker_bps("perp") == pytest.approx(2.0)
    assert fees.venue("hyperliquid").maker_bps("spot") == pytest.approx(4.0)


def test_g1_overlay_hysteresis_and_strict_t_minus_1_causality():
    rng = np.random.default_rng(99)
    t_len = 120
    # Synchronised crash on day 70 drives pairwise correlation > 0.80 on days 71..100.
    base = rng.normal(0.0, 0.01, size=(t_len, 5))
    common = np.zeros((t_len, 1))
    common[70:75] = -0.12
    arr = base + common
    df = pl.DataFrame({"day": range(t_len), **{f"S{i}": arr[:, i] for i in range(5)}})
    out = overlay_g1.compute_defensive_scalar(df, corr_threshold=0.75, hysteresis_bars=3)
    # Day 70 itself CANNOT know day 70 crashed (`scale[70] == 1.0`), while day 71 scales to 0.50!
    assert out["scale"][70] == pytest.approx(1.0)
    assert out["scale"][71] == pytest.approx(0.5)

    # Negative-funding freeze requires 3 consecutive prior bars `< -0.0003` and 3 non-negative bars to unfreeze.
    f_vals = [0.0003] * 5 + [-0.0005, -0.0005, -0.0005] + [0.0002, 0.0002, 0.0002, 0.0002]
    f_df = pl.DataFrame({"day": range(len(f_vals)), **{f"S{i}": f_vals for i in range(5)}})
    frz = overlay_g1.compute_negative_funding_freeze(f_df, consecutive_bars=3, hysteresis_bars=3)
    # Bars 5,6,7 are negative -> freeze turns True on bar 8, stays True on bars 9, 10 (2 calm bars), clears on bar 11!
    assert list(frz[7:12]) == [False, True, True, True, False]


# --- 6. Append-Only Trial Registry Preservation (`seq 1..93` + `N > 93`) ---


def test_committed_trial_registry_preserves_batch1_seq93_hash_and_appends_batch2():
    g5 = _load_script("g5_statistical_validity")
    reg = TrialRegistry(ART / "trial_registry.jsonl")
    assert reg.verify() is True
    assert reg.count == 185 > 93
    recs = reg.records()
    assert recs[92]["seq"] == 93
    assert recs[92]["hash"] == g5.BATCH1_HEAD_HASH
    assert recs[93]["seq"] == 94
    raw_lines = [json.loads(ln) for ln in (ART / "trial_registry.jsonl").read_text().splitlines() if ln.strip()]
    assert raw_lines[92]["hash"] == g5.BATCH1_HEAD_HASH
    assert raw_lines[93]["prev_hash"] == g5.BATCH1_HEAD_HASH


def test_open_registry_refuses_tampered_batch1_without_unlinking_file(tmp_path):
    g5 = _load_script("g5_statistical_validity")
    p = tmp_path / "trial_registry.jsonl"
    reg = TrialRegistry(p)
    reg.record(
        TrialRecord(
            seq=1,
            recorded_at="2026-11-14T00:00:00Z",
            hypothesis="H1",
            params={"lookback": 3},
            window="train",
            sharpe=1.0,
            cum_net=0.1,
            cum_gross=0.2,
            cum_cost=0.1,
            break_even_multiple=2.0,
            mean_turnover=0.1,
            days=100,
            status="completed",
        )
    )
    dummy_df = pl.DataFrame({"day": [0, 1], "BTCUSDT": [100.0, 101.0]})
    dummy_panel = run_grid.Panel(dummy_df, dummy_df, dummy_df, dummy_df, dummy_df, dummy_df)

    with pytest.raises(RuntimeError, match="pinned"):
        g5.open_registry(
            {},
            dummy_panel,
            1,
            registry_path=p,
            batch1_count=1,
            batch1_head_hash="deadbeef" * 8,
        )
    # File MUST NOT have been unlinked!
    assert p.exists() and p.stat().st_size > 0


def test_h3_maker_flattens_delisted_positions_on_settlement_across_entire_maker_grid():
    from itertools import product
    from verification_lab.execution import market

    p_surv = run_grid.build_panel("SURVIVORSHIP_23")
    delisted_last = {
        dsym: int(p_surv.perp_close.select(["day", dsym]).drop_nulls()["day"].max())
        for dsym in L.DELISTED_4
        if dsym in p_surv.perp_close.columns
    }
    for lb, ent, ex, pf in product(
        h3.MAKER_GRID["lookback"],
        h3.MAKER_GRID["entry_annual_bps"],
        h3.MAKER_GRID["exit_annual_bps"],
        h3.MAKER_GRID["p_fill"],
    ):
        pos = h3.build_positions_maker(
            p_surv.basis, p_surv.funding, lookback=lb, entry_annual_bps=ent, exit_annual_bps=ex, p_fill=pf
        )
        syms = [c for c in pos.columns if c != "day"]
        perp_leg = pos.with_columns([-0.5 * pos[s] for s in syms])
        # Raises ValueError if any post-settlement (`day >= last_active_day + 2`) phantom position exists!
        cf = market.funding_cashflow(p_surv.funding, perp_leg, delisted_last_active_days=delisted_last)
        assert cf.shape[0] == pos.height

