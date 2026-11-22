#!/usr/bin/env python3
"""Independent G4 Causal Leakage & Survivorship Audit (Supreme Command #19).

Runs 50 seeded prefix-truncation invariance tests (seeds 0..49) on explicitly
labeled SYNTHETIC_SOFTWARE_TEST_FIXTURE multi-asset spot+perp+funding+delisted
panels, verifies all 10 adversarial leakage vectors are caught by the detector,
verifies purged/embargoed split invariants, and emits
artifacts/g4_independent_leakage_audit.json.
"""

from __future__ import annotations

import json
import math
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC_DIR = REPO_ROOT / "verification_lab" / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from verification_lab.strategies import h3_basis_carry  # noqa: E402

OUTPUT_PATH = REPO_ROOT / "artifacts" / "g4_independent_leakage_audit.json"
DATA_ORIGIN_SYNTHETIC = "SYNTHETIC_SOFTWARE_TEST_FIXTURE"


def generate_synthetic_panel(seed: int, n_bars: int = 80) -> list[dict[str, Any]]:
    """Deterministic multi-asset panel with a delisted symbol and a late-listed symbol."""
    rng = random.Random(seed)
    base_ts = 1_704_067_200_000
    day_ms = 86_400_000

    # 3 symbols: BTCUSDT (always active), EOSUSDT (delisted at bar 45), NEWUSDT (listed at bar 35)
    symbols = ["BTCUSDT", "EOSUSDT", "NEWUSDT"]
    prices = {"BTCUSDT": 40000.0, "EOSUSDT": 1.0, "NEWUSDT": 10.0}
    panel: list[dict[str, Any]] = []

    for t in range(n_bars):
        ts = base_ts + t * day_ms
        row: dict[str, Any] = {"bar": t, "ts_ms": ts, "assets": {}}
        for sym in symbols:
            listed = 0 if sym != "NEWUSDT" else 35
            delisted = 45 if sym == "EOSUSDT" else None
            active = (t >= listed) and (delisted is None or t < delisted)
            ret = rng.gauss(0.0005, 0.02)
            prices[sym] = max(0.01, prices[sym] * (1.0 + ret))
            funding = rng.gauss(0.0002, 0.0004)
            # Funding published at bar close + 1s; available_at_ms = ts + 1000
            row["assets"][sym] = {
                "active": active,
                "listed_bar": listed,
                "delisted_bar": delisted,
                "spot_close": round(prices[sym], 6),
                "perp_close": round(prices[sym] * (1.0 + funding), 6),
                "funding_8h": round(funding, 8),
                "funding_available_at_ms": ts + 1000,
                "eval_ts_ms": ts + 2000,
            }
        panel.append(row)
    return panel


def validate_monotonic_timestamps(panel: list[dict[str, Any]]) -> None:
    """Fail-closed ingestion guard rejecting non-monotonic or duplicate timestamps."""
    for idx in range(1, len(panel)):
        if panel[idx]["ts_ms"] <= panel[idx - 1]["ts_ms"]:
            raise ValueError("NON_MONOTONIC_TIMESTAMPS")


def _compute_causal_signal_unguarded(panel: list[dict[str, Any]], lookback: int = 10) -> list[float]:
    history: dict[str, list[float]] = {}
    outputs: list[float] = []
    for row in panel:
        active_scores: list[float] = []
        for sym in sorted(row["assets"].keys()):
            a = row["assets"][sym]
            if not a["active"]:
                continue
            if a["funding_available_at_ms"] > a["eval_ts_ms"]:
                continue
            hist = history.setdefault(sym, [])
            hist.append(a["funding_8h"])
            window = hist[-lookback:]
            active_scores.append(sum(window) / len(window))
        score = sum(active_scores) / len(active_scores) if active_scores else 0.0
        outputs.append(round(score, 10))
    return outputs


def compute_clean_causal_signal(panel: list[dict[str, Any]], lookback: int = 10) -> list[float]:
    """Strictly causal cross-sectional mean funding carry over active PIT symbols."""
    validate_monotonic_timestamps(panel)
    return _compute_causal_signal_unguarded(panel, lookback=lookback)


