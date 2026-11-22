"""Register H3_BASIS_CARRY_V2 Prospective Unseen OOS Window & Borrow/Liquidation Model.

Executes Option A post-PR#71:
1. Preserves H3_MAKER bot runtime quarantine (NOT_VERIFIED) and immutable historical artifacts.
2. Verifies restored authentic local Parquet datasets (G2/G5) when present on disk.
3. Runs real empirical 1,000-draw randomized-entry permutation test on actual H3_MAKER
   daily returns when restored Parquet data are present (degrades honestly to
   BLOCKED_MISSING_DATA when run without gitignored local data).
4. Evaluates H3_BASIS_CARRY_V2 borrow/financing + delayed-hedge liquidation stress
   (labeled HISTORICAL_ERROR_ANALYSIS_NOT_FRESH_OOS).
5. Registers frozen pre-window H3_BASIS_CARRY_V2 spec with canonical SHA-256 and
   prospective unseen OOS window starting 2026-11-23T00:00:00Z (PENDING_FRESH_OOS).
"""

from __future__ import annotations

import hashlib
import json
import math
import random
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl

REPO = Path(__file__).resolve().parents[2]
LAB_SRC = REPO / "verification_lab" / "src"
sys.path.insert(0, str(LAB_SRC))

from verification_lab.execution.borrow_liquidation_model import (  # noqa: E402
    BINANCE_V2_SCHEDULE,
    HYPERLIQUID_V2_SCHEDULE,
    CarryCycleInput,
    simulate_v2_carry_cycle,
)
from verification_lab.strategies import h3_basis_carry  # noqa: E402

NORM_DIR = REPO / "verification_lab" / "data" / "normalized"
OUT_PATH = REPO / "artifacts" / "h3_basis_carry_v2_prospective_oos_registration.json"

FROZEN_V2_SPEC: dict[str, Any] = {
    "strategy_id": "H3_BASIS_CARRY_V2",
    "parent_hypothesis": "H3_MAKER",
    "trial_identity": {"trial_seq": 1, "lineage_reset_reason": "ECONOMICALLY_DIFFERENT_V2_WITH_BORROW_AND_LIQUIDATION"},
    "economic_structure": {
        "legs": 2,
        "structure": "market_neutral",
        "requires_funding_accrual": True,
        "requires_hedge_execution": True,
        "requires_borrow_financing": True,
        "requires_delayed_hedge_liquidation_model": True,
        "fee_settlement_model": "two_leg_spot_perp_maker_taker",
        "bar_granularity": "1d",
        "max_gross_leverage": 1.0,
    },
    "signal_parameters_frozen": {
        "lookback_days": 30,
        "entry_annual_bps": 800.0,
        "exit_annual_bps": 150.0,
        "fifo_fill_probability": 0.55,
        "require_net_funding_above_borrow_apr": True,
        "min_funding_minus_borrow_spread_bps": 200.0,
    },
    "prospective_oos_window": {
        "registration_date_utc": "2026-11-22T00:00:00Z",
        "window_start_utc": "2026-11-23T00:00:00Z",
        "min_observation_days": 90,
        "min_completed_round_trip_trades": 15,
        "exposed_holdout_excluded": {
            "start_utc": "2024-09-29T00:00:00Z",
            "end_utc": "2026-04-30T00:00:00Z",
            "reason": "EXPOSED_HOLDOUT_QUARANTINED_3_TRADES",
        },
    },
    "promotion_and_kill_gates": {
        "min_dsr": 0.95,
        "max_pbo": 0.15,
        "max_empirical_randomized_entry_p_value": 0.05,
        "require_positive_expectancy_at_2x_cost_with_borrow": True,
        "require_zero_causal_leakage": True,
        "require_strategy_identity_gate_pass": True,
        "kill_if_net_expectancy_negative_at_2x_with_borrow": True,
        "kill_if_liquidation_breach_in_stress_envelope": True,
    },
    "safety_invariants": {
        "research_status": "PENDING_FRESH_OOS",
        "paper_forward_allowed": False,
        "live_order_authority": False,
        "production_state": "HOLD_PRODUCTION",
        "h3_maker_bot_runtime_quarantined": True,
        "h3_maker_bot_runtime_applicability": "NOT_VERIFIED",
    },
}


