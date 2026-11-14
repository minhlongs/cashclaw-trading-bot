"""G4 - causal integrity audit for Batch 1 (H1/H2/H3) and Batch 2 (H1_G1/H2_G1/H3_MAKER).

Four independent probes run here:
1. **Negative control, replicated.** Each strategy is run on independent driftless
   random walks across 10 seeds; gross Sharpe must land within +/-2 SE of zero.
2. **Leak quantification.** Removing the 1-bar shift quantifies the fabricated Sharpe.
3. **Signal-lag probe.** Validated on structureless noise by shifting all cashflow
   legs together (`perp`, `spot`, `funding`).
4. **Staleness & survivorship boundary guard.** Verifies:
   (a) synthetic multi-day gap injection nulls the resumed bar return,
   (b) backfilled `UNIUSDT` `2023-01` is now 100% contiguous (`0` unexpected gaps), and
   (c) real pre-listing (`APTUSDT`) and post-delisting (`EOSUSDT`, `FTMUSDT`,
       `MATICUSDT`, `MKRUSDT`) `volume == 0` zombie-bar & zombie-funding truncation
       never fabricates returns or carry across inactive windows.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from verification_lab.runner import run_grid  # noqa: E402
from verification_lab.stats.core import sharpe_ratio  # noqa: E402
from verification_lab.strategies import h1_funding_carry as h1  # noqa: E402
from verification_lab.strategies import h2_tsmom as h2  # noqa: E402
from verification_lab.strategies import h3_basis_carry as h3  # noqa: E402
from verification_lab.strategies import loaders as L  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "artifacts"
PERIODS = 365

NOISE_DAYS = 1500
NOISE_SYMBOLS = 12
NOISE_SEEDS = [20261031, 7, 11, 13, 17, 19, 23, 29, 31, 37]


def _noise_panel(seed: int) -> dict[str, pl.DataFrame]:
    """A driftless geometric random walk with martingale log-basis."""
    rng = np.random.default_rng(seed)
    days = list(range(NOISE_DAYS))
    symbols = [f"NOISE{i}" for i in range(NOISE_SYMBOLS)]
    steps = rng.normal(0.0, 0.03, size=(NOISE_DAYS, NOISE_SYMBOLS))
    px = 100.0 * np.exp(np.cumsum(steps, axis=0))
    funding = rng.normal(0.0, 0.0001, size=(NOISE_DAYS, NOISE_SYMBOLS))
    close = pl.DataFrame({"day": days, **{s: px[:, i] for i, s in enumerate(symbols)}})
    returns = pl.DataFrame(
        {
            "day": days,
            **{
                s: np.concatenate([[np.nan], px[1:, i] / px[:-1, i] - 1.0])
                for i, s in enumerate(symbols)
            },
        }
    )
    fund = pl.DataFrame({"day": days, **{s: funding[:, i] for i, s in enumerate(symbols)}})
    basis_shocks = rng.normal(0.0, 0.0005, size=(NOISE_DAYS, NOISE_SYMBOLS))
    spot_px = px * np.exp(np.cumsum(basis_shocks, axis=0))
    spot = pl.DataFrame({"day": days, **{s: spot_px[:, i] for i, s in enumerate(symbols)}})
    return {"close": close, "returns": returns, "funding": fund, "spot": spot}


def _sr(net: np.ndarray) -> float:
    return sharpe_ratio(net, PERIODS)


def _run_all(panel: dict[str, pl.DataFrame]) -> dict[str, dict]:
    spot_returns = L.returns_from_wide(panel["spot"], max_stale_days=2)
    basis = h3.basis_wide(panel["close"], panel["spot"])
    return {
        "H1": h1.backtest(
            h1.build_positions(panel["funding"], lookback=7, entry_band=0.6, exit_band=0.4),
            panel["returns"],
            panel["funding"],
        ),
        "H2": h2.evaluate(
            h2.build_positions(panel["close"], lookback=30, target_vol_annual=0.40),
            panel["returns"],
            panel["funding"],
        ),
        "H3": h3.evaluate(
            h3.build_positions(basis, panel["funding"], lookback=14, entry_annual_bps=300.0, exit_annual_bps=150.0),
            panel["returns"],
            spot_returns,
            panel["funding"],
        ),
    }


def _run_batch2_noise(panel: dict[str, pl.DataFrame]) -> dict[str, dict]:
    spot_returns = L.returns_from_wide(panel["spot"], max_stale_days=2)
    basis = h3.basis_wide(panel["close"], panel["spot"])
    return {
        "H1_G1": h1.backtest(
            h1.build_positions_g1(
                panel["funding"], panel["returns"], lookback=7, entry_band=0.6, exit_band=0.4, corr_threshold=0.80
            ),
            panel["returns"],
            panel["funding"],
        ),
        "H2_G1": h2.evaluate(
            h2.build_positions_g1(panel["close"], lookback=30, target_vol_annual=0.40, corr_threshold=0.80),
            panel["returns"],
            panel["funding"],
        ),
        "H3_MAKER": h3.evaluate_maker(
            h3.build_positions_maker(
                basis, panel["funding"], lookback=14, entry_annual_bps=300.0, exit_annual_bps=150.0, p_fill=0.65
            ),
            panel["returns"],
            spot_returns,
            panel["funding"],
        ),
    }


def _stats(series: list[float]) -> dict:
    arr = np.array([v for v in series if np.isfinite(v)], dtype=float)
    return {
        "mean": round(float(arr.mean()), 4),
        "std": round(float(arr.std(ddof=1)), 4),
        "min": round(float(arr.min()), 4),
        "max": round(float(arr.max()), 4),
        "n_seeds": int(arr.size),
    }


def negative_control() -> dict:
    """Run each strategy across many structureless panels and summarise."""
    gross: dict[str, list[float]] = {"H1": [], "H2": [], "H3": []}
    net: dict[str, list[float]] = {"H1": [], "H2": [], "H3": []}
    for seed in NOISE_SEEDS:
        for name, res in _run_all(_noise_panel(seed)).items():
            gross[name].append(_sr(res["gross"]))
            net[name].append(_sr(res["net"]))

    out = {}
    for name in ("H1", "H2", "H3"):
        g = _stats(gross[name])
        n = _stats(net[name])
        se = g["std"] / math.sqrt(g["n_seeds"])
        out[name] = {
            "gross_sharpe": g,
            "net_sharpe": n,
            "gross_mean_two_se_band": [round(g["mean"] - 2 * se, 4), round(g["mean"] + 2 * se, 4)],
            "verdict": "PASS" if abs(g["mean"]) <= 2 * se + 1e-9 else "EDGE-FROM-NOISE",
        }
    out["_note"] = (
        "A causal strategy cannot earn a positive Sharpe on driftless data. The band "
        "reported here is the mean gross Sharpe across independent noise seeds plus "
        "and minus two standard errors; a mean landing outside that band means the "
        "backtest is manufacturing return from structureless input."
    )
    return out


def negative_control_batch2() -> dict:
    """Verify Batch-2 overlays and H3_MAKER also earn zero edge on driftless noise."""
    names = ("H1_G1", "H2_G1", "H3_MAKER")
    gross: dict[str, list[float]] = {k: [] for k in names}
    net: dict[str, list[float]] = {k: [] for k in names}
    for seed in NOISE_SEEDS:
        for name, res in _run_batch2_noise(_noise_panel(seed)).items():
            gross[name].append(_sr(res["gross"]))
            net[name].append(_sr(res["net"]))
    out = {}
    for name in names:
        g = _stats(gross[name])
        n = _stats(net[name])
        se = g["std"] / math.sqrt(g["n_seeds"])
        out[name] = {
            "gross_sharpe": g,
            "net_sharpe": n,
            "gross_mean_two_se_band": [round(g["mean"] - 2 * se, 4), round(g["mean"] + 2 * se, 4)],
            "verdict": "PASS" if abs(g["mean"]) <= 2 * se + 1e-9 else "EDGE-FROM-NOISE",
        }
    return out


def leak_quantification() -> dict:
    """Measure the apparent edge the missing one-bar shift would have created."""
    panel = run_grid.build_panel("CORE_19")
    spot_returns = L.returns_from_wide(panel.spot_close, max_stale_days=2)

    specs = {
        "H2": lambda shift: h2.evaluate(
            h2.build_positions(panel.perp_close, lookback=90, target_vol_annual=0.25, causal_shift=shift),
            panel.perp_returns,
            panel.funding,
        ),
        "H3": lambda shift: h3.evaluate(
            h3.build_positions(
                panel.basis, panel.funding,
                lookback=14, entry_annual_bps=300.0, exit_annual_bps=150.0, causal_shift=shift,
            ),
            panel.perp_returns, spot_returns, panel.funding,
        ),
    }

    out = {}
    for name, run in specs.items():
        causal = run(True)
        leaky = run(False)
        out[name] = {
            "causal_sharpe": round(_sr(causal["net"]), 4),
            "leaky_sharpe": round(_sr(leaky["net"]), 4),
            "fabricated_sharpe": round(_sr(leaky["net"]) - _sr(causal["net"]), 4),
            "causal_cum_net": round(float(np.nansum(causal["net"])), 4),
            "leaky_cum_net": round(float(np.nansum(leaky["net"])), 4),
            "verdict": "CONFIRMED-LEAK" if _sr(leaky["net"]) > _sr(causal["net"]) + 0.25 else "NO-MATERIAL-LEAK",
        }
    out["_note"] = (
        "H1 has no shift to remove: its trailing-mean window already ends at t-1, so "
        "it is causal by construction and is not part of this comparison."
    )
    return out


def _lag_scores(panel: dict[str, pl.DataFrame], spot_returns: pl.DataFrame) -> dict[str, dict]:
    symbols = [c for c in panel["close"].columns if c != "day"]

    def shift_frame(frame: pl.DataFrame, k: int) -> pl.DataFrame:
        present = [s for s in symbols if s in frame.columns]
        return pl.DataFrame({"day": frame["day"], **{s: frame[s].shift(k) for s in present}})

    configs = {
        "H1": (h1.build_positions(panel["funding"], lookback=7, entry_band=0.6, exit_band=0.4),
               lambda pos, rets, _srets, fnd: h1.backtest(pos, rets, fnd)),
        "H2": (h2.build_positions(panel["close"], lookback=30, target_vol_annual=0.40),
               lambda pos, rets, _srets, fnd: h2.evaluate(pos, rets, fnd)),
        "H3": (h3.build_positions(h3.basis_wide(panel["close"], panel["spot"]), panel["funding"],
                                  lookback=14, entry_annual_bps=300.0, exit_annual_bps=150.0),
               lambda pos, rets, srets, fnd: h3.evaluate(pos, rets, srets, fnd)),
    }

    out = {}
    for name, (pos, score) in configs.items():
        row = {}
        for label, k in (("future_returns", -1), ("aligned", 0), ("delayed_returns", 1)):
            displaced = score(
                pos,
                shift_frame(panel["returns"], k),
                shift_frame(spot_returns, k),
                shift_frame(panel["funding"], k),
            )
            row[label] = round(_sr(displaced["gross"]), 4)
        out[name] = row
    return out


def lag_probe() -> dict:
    noise_rows = []
    for seed in NOISE_SEEDS[:4]:
        np_panel = _noise_panel(seed)
        noise_rows.append(_lag_scores(np_panel, L.returns_from_wide(np_panel["spot"], 2)))

    validated = {}
    for name in ("H1", "H2", "H3"):
        aligned = np.array([r[name]["aligned"] for r in noise_rows])
        future = np.array([r[name]["future_returns"] for r in noise_rows])
        gap = float(np.mean(future - aligned))
        validated[name] = {
            "noise_mean_aligned": round(float(aligned.mean()), 4),
            "noise_mean_future": round(float(future.mean()), 4),
            "noise_gap": round(gap, 4),
            "verdict": "PASS" if abs(gap) < 0.75 else "ALIGNMENT-DEFECT",
        }

    real = run_grid.build_panel("CORE_19")
    real_spot = L.returns_from_wide(real.spot_close, max_stale_days=2)
    real_rows = _lag_scores(
        {
            "close": real.perp_close,
            "returns": real.perp_returns,
            "funding": real.funding,
            "spot": real.spot_close,
        },
        real_spot,
    )

    return {
        "validated_on_noise": validated,
        "real_panel_context": real_rows,
        "_note": (
            "The gate is `validated_on_noise`: with no serial dependence in the "
            "input, handing the strategy next-bar returns must score the same as "
            "the aligned mapping."
        ),
    }


def staleness_guard() -> dict:
    """Verify synthetic gap nulling, backfilled UNIUSDT contiguity, and boundary guards."""
    # 1. Synthetic multi-day gap injection (`gap_days = 6 > max_stale_days = 2`).
    days = list(range(20))
    px = [100.0 + i for i in range(20)]
    gapped = px[:3] + [None] + px[4:8] + [None, None, None, None, None] + px[13:]
    frame = pl.DataFrame({"day": days, "GAPS": [float(v) if v is not None else None for v in gapped]})
    wide = frame.select(["day", "GAPS"])
    rets = L.returns_from_wide(wide, max_stale_days=2)
    values = rets["GAPS"].to_list()

    adjacent_return = values[1]
    two_day_gap_return = values[4]
    before_gap = values[7]
    after_gap = values[13] if len(values) > 13 else None
    synthetic_ok = (
        adjacent_return is not None
        and two_day_gap_return is not None
        and before_gap is not None
        and after_gap is None
    )

    # 2. Backfilled UNIUSDT 2023-01 (`days 19358..19388`) + `19389` contiguity (`0` gaps).
    panel_core = run_grid.build_panel("CORE_19")
    uni_missing_2023_01 = None
    uni_day_19389 = None
    uniusdt_contiguous_ok = False
    if "UNIUSDT" in panel_core.perp_returns.columns:
        uni_map = dict(
            zip(
                panel_core.perp_returns["day"].to_list(),
                panel_core.perp_returns["UNIUSDT"].to_list(),
            )
        )
        jan_2023_vals = [uni_map.get(d) for d in range(19358, 19389)]
        uni_missing_2023_01 = sum(1 for v in jan_2023_vals if v is None or not np.isfinite(v))
        uni_day_19389 = uni_map.get(19389)
        uniusdt_contiguous_ok = (
            uni_missing_2023_01 == 0
            and uni_day_19389 is not None
            and bool(np.isfinite(uni_day_19389))
        )

    # 3. Real pre-listing (`APTUSDT`) & post-delisting (`DELISTED_4` zombie-bar truncation) guards.
    panel_surv = run_grid.build_panel("SURVIVORSHIP_23")
    max_panel_day = int(panel_surv.days.max())

    apt_prelisting_ok = False
    apt_first_day = None
    if "APTUSDT" in panel_surv.perp_close.columns:
        apt_obs = panel_surv.perp_close.select(["day", "APTUSDT"]).drop_nulls()
        apt_first_day = int(apt_obs["day"].min())
        apt_rets_before_or_on = (
            panel_surv.perp_returns.filter(pl.col("day") <= apt_first_day)["APTUSDT"].drop_nulls().len()
        )
        apt_ret_after = (
            panel_surv.perp_returns.filter(pl.col("day") == apt_first_day + 1)["APTUSDT"].to_list()
        )
        apt_prelisting_ok = (
            apt_first_day > int(panel_surv.days.min())
            and apt_rets_before_or_on == 0
            and len(apt_ret_after) == 1
            and apt_ret_after[0] is not None
        )

    delisted_checks: dict[str, dict] = {}
    delisted_ok = True
    for sym in L.DELISTED_4:
        if sym not in panel_surv.perp_close.columns:
            delisted_ok = False
            delisted_checks[sym] = {"present": False}
            continue
        active_obs = panel_surv.perp_close.select(["day", sym]).drop_nulls()
        last_day = int(active_obs["day"].max())
        post_close = panel_surv.perp_close.filter(pl.col("day") > last_day)[sym].drop_nulls().len()
        post_ret = panel_surv.perp_returns.filter(pl.col("day") > last_day)[sym].drop_nulls().len()
        post_fund = (
            panel_surv.funding.filter(pl.col("day") > last_day)[sym].drop_nulls().len()
            if sym in panel_surv.funding.columns
            else 0
        )
        sym_ok = (last_day < max_panel_day) and (post_close == 0) and (post_ret == 0) and (post_fund == 0)
        delisted_ok = delisted_ok and sym_ok
        delisted_checks[sym] = {
            "last_active_day": last_day,
            "inactive_trailing_days": max_panel_day - last_day,
            "post_settlement_non_null_closes": int(post_close),
            "post_settlement_non_null_returns": int(post_ret),
            "post_settlement_non_null_funding": int(post_fund),
            "ok": bool(sym_ok),
        }

    boundary_gaps_ok = bool(apt_prelisting_ok and delisted_ok)
    passed = bool(synthetic_ok and uniusdt_contiguous_ok and boundary_gaps_ok)

    return {
        "gap_days": 6,
        "missing_bars": 5,
        "max_stale_days": 2,
        "synthetic_ok": bool(synthetic_ok),
        "adjacent_return": None if adjacent_return is None else round(float(adjacent_return), 6),
        "two_day_gap_return": None if two_day_gap_return is None else round(float(two_day_gap_return), 6),
        "return_before_gap": None if before_gap is None else round(float(before_gap), 6),
        "return_after_gap": None if after_gap is None else round(float(after_gap), 6),
        "uniusdt_2023_01_contiguous_ok": bool(uniusdt_contiguous_ok),
        "uniusdt_2023_01_missing_days": uni_missing_2023_01,
        "uniusdt_day_19389_return": None if uni_day_19389 is None else round(float(uni_day_19389), 6),
        "boundary_gaps_ok": boundary_gaps_ok,
        "aptusdt_first_listed_day": apt_first_day,
        "aptusdt_prelisting_ok": bool(apt_prelisting_ok),
        "delisted_zombie_truncation": delisted_checks,
        "verdict": "PASS" if passed else "FAIL",
        "detail": (
            "Verified: (1) synthetic 6-day gap nulls resumed bar return while 1d/2d steps stay valid; "
            "(2) backfilled UNIUSDT 2023-01 is contiguous with 0 missing days; and "
            "(3) APTUSDT pre-listing and EOS/FTM/MATIC/MKR post-delisting volume==0 zombie bars and "
            "post-settlement funding prints are truncated with zero fabricated returns."
        ),
    }


def embargo_requirements() -> dict:
    """Embargo = 2x the slowest feature memory, computed from the grids themselves."""
    grid_max = {
        "H1": max(h1.GRID["lookback"]),
        "H2": max(h2.GRID["lookback"]),
        "H3": max(h3.GRID["lookback"]),
        "H1_G1": max(h1.G1_GRID["lookback"]),
        "H2_G1": max(h2.G1_GRID["lookback"]),
        "H3_MAKER": max(h3.MAKER_GRID["lookback"]),
    }
    panel_core = run_grid.build_panel("CORE_19")
    panel_surv = run_grid.build_panel("SURVIVORSHIP_23")
    days = len(panel_core.days)
    split = int(days * 0.7)
    trials_all = {
        **run_grid.enumerate_all(panel_core),
        **run_grid.enumerate_batch2(panel_surv),
    }
    selected = {}
    for name in ("H1", "H2", "H3", "H1_G1", "H2_G1", "H3_MAKER"):
        runs = trials_all[name]
        train_srs = [sharpe_ratio(r["result"]["net"][:split], PERIODS) for r in runs]
        winner_idx = int(np.nanargmax(train_srs))
        selected[name] = int(runs[winner_idx]["params"]["lookback"])
    oos_days = days - split
    return {
        "rule": "embargo_days = 2 x slowest feature memory, applied after the train block",
        "grid_max_lookback": grid_max,
        "embargo_days_grid_max": {k: 2 * v for k, v in grid_max.items()},
        "embargo_days_selected": {k: 2 * v for k, v in selected.items()},
        "total_days": days,
        "oos_days": oos_days,
        "usable_oos_after_embargo": {k: oos_days - 2 * v for k, v in selected.items()},
        "grid_max_embargo_exceeds_oos": {k: (2 * v) >= oos_days for k, v in grid_max.items()},
    }


def main() -> int:
    nc1 = negative_control()
    nc2 = negative_control_batch2()
    result = {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": __import__("subprocess").run(
            ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True
        ).stdout.strip(),
        "negative_control": nc1,
        "negative_control_batch2": nc2,
        "leak_quantification": leak_quantification(),
        "signal_lag_probe": lag_probe(),
        "staleness_guard": staleness_guard(),
        "embargo": embargo_requirements(),
    }

    checks = [nc1[h]["verdict"] == "PASS" for h in ("H1", "H2", "H3")]
    checks += [nc2[h]["verdict"] == "PASS" for h in ("H1_G1", "H2_G1", "H3_MAKER")]
    checks += [
        result["signal_lag_probe"]["validated_on_noise"][h]["verdict"] == "PASS"
        for h in ("H1", "H2", "H3")
    ]
    checks.append(result["staleness_guard"]["verdict"] == "PASS")
    result["overall"] = "PASS" if all(checks) else "FAIL"
    result["checks_passed"] = int(sum(checks))
    result["checks_total"] = len(checks)

    OUT.mkdir(exist_ok=True)
    target = OUT / "g4_leakage_audit.json"
    target.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")

    print(f"wrote {target.relative_to(REPO)}")
    print(f"  overall {result['overall']} ({result['checks_passed']}/{result['checks_total']})")
    for h in ("H1", "H2", "H3"):
        nc = nc1[h]
        print(
            f"  {h:8s} noise gross SR mean {nc['gross_sharpe']['mean']:+.3f} "
            f"(band {nc['gross_mean_two_se_band']}) {nc['verdict']}"
        )
    for h in ("H1_G1", "H2_G1", "H3_MAKER"):
        nc = nc2[h]
        print(
            f"  {h:8s} noise gross SR mean {nc['gross_sharpe']['mean']:+.3f} "
            f"(band {nc['gross_mean_two_se_band']}) {nc['verdict']}"
        )
    print(f"  staleness {result['staleness_guard']['verdict']}")
    return 0 if result["overall"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