def compute_production_h3_maker_positions(
    panel: list[dict[str, Any]],
    *,
    lookback: int = 10,
    entry_annual_bps: float = 300.0,
    exit_annual_bps: float = 150.0,
    p_fill: float = 0.55,
) -> list[tuple[float, ...]]:
    """Run real production h3_basis_carry.basis_wide + build_positions_maker on a synthetic panel."""
    validate_monotonic_timestamps(panel)
    symbols = sorted(panel[0]["assets"].keys())
    days = [int(r["bar"]) for r in panel]
    spot_cols: dict[str, list[float | None]] = {"day": days}
    perp_cols: dict[str, list[float | None]] = {"day": days}
    fund_cols: dict[str, list[float | None]] = {"day": days}

    for sym in symbols:
        spot_cols[sym] = [
            float(r["assets"][sym]["spot_close"]) if r["assets"][sym]["active"] else None
            for r in panel
        ]
        perp_cols[sym] = [
            float(r["assets"][sym]["perp_close"]) if r["assets"][sym]["active"] else None
            for r in panel
        ]
        fund_cols[sym] = [
            float(r["assets"][sym]["funding_8h"])
            if (
                r["assets"][sym]["active"]
                and r["assets"][sym]["funding_available_at_ms"] <= r["assets"][sym]["eval_ts_ms"]
            )
            else None
            for r in panel
        ]

    spot_df = pl.DataFrame(spot_cols, schema={"day": pl.Int64, **{s: pl.Float64 for s in symbols}})
    perp_df = pl.DataFrame(perp_cols, schema={"day": pl.Int64, **{s: pl.Float64 for s in symbols}})
    fund_df = pl.DataFrame(fund_cols, schema={"day": pl.Int64, **{s: pl.Float64 for s in symbols}})

    basis_df = h3_basis_carry.basis_wide(perp_df, spot_df)
    pos_df = h3_basis_carry.build_positions_maker(
        basis_df,
        fund_df,
        lookback=lookback,
        entry_annual_bps=entry_annual_bps,
        exit_annual_bps=exit_annual_bps,
        p_fill=p_fill,
        causal_shift=True,
    )
    return [
        tuple(round(float(row[s]), 10) for s in symbols)
        for row in pos_df.sort("day").to_dicts()
    ]


def check_prefix_invariance(
    panel: list[dict[str, Any]],
    signal_fn: Any,
    truncation_points: list[int],
) -> tuple[bool, int | None]:
    full = signal_fn(panel)
    for t in truncation_points:
        pref = signal_fn(panel[:t])
        if pref != full[:t]:
            return False, t
    return True, None


def validate_purged_embargoed_split(
    n_bars: int,
    train_end: int,
    test_start: int,
    holding_horizon: int,
    purge_bars: int,
    embargo_bars: int,
) -> dict[str, Any]:
    gap = test_start - train_end
    label_overlap = gap < holding_horizon
    purge_ok = purge_bars >= holding_horizon
    embargo_ok = embargo_bars > 0
    gap_ok = gap >= (purge_bars + embargo_bars)
    return {
        "n_bars": n_bars,
        "train_end": train_end,
        "test_start": test_start,
        "holding_horizon": holding_horizon,
        "purge_bars": purge_bars,
        "embargo_bars": embargo_bars,
        "actual_gap": gap,
        "label_overlap_detected": label_overlap,
        "valid": (not label_overlap) and purge_ok and embargo_ok and gap_ok,
    }