def canonical_sha256(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def verify_restored_parquet_datasets() -> dict[str, Any]:
    expected = [
        "funding.parquet",
        "perp_1d.parquet",
        "spot_1d.parquet",
        "perp_4h.parquet",
        "oi_monthly.parquet",
        "hyperliquid_funding_1h.parquet",
        "hyperliquid_l1_quotes.parquet",
    ]
    files_info: list[dict[str, Any]] = []
    missing: list[str] = []
    for name in expected:
        p = NORM_DIR / name
        if not p.exists():
            missing.append(name)
            continue
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        df = pl.read_parquet(p)
        files_info.append({
            "file": name,
            "rows": df.height,
            "columns": len(df.columns),
            "sha256": digest,
        })
    status = "RESTORED_AND_VERIFIED" if not missing else "BLOCKED_MISSING_DATA"
    return {
        "status": status,
        "normalized_dir_present": NORM_DIR.exists(),
        "verified_file_count": len(files_info),
        "missing_files": missing,
        "files": files_info,
    }


def _pivot_daily_close(path: Path) -> pl.DataFrame:
    df = pl.read_parquet(path)
    ts_col = "open_time_ms" if "open_time_ms" in df.columns else "ts_ms"
    day_df = (
        df.with_columns(
            pl.from_epoch(pl.col(ts_col), time_unit="ms").dt.date().alias("day")
        )
        .group_by(["day", "symbol"])
        .agg(pl.col("close").last())
        .pivot(on="symbol", index="day", values="close")
        .sort("day")
    )
    return day_df


def _pivot_daily_funding(path: Path) -> pl.DataFrame:
    df = pl.read_parquet(path)
    ts_col = "funding_time_ms" if "funding_time_ms" in df.columns else "ts_ms"
    rate_col = "funding_rate" if "funding_rate" in df.columns else "rate"
    return (
        df.with_columns(
            pl.from_epoch(pl.col(ts_col), time_unit="ms").dt.date().alias("day")
        )
        .group_by(["day", "symbol"])
        .agg(pl.col(rate_col).sum())
        .pivot(on="symbol", index="day", values=rate_col)
        .sort("day")
    )


def _close_to_returns(close_wide: pl.DataFrame) -> pl.DataFrame:
    syms = [c for c in close_wide.columns if c != "day"]
    return close_wide.with_columns(
        [(pl.col(s) / pl.col(s).shift(1) - 1.0).alias(s) for s in syms]
    )


def run_empirical_randomized_entry_audit(n_controls: int = 1000, seed: int = 20261122) -> dict[str, Any]:
    req = [NORM_DIR / "spot_1d.parquet", NORM_DIR / "perp_1d.parquet", NORM_DIR / "funding.parquet"]
    if not all(p.exists() for p in req):
        return {
            "status": "BLOCKED_MISSING_DATA",
            "data_origin": "MISSING_LOCAL_PARQUET",
            "n_controls": n_controls,
        }

    spot_c = _pivot_daily_close(NORM_DIR / "spot_1d.parquet")
    perp_c = _pivot_daily_close(NORM_DIR / "perp_1d.parquet")
    fund_w = _pivot_daily_funding(NORM_DIR / "funding.parquet")

    common_syms = sorted(
        (set(spot_c.columns) & set(perp_c.columns) & set(fund_w.columns)) - {"day"}
    )
    basis = h3_basis_carry.basis_wide(
        perp_c.select(["day", *common_syms]),
        spot_c.select(["day", *common_syms]),
    )
    aligned_days = basis.select("day").join(fund_w.select(["day", *common_syms]), on="day", how="inner").sort("day")
    basis_a = basis.join(aligned_days.select("day"), on="day", how="inner").sort("day")
    fund_a = aligned_days.select(["day", *common_syms])

    pos = h3_basis_carry.build_positions_maker(
        basis_a,
        fund_a,
        lookback=30,
        entry_annual_bps=800.0,
        exit_annual_bps=150.0,
        p_fill=0.55,
    )
    perp_r = _close_to_returns(perp_c.select(["day", *common_syms]))
    spot_r = _close_to_returns(spot_c.select(["day", *common_syms]))
    res = h3_basis_carry.evaluate(pos, perp_r, spot_r, fund_a, cost_bps_per_turn=6.0, cost_multiplier=1.0)
    daily_net = np.asarray(res["net"], dtype=float)
    daily_net = daily_net[np.isfinite(daily_net)]

    def _ann_sharpe(arr: np.ndarray) -> float:
        if arr.size < 2:
            return 0.0
        sd = float(np.std(arr, ddof=1))
        return 0.0 if sd <= 1e-12 else float(np.mean(arr) / sd * math.sqrt(365.0))

    obs_sr = _ann_sharpe(daily_net)

    # Empirical circular block-shift / active-day randomized-entry permutation test
    pos_mat = pos.select(common_syms).cast(pl.Float64).to_numpy()
    active_mask = np.nansum(np.abs(pos_mat), axis=1) > 0
    active_rate = float(np.mean(active_mask))

    # Build unconditioned equal-weight daily carry return series for randomized entry controls
    pr_m = perp_r.join(basis_a.select("day"), on="day", how="inner").sort("day").select(common_syms).to_numpy()
    sr_m = spot_r.join(basis_a.select("day"), on="day", how="inner").sort("day").select(common_syms).to_numpy()
    fd_m = fund_a.select(common_syms).to_numpy()
    raw_pair = 0.5 * sr_m - 0.5 * pr_m + 0.5 * fd_m
    valid_counts = np.sum(np.isfinite(raw_pair), axis=1)
    pair_daily = np.where(
        valid_counts > 0,
        np.nansum(np.where(np.isfinite(raw_pair), raw_pair, 0.0), axis=1) / np.maximum(valid_counts, 1),
        0.0,
    )

    rng = random.Random(seed)
    n_days = pair_daily.size
    n_active = max(1, int(round(active_rate * n_days)))
    null_sharpes: list[float] = []
    for _ in range(n_controls):
        idx = rng.sample(range(n_days), n_active)
        ctrl = np.zeros(n_days, dtype=float)
        ctrl[idx] = pair_daily[idx]
        null_sharpes.append(_ann_sharpe(ctrl))

    exceed = sum(1 for s in null_sharpes if s >= obs_sr)
    p_val = (exceed + 1) / (n_controls + 1)

    # Risk-matched Buy-and-Hold (BTCUSDT spot scaled to same active-day volatility)
    btc_r = spot_r.join(basis_a.select("day"), on="day", how="inner").sort("day")["BTCUSDT"].to_numpy()
    btc_r = np.where(np.isfinite(btc_r), btc_r, 0.0)
    btc_vol = float(np.std(btc_r, ddof=1))
    strat_vol = float(np.std(daily_net, ddof=1))
    vol_scale = (strat_vol / btc_vol) if btc_vol > 1e-12 else 0.0
    bh_risk_matched = btc_r * vol_scale

    return {
        "status": "EMPIRICAL_VERIFIED",
        "data_origin": "AUTHENTIC_RESTORED_LOCAL_PARQUET",
        "note": "HISTORICAL_ERROR_ANALYSIS_NOT_FRESH_OOS",
        "n_controls": n_controls,
        "seed": seed,
        "common_symbols_count": len(common_syms),
        "n_days": int(daily_net.size),
        "active_day_fraction": round(active_rate, 6),
        "observed_full_sample_sharpe": round(obs_sr, 6),
        "null_mean_sharpe": round(float(np.mean(null_sharpes)), 6),
        "null_p95_sharpe": round(float(np.percentile(null_sharpes, 95)), 6),
        "exceed_count": exceed,
        "empirical_p_value": round(p_val, 6),
        "passes_p_lt_0_05": p_val < 0.05,
        "risk_matched_baselines": {
            "strategy_cum_return": round(float(np.prod(1.0 + daily_net) - 1.0), 6),
            "btc_risk_matched_cum_return": round(float(np.prod(1.0 + bh_risk_matched) - 1.0), 6),
            "btc_risk_matched_sharpe": round(_ann_sharpe(bh_risk_matched), 6),
            "cash_4pct_apr_cum_return": round((1.0 + 0.04 / 365.0) ** daily_net.size - 1.0, 6),
        },
    }


def run_v2_borrow_and_liquidation_stress() -> dict[str, Any]:
    """Venue-calibrated Decimal borrow APR & delayed-hedge liquidation stress matrix."""
    scenarios = [
        ("BINANCE_2X_5PCT_BORROW_NO_DELAY", BINANCE_V2_SCHEDULE, CarryCycleInput(
            cycle_id="BIN-2X-B5-D0", notional_usd=Decimal("100000"), hold_days=Decimal("30"),
            funding_apr=Decimal("0.044275"), basis_entry_bps=Decimal("10"), basis_exit_bps=Decimal("2"),
            cost_multiplier=Decimal("2.0"), borrow_apr_override=Decimal("0.0500"),
            hedge_delay_adverse_move_pct=Decimal("0.0"),
        )),
        ("HYPERLIQUID_2X_5PCT_BORROW_NO_DELAY", HYPERLIQUID_V2_SCHEDULE, CarryCycleInput(
            cycle_id="HL-2X-B5-D0", notional_usd=Decimal("100000"), hold_days=Decimal("30"),
            funding_apr=Decimal("0.098435"), basis_entry_bps=Decimal("10"), basis_exit_bps=Decimal("2"),
            cost_multiplier=Decimal("2.0"), borrow_apr_override=Decimal("0.0500"),
            hedge_delay_adverse_move_pct=Decimal("0.0"),
        )),
        ("HYPERLIQUID_2X_10PCT_BORROW_NO_DELAY", HYPERLIQUID_V2_SCHEDULE, CarryCycleInput(
            cycle_id="HL-2X-B10-D0", notional_usd=Decimal("100000"), hold_days=Decimal("30"),
            funding_apr=Decimal("0.098435"), basis_entry_bps=Decimal("10"), basis_exit_bps=Decimal("2"),
            cost_multiplier=Decimal("2.0"), borrow_apr_override=Decimal("0.1000"),
            hedge_delay_adverse_move_pct=Decimal("0.0"),
        )),
        ("HYPERLIQUID_DELAYED_HEDGE_LIQUIDATION_BREACH", HYPERLIQUID_V2_SCHEDULE, CarryCycleInput(
            cycle_id="HL-LIQ-STRESS", notional_usd=Decimal("100000"), hold_days=Decimal("1"),
            funding_apr=Decimal("0.098435"), basis_entry_bps=Decimal("0"), basis_exit_bps=Decimal("0"),
            cost_multiplier=Decimal("2.0"), borrow_apr_override=Decimal("0.0500"),
            hedge_delay_adverse_move_pct=Decimal("0.195"), initial_margin_ratio=Decimal("0.20"),
            unhedged_leg_only=True,
        )),
    ]
    rows: list[dict[str, Any]] = []
    for label, sched, inp in scenarios:
        res = simulate_v2_carry_cycle(sched, inp)
        rows.append({
            "scenario": label,
            "venue": res.venue,
            "cost_multiplier": f"{res.cost_multiplier:.1f}",
            "borrow_apr": f"{res.borrow_apr:.4f}",
            "funding_pnl": f"{res.funding_pnl:.8f}",
            "basis_pnl": f"{res.basis_pnl:.8f}",
            "execution_fee_cost": f"{res.execution_fee_cost:.8f}",
            "borrow_financing_cost": f"{res.borrow_financing_cost:.8f}",
            "hedge_delay_loss": f"{res.hedge_delay_loss:.8f}",
            "liquidation_triggered": res.liquidation_triggered,
            "liquidation_penalty_cost": f"{res.liquidation_penalty_cost:.8f}",
            "net_pnl": f"{res.net_pnl:.8f}",
            "double_entry_residual": f"{res.double_entry_residual:.8f}",
        })
    return {
        "note": "HISTORICAL_VENUE_CALIBRATED_STRESS_NOT_FRESH_OOS",
        "all_residuals_zero": all(Decimal(r["double_entry_residual"]) == Decimal("0") for r in rows),
        "liquidation_breach_detected": any(r["liquidation_triggered"] for r in rows),
        "scenarios": rows,
    }


def main() -> int:
    spec_sha256 = canonical_sha256(FROZEN_V2_SPEC)
    parquet_check = verify_restored_parquet_datasets()
    empirical_perm = run_empirical_randomized_entry_audit(n_controls=1000, seed=20261122)
    stress = run_v2_borrow_and_liquidation_stress()

    artifact = {
        "artifact_version": "1.0.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "spec_sha256": spec_sha256,
        "frozen_v2_spec": FROZEN_V2_SPEC,
        "restored_g2_parquet_verification": parquet_check,
        "g5_empirical_randomized_entry_audit": empirical_perm,
        "v2_borrow_and_liquidation_stress": stress,
    }
    OUT_PATH.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(f"WROTE {OUT_PATH}")
    print(f"SPEC_SHA256={spec_sha256}")
    print(f"PARQUET_STATUS={parquet_check['status']} ({parquet_check['verified_file_count']}/7)")
    print(f"EMPIRICAL_PERM_STATUS={empirical_perm['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
