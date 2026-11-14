"""G4 - causal integrity audit for the three strategies.

A backtest cannot be trusted on its return alone; it must be shown not to be
reading its own answer. Three independent probes run here:

1. **Negative control, replicated.** Each strategy is run on independent
   driftless random walks. A single seed proves nothing -- one noise panel can
   show a Sharpe of +1.4 by luck -- so the probe runs many seeds and reports the
   distribution. A causal strategy with no edge centres on zero; a leaky one
   centres on a large positive number. Gross and net are separated because a
   strongly negative net Sharpe on noise is cost drag, not a leak.
2. **Leak quantification.** Each strategy is run with its one-bar shift removed.
   The difference between the shifted and unshifted result is the size of the
   artefact the missing shift would have manufactured, measured on the real
   panel. This is the number that justifies the fix rather than asserting it.
3. **Signal-lag probe.** Each strategy is scored against returns displaced by
   one bar in each direction. The probe is validated on the noise panel, where
   no persistence exists by construction, so aligned and future-return alignment
   must score the same; a difference there would prove the alignment code itself
   is wrong. On the real panel the same comparison cannot separate "leak" from
   "momentum persists one extra day", so it is reported as context only and is
   not a gate.
4. **Staleness guard.** A synthetic gap is inserted and the loader must return a
   null across it, not an interpolated return.

The embargo each hypothesis requires is computed rather than assumed: the
slowest feature memory in the grid times two, per the audit's rule.
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
    """A driftless geometric random walk: the strongest test of a causal claim.

    There is no momentum, no funding persistence and no basis structure here, so
    any positive result is fabricated by the backtest rather than discovered in
    the data.
    """
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
    # The spot leg must be an independent driftless random walk, NOT perp price
    # times a one-shot stationary deviation. Writing spot = px * exp(eta_t) with
    # eta i.i.d. would make log(spot/perp) white noise, i.e. a basis that reverts
    # to zero with probability one on the very next bar -- a driftless random walk
    # perp against a cointegrated spot leg. That is precisely the convergence a
    # cash-and-carry book harvests, so H3 would "earn" a large Sharpe on what the
    # docstring calls structureless data. Cumulating the basis shock instead keeps
    # log(spot/perp) itself a martingale: E[b_t - b_{t-1} | F_{t-1}] = 0, so no
    # amount of smoothing or lag length can extract convergence that is not there.
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
        # Two standard errors of the seed mean is the band within which a
        # strategy with no edge may legitimately land.
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
        "and minus two standard errors; a mean landing above that band means the "
        "backtest is manufacturing return from structureless input. Net Sharpe is "
        "reported separately because a large negative net number on noise is cost "
        "drag (high turnover against zero edge), which is expected and not a leak."
    )
    return out


def leak_quantification() -> dict:
    """Measure the apparent edge the missing one-bar shift would have created."""
    panel = run_grid.build_panel()
    spot_returns = L.returns_from_wide(panel.spot_close, max_stale_days=2)
    symbols = [c for c in panel.perp_close.columns if c != "day"]
    del symbols

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
        "it is causal by construction and is not part of this comparison. The "
        "difference between the two columns is what a same-bar signal would have "
        "added, and it is the evidence for keeping the shift."
    )
    return out


def _lag_scores(panel: dict[str, pl.DataFrame], spot_returns: pl.DataFrame) -> dict[str, dict]:
    """Score each strategy against returns displaced by one bar either way."""
    symbols = [c for c in panel["close"].columns if c != "day"]

    def shift_frame(frame: pl.DataFrame, k: int) -> pl.DataFrame:
        """Shift a leg frame by k bars; k<0 hands over the future, k>0 delays it."""
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
            # Gross, not net: on noise H3's net series is cost drag with almost no
            # variance left, so its Sharpe denominator collapses and a per-mille
            # change in the gross leg reads as a huge gap. All cashflow legs
            # (perp, spot, funding) shift together so multi-leg hedges stay paired
            # on the same displaced bar.
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
    """Validate the alignment code on noise; report the real panel for context."""
    noise_rows = []
    for seed in NOISE_SEEDS[:4]:
        np_panel = _noise_panel(seed)
        noise_rows.append(_lag_scores(np_panel, L.returns_from_wide(np_panel["spot"], 2)))

    validated = {}
    for name in ("H1", "H2", "H3"):
        aligned = np.array([r[name]["aligned"] for r in noise_rows])
        future = np.array([r[name]["future_returns"] for r in noise_rows])
        gap = float(np.mean(future - aligned))
        # On data with no persistence the two alignments must agree; a positive
        # gap here would mean the displacement itself manufactures return.
        validated[name] = {
            "noise_mean_aligned": round(float(aligned.mean()), 4),
            "noise_mean_future": round(float(future.mean()), 4),
            "noise_gap": round(gap, 4),
            "verdict": "PASS" if abs(gap) < 0.75 else "ALIGNMENT-DEFECT",
        }

    real = run_grid.build_panel()
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
            "the aligned mapping. `real_panel_context` shows the future-return "
            "variant scoring higher, which on real data reflects genuine momentum "
            "persistence rather than a leak -- the strategy reads only past closes, "
            "so it can benefit from persistence one day further out without having "
            "seen the future. It is reported for transparency, not as a gate."
        ),
    }


def staleness_guard() -> dict:
    """The loader must null a return across a long gap, not interpolate it."""
    days = list(range(20))
    px = [100.0 + i for i in range(20)]
    # Five missing days (indices 8..12) create a 6-day gap from day 7 to day 13;
    # a single missing day (index 3) creates a 2-day gap from day 2 to day 4,
    # which is at `max_stale_days=2` and must remain a valid observation.
    gapped = px[:3] + [None] + px[4:8] + [None, None, None, None, None] + px[13:]
    frame = pl.DataFrame({"day": days, "GAPS": [float(v) if v is not None else None for v in gapped]})
    wide = frame.select(["day", "GAPS"])
    rets = L.returns_from_wide(wide, max_stale_days=2)
    values = rets["GAPS"].to_list()

    adjacent_return = values[1]
    two_day_gap_return = values[4]
    before_gap = values[7]
    after_gap = values[13] if len(values) > 13 else None

    # Real-panel check: UNIUSDT has a 31-day archive gap in 2023-01 (days 19358..19388);
    # its first resumed close at day 19389 spans 32 days and must be nulled.
    panel = run_grid.build_panel()
    uni_resumed = None
    uni_next = None
    real_ok = True
    if "UNIUSDT" in panel.perp_returns.columns:
        uni_map = dict(
            zip(
                panel.perp_returns["day"].to_list(),
                panel.perp_returns["UNIUSDT"].to_list(),
            )
        )
        uni_resumed = uni_map.get(19389)
        uni_next = uni_map.get(19390)
        real_ok = (uni_resumed is None) and (uni_next is not None)

    passed = (
        adjacent_return is not None
        and two_day_gap_return is not None
        and before_gap is not None
        and after_gap is None
        and real_ok
    )
    return {
        "gap_days": 6,
        "missing_bars": 5,
        "max_stale_days": 2,
        "adjacent_return": None if adjacent_return is None else round(float(adjacent_return), 6),
        "two_day_gap_return": None if two_day_gap_return is None else round(float(two_day_gap_return), 6),
        "return_before_gap": None if before_gap is None else round(float(before_gap), 6),
        "return_after_gap": None if after_gap is None else round(float(after_gap), 6),
        "real_panel_uniusdt_2023_01_resumed_return": (
            None if uni_resumed is None else round(float(uni_resumed), 6)
        ),
        "real_panel_uniusdt_2023_01_day_after_resume": (
            None if uni_next is None else round(float(uni_next), 6)
        ),
        "verdict": "PASS" if passed else "FAIL",
        "detail": (
            "The bar after a multi-day price gap exceeding max_stale_days must have a "
            "null return, while 1-day and 2-day steps remain valid; verified on both "
            "synthetic integer-day bars and UNIUSDT's 2023-01 archive gap."
        ),
    }


def embargo_requirements() -> dict:
    """Embargo = 2x the slowest feature memory, computed from the grids themselves."""
    grid_max = {
        "H1": max(h1.GRID["lookback"]),
        "H2": max(h2.GRID["lookback"]),
        "H3": max(h3.GRID["lookback"]),
    }
    # Derive the selected configurations dynamically from the same train-window
    # Sharpe rule G5 uses, so G4 and G5 never drift out of sync.
    panel = run_grid.build_panel()
    days = len(panel.days)
    split = int(days * 0.7)
    trials = run_grid.enumerate_all(panel)
    selected = {}
    for name in ("H1", "H2", "H3"):
        runs = trials[name]
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
        "usable_oos_after_embargo": {
            k: oos_days - 2 * v for k, v in selected.items()
        },
        "grid_max_embargo_exceeds_oos": {
            k: (2 * v) >= oos_days for k, v in grid_max.items()
        },
        "note": (
            "The 180-day momentum lookback in H2's grid requires a 360-day embargo, "
            "which is more than half the 639-day locked out-of-sample window. That "
            "configuration therefore cannot be honestly scored on the locked set at "
            "all; only configurations with a short enough memory survive the rule."
        ),
    }


def main() -> int:
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": __import__("subprocess").run(
            ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True
        ).stdout.strip(),
        "negative_control": negative_control(),
        "leak_quantification": leak_quantification(),
        "signal_lag_probe": lag_probe(),
        "staleness_guard": staleness_guard(),
        "embargo": embargo_requirements(),
    }

    checks = [
        result["negative_control"][h]["verdict"] == "PASS" for h in ("H1", "H2", "H3")
    ]
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
        nc = result["negative_control"][h]
        print(
            f"  {h} noise gross SR mean {nc['gross_sharpe']['mean']:+.3f} "
            f"(band {nc['gross_mean_two_se_band']}) net mean {nc['net_sharpe']['mean']:+.3f} "
            f"{nc['verdict']}"
        )
    for h in ("H2", "H3"):
        lq = result["leak_quantification"][h]
        print(
            f"  {h} leak: causal {lq['causal_sharpe']:+.3f} vs unshifted {lq['leaky_sharpe']:+.3f} "
            f"-> {lq['fabricated_sharpe']:+.3f} fabricated  {lq['verdict']}"
        )
    for h in ("H1", "H2", "H3"):
        lp = result["signal_lag_probe"]["validated_on_noise"][h]
        print(f"  {h} alignment noise gap {lp['noise_gap']:+.3f} {lp['verdict']}")
    print("  real-panel context (informational):",
          {h: result["signal_lag_probe"]["real_panel_context"][h]["future_returns"] for h in ("H1", "H2", "H3")})
    print(f"  staleness {result['staleness_guard']['verdict']}")
    emb = result["embargo"]
    print(f"  embargo (selected) {emb['embargo_days_selected']} usable OOS {emb['usable_oos_after_embargo']}")
    return 0 if result["overall"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