def run_adversarial_leakage_suite(panel: list[dict[str, Any]]) -> list[dict[str, Any]]:
    truncs = [20, 40, 60]
    vectors: list[dict[str, Any]] = []

    # 1. Future candle leakage (shift(-1))
    def leaky_future_candle(p: list[dict[str, Any]]) -> list[float]:
        closes = [r["assets"]["BTCUSDT"]["spot_close"] for r in p]
        return [
            round(closes[i + 1] / closes[i] - 1.0, 10) if i + 1 < len(closes) else 0.0
            for i in range(len(closes))
        ]

    ok, fail_t = check_prefix_invariance(panel, leaky_future_candle, truncs)
    vectors.append(
        {
            "vector_id": "G4-LV-01",
            "name": "future_candle_leakage_shift_minus_1",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": not ok,
            "first_divergent_cutoff": fail_t,
        }
    )

    # 2. Rolling window leakage (centered window)
    def leaky_centered_window(p: list[dict[str, Any]]) -> list[float]:
        vals = [r["assets"]["BTCUSDT"]["funding_8h"] for r in p]
        out = []
        for i in range(len(vals)):
            lo = max(0, i - 2)
            hi = min(len(vals), i + 3)
            out.append(round(sum(vals[lo:hi]) / (hi - lo), 10))
        return out

    ok, fail_t = check_prefix_invariance(panel, leaky_centered_window, truncs)
    vectors.append(
        {
            "vector_id": "G4-LV-02",
            "name": "rolling_window_centered_leakage",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": not ok,
            "first_divergent_cutoff": fail_t,
        }
    )

    # 3. Future-fitted normalization (full-sample z-score)
    def leaky_full_sample_zscore(p: list[dict[str, Any]]) -> list[float]:
        vals = [r["assets"]["BTCUSDT"]["spot_close"] for r in p]
        mean = sum(vals) / len(vals)
        var = sum((x - mean) ** 2 for x in vals) / max(len(vals), 1)
        std = math.sqrt(var) or 1.0
        return [round((x - mean) / std, 10) for x in vals]

    ok, fail_t = check_prefix_invariance(panel, leaky_full_sample_zscore, truncs)
    vectors.append(
        {
            "vector_id": "G4-LV-03",
            "name": "future_fitted_normalization_zscore",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": not ok,
            "first_divergent_cutoff": fail_t,
        }
    )

    # 4. Funding availability mismatch (using funding before available_at_utc)
    # Construct a panel where bar 20 has funding_available_at_ms > eval_ts_ms and a huge funding spike
    delayed_panel = [
        {
            "bar": r["bar"],
            "ts_ms": r["ts_ms"],
            "assets": {
                sym: (
                    {
                        **a,
                        "funding_8h": 0.05,
                        "funding_available_at_ms": r["ts_ms"] + 60_000,
                        "eval_ts_ms": r["ts_ms"] + 2_000,
                    }
                    if (r["bar"] == 20 and sym == "BTCUSDT")
                    else dict(a)
                )
                for sym, a in r["assets"].items()
            },
        }
        for r in panel
    ]

    def leaky_ignore_funding_availability(p: list[dict[str, Any]], lookback: int = 10) -> list[float]:
        history: dict[str, list[float]] = {}
        outputs: list[float] = []
        for row in p:
            active_scores: list[float] = []
            for sym in sorted(row["assets"].keys()):
                a = row["assets"][sym]
                if not a["active"]:
                    continue
                hist = history.setdefault(sym, [])
                hist.append(a["funding_8h"])
                window = hist[-lookback:]
                active_scores.append(sum(window) / len(window))
            outputs.append(round(sum(active_scores) / len(active_scores) if active_scores else 0.0, 10))
        return outputs

    clean_delayed = compute_clean_causal_signal(delayed_panel)
    leaky_delayed = leaky_ignore_funding_availability(delayed_panel)
    # Also verify clean excludes the future-available bar (matches panel with BTCUSDT inactive at bar 20)
    vectors.append(
        {
            "vector_id": "G4-LV-04",
            "name": "funding_availability_mismatch",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": clean_delayed[20] != leaky_delayed[20] and clean_delayed != leaky_delayed,
            "first_divergent_cutoff": 20,
            "clean_signal_at_bar_20": clean_delayed[20],
            "leaky_signal_at_bar_20": leaky_delayed[20],
        }
    )

    # 5. Cross-sectional survivor selection (dropping delisted symbols retroactively)
    def leaky_survivor_only(p: list[dict[str, Any]]) -> list[float]:
        # Only keep symbols still active at the final bar of p
        survivors = [sym for sym, a in p[-1]["assets"].items() if a["active"]]
        out = []
        for r in p:
            vals = [r["assets"][s]["funding_8h"] for s in survivors if r["assets"][s]["active"]]
            out.append(round(sum(vals) / len(vals), 10) if vals else 0.0)
        return out

    ok, fail_t = check_prefix_invariance(panel, leaky_survivor_only, [40, 60])
    vectors.append(
        {
            "vector_id": "G4-LV-05",
            "name": "cross_sectional_survivor_selection",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": not ok,
            "first_divergent_cutoff": fail_t,
        }
    )

    # 6. Label overlap (overlapping forward returns across split boundary)
    overlap_check = validate_purged_embargoed_split(
        n_bars=80, train_end=50, test_start=52, holding_horizon=5, purge_bars=2, embargo_bars=1
    )
    vectors.append(
        {
            "vector_id": "G4-LV-06",
            "name": "label_overlap_across_split",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": not overlap_check["valid"] and overlap_check["label_overlap_detected"],
            "split_audit": overlap_check,
        }
    )

    # 7. Train/test embargo failure (zero embargo gap)
    zero_embargo = validate_purged_embargoed_split(
        n_bars=80, train_end=50, test_start=55, holding_horizon=5, purge_bars=5, embargo_bars=0
    )
    vectors.append(
        {
            "vector_id": "G4-LV-07",
            "name": "train_test_embargo_failure",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": not zero_embargo["valid"],
            "split_audit": zero_embargo,
        }
    )

    # 8. Incorrect point-in-time universe membership (future-listed asset included early)
    def leaky_include_prelisted(p: list[dict[str, Any]], lookback: int = 10) -> list[float]:
        history: dict[str, list[float]] = {}
        outputs: list[float] = []
        for row in p:
            scores: list[float] = []
            for sym in sorted(row["assets"].keys()):
                a = row["assets"][sym]
                # Leaky: ignores a["active"] / listed_bar, including NEWUSDT before bar 35
                hist = history.setdefault(sym, [])
                hist.append(a["funding_8h"])
                window = hist[-lookback:]
                scores.append(sum(window) / len(window))
            outputs.append(round(sum(scores) / len(scores) if scores else 0.0, 10))
        return outputs

    clean_pit = compute_clean_causal_signal(panel)
    leaky_pit = leaky_include_prelisted(panel)
    # Also verify production H3_MAKER assigns zero weight to NEWUSDT before listed_bar (bar 35)
    prod_pos = compute_production_h3_maker_positions(panel)
    # symbols sorted: ["BTCUSDT", "EOSUSDT", "NEWUSDT"] -> index 2 is NEWUSDT
    newusdt_pre_listing_zero = all(prod_pos[b][2] == 0.0 for b in range(35))
    vectors.append(
        {
            "vector_id": "G4-LV-08",
            "name": "incorrect_pit_universe_membership",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": (clean_pit[:35] != leaky_pit[:35]) and newusdt_pre_listing_zero,
            "first_divergent_cutoff": 0,
            "newusdt_pre_listing_zero_weight": newusdt_pre_listing_zero,
        }
    )

    # 9. Recursive indicator drift (non-causal backward-filled EMA)
    def leaky_backward_ema(p: list[dict[str, Any]]) -> list[float]:
        vals = [r["assets"]["BTCUSDT"]["spot_close"] for r in p]
        alpha = 0.2
        ema = vals[-1]
        rev: list[float] = []
        for v in reversed(vals):
            ema = alpha * v + (1.0 - alpha) * ema
            rev.append(round(ema, 10))
        rev.reverse()
        return rev

    ok, fail_t = check_prefix_invariance(panel, leaky_backward_ema, truncs)
    vectors.append(
        {
            "vector_id": "G4-LV-09",
            "name": "recursive_indicator_backward_ema_drift",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": not ok,
            "first_divergent_cutoff": fail_t,
        }
    )

    # 10. Data import ordering (unsorted ingestion rejected by monotonic guard; unguarded diverges)
    scrambled = list(reversed(panel))
    guard_rejected = False
    try:
        compute_clean_causal_signal(scrambled)
    except ValueError as exc:
        guard_rejected = "NON_MONOTONIC_TIMESTAMPS" in str(exc)

    clean_out = compute_clean_causal_signal(panel)
    unguarded_unsorted_out = _compute_causal_signal_unguarded(scrambled)
    vectors.append(
        {
            "vector_id": "G4-LV-10",
            "name": "data_import_ordering_corruption",
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "leakage_detected": guard_rejected and (unguarded_unsorted_out != clean_out),
            "monotonic_guard_rejected_unsorted": guard_rejected,
            "unguarded_processing_diverged": unguarded_unsorted_out != clean_out,
            "first_divergent_cutoff": 0,
        }
    )

    return vectors


