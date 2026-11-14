"""Millisecond L2 `bookDepth` + `perp/spot aggTrades` FIFO calibration script for `H3_MAKER`.

Downloads (or replays `--offline` from `verification_lab/data/raw/tick_calibration/`) SHA-256
`.CHECKSUM`-verified daily archives from `data.binance.vision` across:
* 5 actual `H3_MAKER` train rebalance dates (`<= 2024-12`, zero OOS leakage) spanning
  `BNBUSDT`, `UNIUSDT`, `LINKUSDT`, and `FILUSDT` (`~16.2 MB`), and
* 2 locked-OOS `BNBUSDT` rebalance dates (`2025-07-26`, `2026-03-06`, `~16.0 MB`, reported
  in a strictly isolated holdout verification block and NEVER fed back into train bounds).

Emits `artifacts/h3_maker_tick_queue_calibration.json`.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from verification_lab.execution import maker_queue, spread as spread_mod  # noqa: E402
from verification_lab.execution.tick_fifo_calibrator import (  # noqa: E402
    RebalanceSampleSpec,
    fetch_verified_vision_zip,
    parse_agg_trades_zip,
    parse_book_depth_zip,
    simulate_rebalance_day,
    summarise_calibration_split,
)

REPO = Path(__file__).resolve().parents[2]
CACHE_ROOT = REPO / "verification_lab" / "data" / "raw" / "tick_calibration"
OUT_PATH = REPO / "artifacts" / "h3_maker_tick_queue_calibration.json"
G6_PATH = REPO / "artifacts" / "g6_execution_tca.json"

TRAIN_SAMPLES: tuple[RebalanceSampleSpec, ...] = (
    RebalanceSampleSpec("train", "BNBUSDT", "2023-10-17", "entry", 0.5500),
    RebalanceSampleSpec("train", "BNBUSDT", "2023-10-18", "entry", 0.2475),
    RebalanceSampleSpec("train", "UNIUSDT", "2023-11-12", "entry", 0.0786),
    RebalanceSampleSpec("train", "LINKUSDT", "2024-04-28", "exit", -0.0262),
    RebalanceSampleSpec("train", "FILUSDT", "2024-06-08", "entry", 0.2750),
)

LOCKED_OOS_SAMPLES: tuple[RebalanceSampleSpec, ...] = (
    RebalanceSampleSpec("locked_oos", "BNBUSDT", "2025-07-26", "entry", 0.2475),
    RebalanceSampleSpec("locked_oos", "BNBUSDT", "2026-03-06", "entry", 0.5500),
)


def _git_commit() -> str:
    return subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True
    ).stdout.strip()


def run_calibration(*, offline: bool = False, cache_root: Path = CACHE_ROOT) -> dict[str, Any]:
    provenance: list[dict[str, Any]] = []
    train_days: list[dict[str, Any]] = []
    oos_days: list[dict[str, Any]] = []

    for spec in (*TRAIN_SAMPLES, *LOCKED_OOS_SAMPLES):
        bd_bytes, bd_meta = fetch_verified_vision_zip(
            "perp_book_depth", spec.symbol, spec.date, cache_root, offline=offline
        )
        pa_bytes, pa_meta = fetch_verified_vision_zip(
            "perp_agg_trades", spec.symbol, spec.date, cache_root, offline=offline
        )
        sa_bytes, sa_meta = fetch_verified_vision_zip(
            "spot_agg_trades", spec.symbol, spec.date, cache_root, offline=offline
        )
        provenance.extend([bd_meta, pa_meta, sa_meta])

        book_depth = parse_book_depth_zip(bd_bytes, symbol=spec.symbol)
        perp_stream = parse_agg_trades_zip(pa_bytes, symbol=spec.symbol, leg="perp")
        spot_stream = parse_agg_trades_zip(sa_bytes, symbol=spec.symbol, leg="spot")

        day_res = simulate_rebalance_day(
            spec,
            book_depth=book_depth,
            perp_stream=perp_stream,
            spot_stream=spot_stream,
        )
        if spec.split == "train":
            train_days.append(day_res)
        else:
            oos_days.append(day_res)

    train_summary = summarise_calibration_split(train_days, split_name="train")
    oos_summary = summarise_calibration_split(oos_days, split_name="locked_oos")

    coarse_cs_ceiling = 24.8772
    if G6_PATH.exists():
        try:
            g6_prev = json.loads(G6_PATH.read_text(encoding="utf-8"))
            coarse_cs_ceiling = float(
                g6_prev.get("spread_band", {}).get("ceiling_half_spread_bps", coarse_cs_ceiling)
            )
        except (OSError, ValueError, TypeError):
            pass

    total_bytes = sum(int(p["bytes"]) for p in provenance)
    all_checksums_ok = all(bool(p["checksum_verified"]) for p in provenance)

    # Derive train-only floor / ceiling bounds for G6 `tick_calibrated_h3_maker` (zero OOS input).
    train_floor_adv = round(
        max(0.25, float(train_summary["empirical_adverse_selection_bps"])), 4
    )
    train_ceil_adv = round(
        max(train_floor_adv, float(train_summary["empirical_adverse_selection_ceiling_bps"])), 4
    )
    train_floor_miss = round(float(train_summary["empirical_p_leg_miss"]), 4)
    train_ceil_miss = round(
        max(train_floor_miss, float(train_summary["empirical_p_leg_miss_ceiling"])), 4
    )
    train_floor_spread = round(
        float(train_summary["empirical_emergency_taker_half_spread_bps"]), 4
    )
    train_ceil_spread = round(
        max(train_floor_spread, float(train_summary["empirical_emergency_taker_ceiling_half_spread_bps"])),
        4,
    )

    return {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": _git_commit(),
        "strategy_id": "H3_MAKER",
        "methodology": {
            "simulator": "verification_lab.execution.tick_fifo_calibrator (HftBacktest FIFO queue & two-leg sync physics)",
            "capital_usd": 1_000_000.0,
            "twap_slices_per_rebalance_day": 24,
            "passive_slice_clip_usd_band": [25_000.0, 50_000.0],
            "passive_quoting_horizon_sec": 300,
            "sensitivity_passive_horizon_sec": 900,
            "synchronized_hedge_window_sec": 30,
            "hedge_window_sensitivity_sec": [5, 10, 30, 60],
            "markout_horizons_sec": [1, 5, 10, 30, 60],
            "zero_oos_leakage_invariant": (
                "All train calibration dates are <= 2024-12-31 (strictly inside train split 0..1491). "
                "Locked-OOS dates (>= 2025-07-26) are evaluated once for out-of-sample microstructure "
                "verification and NEVER enter train_calibrated_bounds."
            ),
        },
        "provenance": {
            "source": "https://data.binance.vision/data (futures/um bookDepth + futures/um aggTrades + spot aggTrades)",
            "cache_dir": "verification_lab/data/raw/tick_calibration",
            "n_archives": len(provenance),
            "total_archive_bytes": total_bytes,
            "total_archive_mb": round(total_bytes / 1e6, 3),
            "all_sha256_checksums_verified": all_checksums_ok,
            "files": provenance,
        },
        "train_calibration": {
            "summary": train_summary,
            "days": train_days,
        },
        "locked_oos_verification": {
            "summary": oos_summary,
            "days": oos_days,
        },
        "train_calibrated_bounds_for_g6": {
            "empirical_p_fill": train_summary["empirical_p_fill"],
            "empirical_p_fill_900s": train_summary["empirical_p_fill_900s"],
            "floor": {
                "adverse_selection_bps": train_floor_adv,
                "p_leg_miss": train_floor_miss,
                "emergency_taker_half_spread_bps": train_floor_spread,
            },
            "ceiling": {
                "adverse_selection_bps": train_ceil_adv,
                "p_leg_miss": train_ceil_miss,
                "emergency_taker_half_spread_bps": train_ceil_spread,
            },
            "prior_analytic_band_reference": {
                "adverse_selection_bps": [
                    maker_queue.ADVERSE_SELECTION_FLOOR_BPS,
                    maker_queue.ADVERSE_SELECTION_CEILING_BPS,
                ],
                "p_leg_miss": [maker_queue.LEG_MISS_FLOOR, maker_queue.LEG_MISS_CEILING],
                "ohlcv_corwin_schultz_half_spread_bps": [
                    spread_mod.AUDIT_LIQUID_HALF_SPREAD_BPS,
                    coarse_cs_ceiling,
                ],
                "ceiling_overstatement_ratio_vs_tick_median": round(
                    coarse_cs_ceiling / max(0.01, train_floor_spread), 2
                ),
            },
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Replay strictly from cached SHA-256-verified zips under verification_lab/data/raw/tick_calibration",
    )
    args = parser.parse_args(argv)

    payload = run_calibration(offline=args.offline)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    tr = payload["train_calibration"]["summary"]
    oos = payload["locked_oos_verification"]["summary"]
    b = payload["train_calibrated_bounds_for_g6"]
    print(f"wrote {OUT_PATH.relative_to(REPO)} ({payload['provenance']['total_archive_mb']} MB across {payload['provenance']['n_archives']} verified zips)")
    print(
        f"  TRAIN ({tr['n_rebalance_days']}d): p_fill={tr['empirical_p_fill']} (900s={tr['empirical_p_fill_900s']}), "
        f"adv_sel={tr['empirical_adverse_selection_bps']}..{tr['empirical_adverse_selection_ceiling_bps']} bps, "
        f"p_leg_miss={tr['empirical_p_leg_miss']}..{tr['empirical_p_leg_miss_ceiling']}, "
        f"tick_half_spread={tr['empirical_emergency_taker_half_spread_bps']}..{tr['empirical_emergency_taker_ceiling_half_spread_bps']} bps "
        f"(vs 24.8772 bps 4h Corwin-Schultz)"
    )
    print(
        f"  LOCKED_OOS ({oos['n_rebalance_days']}d): p_fill={oos['empirical_p_fill']} (900s={oos['empirical_p_fill_900s']}), "
        f"adv_sel={oos['empirical_adverse_selection_bps']}..{oos['empirical_adverse_selection_ceiling_bps']} bps, "
        f"p_leg_miss={oos['empirical_p_leg_miss']}..{oos['empirical_p_leg_miss_ceiling']}, "
        f"tick_half_spread={oos['empirical_emergency_taker_half_spread_bps']}..{oos['empirical_emergency_taker_ceiling_half_spread_bps']} bps"
    )
    print(f"  G6 train bounds: floor={b['floor']} | ceiling={b['ceiling']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