def main() -> int:
    seed_results: list[dict[str, Any]] = []
    prod_h3_seed_results: list[dict[str, Any]] = []
    truncation_points = [15, 30, 45, 60, 75]
    for seed in range(50):
        panel = generate_synthetic_panel(seed=seed, n_bars=80)
        ok, fail_t = check_prefix_invariance(panel, compute_clean_causal_signal, truncation_points)
        seed_results.append({"seed": seed, "passed": ok, "first_divergent_cutoff": fail_t})

        prod_ok, prod_fail_t = check_prefix_invariance(
            panel, compute_production_h3_maker_positions, truncation_points
        )
        prod_h3_seed_results.append(
            {"seed": seed, "passed": prod_ok, "first_divergent_cutoff": prod_fail_t}
        )

    clean_passed = sum(1 for r in seed_results if r["passed"])
    prod_h3_passed = sum(1 for r in prod_h3_seed_results if r["passed"])

    # Adversarial detection on seed 0 panel
    adv_panel = generate_synthetic_panel(seed=0, n_bars=80)
    adversarial = run_adversarial_leakage_suite(adv_panel)
    adv_caught = sum(1 for v in adversarial if v["leakage_detected"])

    # Valid purged/embargoed split verification
    valid_split = validate_purged_embargoed_split(
        n_bars=2130,
        train_end=1491,
        test_start=1551,
        holding_horizon=30,
        purge_bars=30,
        embargo_bars=30,
    )

    all_passed = (
        (clean_passed == 50)
        and (prod_h3_passed == 50)
        and (adv_caught == 10)
        and valid_split["valid"]
    )

    report = {
        "gate": "G4_CAUSAL_LEAKAGE_AND_SURVIVORSHIP_AUDIT",
        "schema_version": "1.1.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "data_origin": DATA_ORIGIN_SYNTHETIC,
        "clean_causal_prefix_invariance": {
            "total_seeds": 50,
            "passed_seeds": clean_passed,
            "truncation_points": truncation_points,
            "all_passed": clean_passed == 50,
            "seed_results": seed_results,
        },
        "production_h3_maker_prefix_invariance": {
            "strategy_module": "verification_lab.strategies.h3_basis_carry.build_positions_maker",
            "total_seeds": 50,
            "passed_seeds": prod_h3_passed,
            "truncation_points": truncation_points,
            "all_passed": prod_h3_passed == 50,
            "seed_results": prod_h3_seed_results,
        },
        "adversarial_leakage_detection": {
            "total_vectors": len(adversarial),
            "detected_vectors": adv_caught,
            "all_detected": adv_caught == len(adversarial),
            "vectors": adversarial,
        },
        "purged_embargoed_split_verification": valid_split,
        "verdict": "PASS" if all_passed else "FAIL",
    }

    OUTPUT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"G4 leakage audit: clean={clean_passed}/50 prod_h3={prod_h3_passed}/50 "
        f"adversarial_caught={adv_caught}/10 split_valid={valid_split['valid']}"
    )
    return 0 if all_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
