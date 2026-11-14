"""G5 - statistical validity: DSR, PBO, CPCV, MinTRL, WRC & 7-Regime Attribution.

Evaluates both Batch 1 (`H1`, `H2`, `H3` on `CORE_19`, `seq 1..93`) and the pre-registered
Batch 2 (`H1_G1`, `H2_G1`, `H3_MAKER` on `SURVIVORSHIP_23`, `seq 94..185`) against the
audit's statistical survival gates conditioned on the true cumulative trial count
`N_total` in the append-only hash-chained `artifacts/trial_registry.jsonl`.

Lines `1..93` of `artifacts/trial_registry.jsonl` (`seq 93` hash `0efe8164...`) are
verified intact and preserved forever; Batch 2 is appended once onto `seq 93`'s digest.
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from verification_lab.execution import market  # noqa: E402
from verification_lab.runner import run_grid  # noqa: E402
from verification_lab.runner.trial_registry import TrialRegistry  # noqa: E402
from verification_lab.stats import regimes as regimes_mod  # noqa: E402
from verification_lab.stats.core import (  # noqa: E402
    cpcv,
    deflated_sharpe,
    min_track_record_length,
    probability_of_backtest_overfitting,
    sharpe_ratio,
)
from verification_lab.stats.episodes import (  # noqa: E402,F401
    episode_pnls,
    trade_episodes,
    trade_expectancy,
)
from verification_lab.strategies import h1_funding_carry as h1  # noqa: E402
from verification_lab.strategies import h2_tsmom as h2  # noqa: E402
from verification_lab.strategies import h3_basis_carry as h3  # noqa: E402
from verification_lab.strategies import loaders as L  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "artifacts"
REGISTRY = OUT / "trial_registry.jsonl"
PERIODS = 365
TRAIN_FRACTION = 0.7

BATCH1_COUNT = 93
BATCH1_HEAD_HASH = "0efe8164eff07606be76d6b243a5d28cdce1ac265b546f4f442b1942768dca10"
BATCH2_NOTE = "batch2_issue59_survivorship23_g1_h3maker"

# Verbatim from the audit.
PBO_REJECT_AT = 0.1523
DSR_MIN = 0.95
PSR_MIN = 0.95
H1_NET_SHARPE_FLOOR = 0.80
COST_STRESS_MULTIPLE = 2.0
H1_TAIL_CORR_MAX = 0.50
PLATEAU_TOLERANCE_PCT = 25.0
TAIL_QUANTILE = 0.05
N_BOOTSTRAP = 2000
BOOTSTRAP_BLOCK = 20
BOOTSTRAP_SEED = 20261031
SPARSE_FLAT_THRESHOLD = 0.20


def psr(returns: np.ndarray, benchmark_sr_per_period: float = 0.0) -> dict:
    """Probabilistic Sharpe Ratio with skew and kurtosis correction."""
    x = np.asarray(returns, dtype=float)
    x = x[np.isfinite(x)]
    n = x.size
    if n < 30:
        return {"psr": float("nan"), "n": int(n), "note": "insufficient observations"}
    sd = x.std(ddof=1)
    if sd == 0:
        return {"psr": float("nan"), "n": int(n), "note": "zero variance"}
    sr = float(x.mean() / sd)
    skew = float(np.mean((x - x.mean()) ** 3) / sd**3)
    kurt = float(np.mean((x - x.mean()) ** 4) / sd**4)
    denom = 1.0 - skew * sr + (kurt - 1.0) / 4.0 * sr**2
    if denom <= 0:
        return {"psr": float("nan"), "n": int(n), "note": "degenerate denominator"}
    z = (sr - benchmark_sr_per_period) * math.sqrt(n - 1) / math.sqrt(denom)
    return {
        "psr": float(0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))),
        "sharpe_annualised": round(sr * math.sqrt(PERIODS), 4),
        "skew": round(skew, 4),
        "kurtosis": round(kurt, 4),
        "n": int(n),
    }


def sparse_diagnostic(returns: np.ndarray) -> dict:
    """How much of a Sharpe is annualisation over a mostly-flat series?"""
    x = np.asarray(returns, dtype=float)
    x = x[np.isfinite(x)]
    flat = int(np.sum(np.abs(x) < 1e-12))
    active = x[np.abs(x) >= 1e-12]
    frac = flat / x.size if x.size else 0.0
    out = {
        "days": int(x.size),
        "flat_days": flat,
        "flat_fraction": round(frac, 4),
        "sharpe_all_days": round(sharpe_ratio(x, PERIODS), 4),
        "sharpe_active_days_only": (
            round(sharpe_ratio(active, PERIODS), 4) if active.size >= 30 else None
        ),
        "sparse": bool(frac >= SPARSE_FLAT_THRESHOLD),
    }
    if out["sparse"]:
        out["interpretation"] = (
            "A substantial fraction of days are flat, diluting variance across inactive bars; "
            "compare against active-day Sharpe and annualised net return."
        )
    return out


def max_drawdown(net: np.ndarray) -> float:
    """Peak-to-trough drawdown of a fixed-notional (1.0 initial equity) net curve."""
    x = np.nan_to_num(np.asarray(net, dtype=float), nan=0.0)
    if x.size == 0:
        return 0.0
    equity = 1.0 + np.cumsum(x)
    peak = np.maximum.accumulate(np.concatenate([[1.0], equity]))[1:]
    with np.errstate(divide="ignore", invalid="ignore"):
        dd = np.where(peak > 0.0, (peak - equity) / peak, 0.0)
    return float(np.nanmax(dd)) if dd.size else 0.0


def compounded_max_drawdown(net: np.ndarray) -> float:
    """Peak-to-trough drawdown of a geometrically reinvested (`cumprod(1 + r)`) curve."""
    x = np.nan_to_num(np.asarray(net, dtype=float), nan=0.0)
    if x.size == 0:
        return 0.0
    factors = np.maximum(0.0, 1.0 + x)
    equity = np.cumprod(factors)
    peak = np.maximum.accumulate(np.concatenate([[1.0], equity]))[1:]
    with np.errstate(divide="ignore", invalid="ignore"):
        dd = np.where(peak > 0.0, (peak - equity) / peak, 0.0)
    return float(np.nanmax(dd)) if dd.size else 0.0


def calmar(net: np.ndarray) -> float:
    """Annualised net return divided by max drawdown."""
    x = np.asarray(net, dtype=float)
    x = x[np.isfinite(x)]
    if x.size == 0:
        return float("nan")
    dd = max_drawdown(x)
    if dd <= 0:
        return float("inf") if x.sum() > 0 else float("nan")
    return float(x.sum()) * PERIODS / x.size / dd


def block_bootstrap_ci(
    net: np.ndarray,
    positions: np.ndarray | None = None,
    *,
    n_boot: int = N_BOOTSTRAP,
    block: int = BOOTSTRAP_BLOCK,
    seed: int = BOOTSTRAP_SEED,
) -> dict:
    """Circular block bootstrap CIs for net Sharpe, Calmar and expectancy."""
    x = np.asarray(net, dtype=float)
    x = x[np.isfinite(x)]
    n = x.size
    if n < block * 2:
        return {"n": int(n), "note": "insufficient observations"}
    rng = np.random.default_rng(seed)
    n_blocks = int(math.ceil(n / block))
    offsets = np.arange(block)
    indep = np.empty((n_boot, 3))
    for b in range(n_boot):
        starts = rng.integers(0, n, size=n_blocks)
        idx = (starts[:, None] + offsets[None, :]).ravel()[:n] % n
        sample = x[idx]
        sd = sample.std(ddof=1)
        indep[b] = (
            sample.mean() / sd * math.sqrt(PERIODS) if sd > 0 else np.nan,
            calmar(sample),
            float(sample.sum()) * PERIODS / sample.size,
        )

    def interval(col: int, point: float) -> dict:
        values = indep[:, col]
        values = values[np.isfinite(values)]
        if values.size == 0:
            return {
                "point": round(point, 4) if math.isfinite(point) else None,
                "n_valid": 0,
                "ci90": [None, None],
                "ci95": [None, None],
                "median": None,
            }
        return {
            "point": round(point, 4) if math.isfinite(point) else None,
            "n_valid": int(values.size),
            "ci90": [
                round(float(np.percentile(values, 5)), 4),
                round(float(np.percentile(values, 95)), 4),
            ],
            "ci95": [
                round(float(np.percentile(values, 2.5)), 4),
                round(float(np.percentile(values, 97.5)), 4),
            ],
            "median": round(float(np.median(values)), 4),
        }

    sharpe_iv = interval(0, float(sharpe_ratio(x, PERIODS)))
    out = {
        "n_days": int(n),
        "n_bootstrap": int(n_boot),
        "block_days": int(block),
        "sharpe": sharpe_iv,
        "calmar": interval(1, calmar(x)),
        "annualised_net_return": interval(2, float(x.sum()) * PERIODS / x.size),
        "point": sharpe_iv["point"],
        "ci90": sharpe_iv["ci90"],
        "ci95": sharpe_iv["ci95"],
    }

    if positions is not None:
        pnl = episode_pnls(net, positions)
        if pnl.size >= 10:
            draws = rng.choice(pnl, size=(n_boot, pnl.size), replace=True).mean(axis=1)
            out["expectancy_per_trade"] = {
                "point": round(float(pnl.mean()), 6),
                "n_trades": int(pnl.size),
                "ci90": [
                    round(float(np.percentile(draws, 5)), 6),
                    round(float(np.percentile(draws, 95)), 6),
                ],
                "ci95": [
                    round(float(np.percentile(draws, 2.5)), 6),
                    round(float(np.percentile(draws, 97.5)), 6),
                ],
            }
    return out


def white_reality_check(
    matrix: np.ndarray,
    *,
    n_boot: int = 1000,
    block: int = BOOTSTRAP_BLOCK,
    seed: int = BOOTSTRAP_SEED,
) -> dict:
    """White's Reality Check: is the best-of-family result significant?"""
    m = np.asarray(matrix, dtype=float)
    m = np.nan_to_num(m, nan=0.0)
    n_strats, t = m.shape
    if n_strats < 2 or t < block * 2:
        return {"note": "insufficient data for a reality check"}

    def best(sample: np.ndarray) -> float:
        sd = sample.std(axis=1, ddof=1)
        with np.errstate(divide="ignore", invalid="ignore"):
            sr = np.where(sd > 0, sample.mean(axis=1) / sd * math.sqrt(PERIODS), np.nan)
        return float(np.nanmax(sr)) if np.any(np.isfinite(sr)) else float("nan")

    observed = best(m)
    centred = m - m.mean(axis=1, keepdims=True)
    rng = np.random.default_rng(seed)
    n_blocks = int(math.ceil(t / block))
    offsets = np.arange(block)
    null_best = np.empty(n_boot)
    for b in range(n_boot):
        starts = rng.integers(0, t, size=n_blocks)
        idx = (starts[:, None] + offsets[None, :]).ravel()[:t] % t
        null_best[b] = best(centred[:, idx])
    null_best = null_best[np.isfinite(null_best)]
    p_value = float((1.0 + np.sum(null_best >= observed)) / (null_best.size + 1.0))
    return {
        "observed_best_sharpe": round(observed, 4),
        "null_best_sharpe_mean": round(float(null_best.mean()), 4),
        "null_best_sharpe_p95": round(float(np.percentile(null_best, 95)), 4),
        "p_value": round(p_value, 4),
        "n_bootstrap": int(null_best.size),
        "block_days": int(block),
        "verdict": "PASS" if p_value < 0.05 else "FAIL",
        "rule": "reject the family as having no edge when p >= 0.05",
    }


def tail_correlation(returns: np.ndarray, btc: np.ndarray, q: float = TAIL_QUANTILE) -> dict:
    """Downside tail correlation with BTC over the worst-quantile BTC days."""
    x = np.asarray(returns, dtype=float)
    b = np.asarray(btc, dtype=float)
    mask = np.isfinite(x) & np.isfinite(b)
    x, b = x[mask], b[mask]
    if x.size < 60:
        return {"n": int(x.size), "note": "insufficient observations"}
    n_tail = max(30, int(x.size * q))
    tail = np.argsort(b)[:n_tail]
    corr = (
        float(np.corrcoef(x[tail], b[tail])[0, 1])
        if x[tail].std() > 0 and b[tail].std() > 0
        else float("nan")
    )
    full = (
        float(np.corrcoef(x, b)[0, 1]) if x.std() > 0 and b.std() > 0 else float("nan")
    )
    return {
        "n": int(x.size),
        "n_tail_days": int(n_tail),
        "tail_quantile": q,
        "tail_correlation": round(corr, 4),
        "full_sample_correlation": round(full, 4),
        "btc_mean_return_in_tail": round(float(b[tail].mean()), 6),
        "strategy_mean_return_in_btc_tail": round(float(x[tail].mean()), 6),
    }


def plateau_rerun(name: str, panel: run_grid.Panel, params: dict, train_slice: slice) -> np.ndarray:
    """Re-run one configuration and return its net series on the train window."""
    if name == "H1":
        res = h1.backtest(
            h1.build_positions(panel.funding, **params), panel.perp_returns, panel.funding
        )
    elif name == "H1_G1":
        res = h1.backtest(
            h1.build_positions_g1(panel.funding, panel.perp_returns, **params),
            panel.perp_returns,
            panel.funding,
        )
    elif name == "H2":
        res = h2.evaluate(
            h2.build_positions(panel.perp_close, **params), panel.perp_returns, panel.funding
        )
    elif name == "H2_G1":
        res = h2.evaluate(
            h2.build_positions_g1(panel.perp_close, **params), panel.perp_returns, panel.funding
        )
    elif name == "H3":
        res = h3.evaluate(
            h3.build_positions(panel.basis, panel.funding, **params),
            panel.perp_returns,
            panel.spot_returns,
            panel.funding,
        )
    elif name == "H3_MAKER":
        safe_params = dict(params)
        if "p_fill" in safe_params:
            safe_params["p_fill"] = min(1.0, max(0.05, float(safe_params["p_fill"])))
        res = h3.evaluate_maker(
            h3.build_positions_maker(panel.basis, panel.funding, **safe_params),
            panel.perp_returns,
            panel.spot_returns,
            panel.funding,
        )
    else:
        raise KeyError(f"unknown hypothesis {name!r}")
    return res["net"][train_slice]


def plateau_check(
    name: str, panel: run_grid.Panel, params: dict, base_train_sr: float, split: int
) -> dict:
    """Shift every parameter +/-20% and require net Sharpe not to collapse."""
    probes = []
    window = slice(0, split)
    combos = []
    for key, value in params.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        for sign, suffix in ((0.8, "minus20"), (1.2, "plus20")):
            shifted = dict(params)
            raw = value * sign
            shifted[key] = max(1, int(round(raw))) if isinstance(value, int) else float(raw)
            combos.append((f"{key}_{suffix}", shifted))
    combos.append(
        (
            "all_minus20",
            {
                k: (
                    v
                    if isinstance(v, bool) or not isinstance(v, (int, float))
                    else (max(1, int(round(v * 0.8))) if isinstance(v, int) else float(v * 0.8))
                )
                for k, v in params.items()
            },
        )
    )
    combos.append(
        (
            "all_plus20",
            {
                k: (
                    v
                    if isinstance(v, bool) or not isinstance(v, (int, float))
                    else (max(1, int(round(v * 1.2))) if isinstance(v, int) else float(v * 1.2))
                )
                for k, v in params.items()
            },
        )
    )

    for tag, shifted in combos:
        try:
            net = plateau_rerun(name, panel, shifted, window)
        except (ValueError, KeyError, TypeError) as exc:
            probes.append({"probe": tag, "params": shifted, "error": str(exc)})
            continue
        sr = sharpe_ratio(net, PERIODS)
        drop = (base_train_sr - sr) / abs(base_train_sr) * 100.0 if base_train_sr else float("nan")
        probes.append(
            {
                "probe": tag,
                "params": shifted,
                "sharpe": round(sr, 4) if math.isfinite(sr) else None,
                "drop_pct": round(drop, 2) if math.isfinite(drop) else None,
            }
        )

    scored = [p for p in probes if p.get("drop_pct") is not None]
    worst = max(scored, key=lambda p: p["drop_pct"]) if scored else None
    return {
        "base_params": params,
        "base_train_sharpe": round(base_train_sr, 4) if math.isfinite(base_train_sr) else None,
        "probes": probes,
        "worst_probe": worst["probe"] if worst else None,
        "worst_drop_pct": worst["drop_pct"] if worst else None,
        "verdict": (
            "PLATEAU"
            if worst is None or worst["drop_pct"] <= PLATEAU_TOLERANCE_PCT
            else "SPIKE"
        ),
        "rule": (
            f"shifting every parameter +/-20% must not drop net Sharpe by more than "
            f"{PLATEAU_TOLERANCE_PCT}%"
        ),
        "integer_rounding_note": (
            "bar-count parameters are rounded to the nearest whole bar, so short "
            "lookbacks are probed more coarsely than 20%"
        ),
    }


def net_of(run: dict) -> np.ndarray:
    return run["result"]["net"]


def position_matrix(run: dict) -> np.ndarray:
    """Weights as a day x symbol matrix, excluding the `day` column."""
    frame = run["positions"]
    symbols = [c for c in frame.columns if c != "day"]
    return frame.select(symbols).cast(float).to_numpy()


def gross_of(run: dict) -> np.ndarray:
    return run["result"]["gross"]


def cost_of(run: dict) -> np.ndarray:
    return run["result"]["cost"]


def _per_period_sr_variance(runs: list[dict], split: int) -> float | None:
    vals: list[float] = []
    for r in runs:
        seg = np.asarray(net_of(r)[:split], dtype=float)
        seg = seg[np.isfinite(seg)]
        if seg.size >= 2:
            sd = float(seg.std(ddof=1))
            if sd > 0.0:
                vals.append(float(seg.mean()) / sd)
    if len(vals) < 2:
        return None
    return float(np.var(np.asarray(vals, dtype=float), ddof=1))


def _break_even_slice(gross: np.ndarray, cost: np.ndarray) -> float:
    g = float(np.nansum(gross))
    c = float(np.nansum(cost))
    if c <= 0.0:
        return float("inf") if g > 0.0 else 0.0
    return g / c


def evaluate_hypothesis(
    name: str,
    runs: list[dict],
    full_n: int,
    split: int,
    btc_returns: np.ndarray,
    panel: run_grid.Panel,
    *,
    trial_sr_variance: float | None = None,
    regimes: list[str] | None = None,
    batch_label: str = "batch1_core19",
) -> dict:
    """Score one hypothesis end to end against the audit's gates."""
    train_srs = [sharpe_ratio(net_of(r)[:split], PERIODS) for r in runs]
    winner_index = int(np.nanargmax(train_srs))
    net = net_of(runs[winner_index])
    gross = gross_of(runs[winner_index])
    cost = cost_of(runs[winner_index])
    turnover = np.asarray(runs[winner_index]["result"]["turnover"], dtype=float)
    lookback = int(runs[winner_index]["params"]["lookback"])
    embargo_days = 2 * lookback
    oos_slice = slice(split + embargo_days, None)
    train = net[:split]
    oos = net[oos_slice]
    oos_gross = gross[oos_slice]
    oos_cost = cost[oos_slice]

    grid_n = len(runs)
    own_sr_var = _per_period_sr_variance(runs, split)
    effective_full_var = own_sr_var if trial_sr_variance is None else trial_sr_variance
    dsr = deflated_sharpe(
        train,
        n_trials=full_n,
        periods_per_year=PERIODS,
        trial_sr_variance=effective_full_var,
    )
    dsr_own_grid = deflated_sharpe(
        train,
        n_trials=grid_n,
        periods_per_year=PERIODS,
        trial_sr_variance=own_sr_var,
    )
    mtrl = min_track_record_length(
        train,
        n_trials=full_n,
        periods_per_year=PERIODS,
        trial_sr_variance=effective_full_var,
    )

    train_matrix = run_grid.return_matrix(runs)[:, :split]
    pbo = probability_of_backtest_overfitting(train_matrix)
    cpcv_embargo = min(lookback, max(1, (split // 8) - 16))
    paths = cpcv(
        train_matrix,
        purge=1,
        embargo=cpcv_embargo,
        periods_per_year=PERIODS,
    )
    rc = white_reality_check(train_matrix)

    psr_oos = psr(oos)
    psr_full = psr(net)
    positions = position_matrix(runs[winner_index])
    oos_positions = positions[oos_slice]
    ci = block_bootstrap_ci(oos, oos_positions)
    ci_full = block_bootstrap_ci(net, positions)
    trades = trade_expectancy(oos, oos_positions)
    trades_full = trade_expectancy(net, positions)
    dd_oos = max_drawdown(oos)
    dd_oos_comp = compounded_max_drawdown(oos)
    dd_full = max_drawdown(net)
    dd_full_comp = compounded_max_drawdown(net)
    sparse = sparse_diagnostic(net)

    stress_oos = {}
    stress_full = {}
    for mult in (1.0, 1.5, 2.0, 3.0):
        stressed_oos = oos_gross - oos_cost * mult
        stress_oos[f"{mult}x"] = {
            "cum_net": round(float(np.sum(stressed_oos)), 4),
            "sharpe": round(sharpe_ratio(stressed_oos, PERIODS), 4),
            "positive": bool(np.sum(stressed_oos) > 0),
        }
        stressed_full = gross - cost * mult
        stress_full[f"{mult}x"] = {
            "cum_net": round(float(np.sum(stressed_full)), 4),
            "sharpe": round(sharpe_ratio(stressed_full, PERIODS), 4),
            "positive": bool(np.sum(stressed_full) > 0),
        }

    plateau = plateau_check(
        name, panel, runs[winner_index]["params"], sharpe_ratio(train, PERIODS), split
    )
    break_even_oos = _break_even_slice(oos_gross, oos_cost)
    break_even_full = float(runs[winner_index]["result"]["break_even_multiple"])

    result = {
        "hypothesis": name,
        "batch": batch_label,
        "panel_universe": getattr(panel, "universe", "CORE_19"),
        "n_symbols": len([c for c in panel.perp_close.columns if c != "day"]),
        "n_trials_full_recorded": full_n,
        "n_trials_own_grid": grid_n,
        "winner_params": runs[winner_index]["params"],
        "winner_selected_on": "net Sharpe over the first 70% of days (train)",
        "train": {
            "days": int(train.size),
            "sharpe": round(sharpe_ratio(train, PERIODS), 4),
            "cum_net": round(float(train.sum()), 4),
        },
        "locked_oos": {
            "days": int(oos.size),
            "embargo_days": int(embargo_days),
            "raw_oos_days_before_embargo": int(net.size - split),
            "sharpe": round(sharpe_ratio(oos, PERIODS), 4),
            "cum_net": round(float(oos.sum()), 4),
            "cum_gross": round(float(oos_gross.sum()), 4),
            "cum_cost": round(float(oos_cost.sum()), 4),
            "break_even_multiple": (
                round(break_even_oos, 4) if math.isfinite(break_even_oos) else None
            ),
            "max_drawdown": round(dd_oos, 6),
            "compounded_max_drawdown": round(dd_oos_comp, 6),
            "calmar": (
                round(calmar(oos), 4) if math.isfinite(calmar(oos)) else None
            ),
            "note": (
                "scored once after a 2x-lookback post-train embargo, after the "
                "registry was sealed; never part of the search, PBO, CPCV, or WRC"
            ),
        },
        "full_sample": {
            "days": int(net.size),
            "sharpe": round(sharpe_ratio(net, PERIODS), 4),
            "annualised_net_return": round(
                float(net.sum()) * PERIODS / net.size, 4
            ),
            "cum_net": round(float(net.sum()), 4),
            "cum_gross": round(float(gross.sum()), 4),
            "cum_cost": round(float(cost.sum()), 4),
            "break_even_multiple": (
                round(break_even_full, 4) if math.isfinite(break_even_full) else None
            ),
            "max_drawdown": round(dd_full, 6),
            "compounded_max_drawdown": round(dd_full_comp, 6),
            "calmar": (
                round(calmar(net), 4) if math.isfinite(calmar(net)) else None
            ),
            "mean_turnover": round(float(np.mean(turnover)), 4),
        },
        "deflated_sharpe": {
            "dsr": round(dsr.dsr, 6),
            "observed_sharpe": round(dsr.observed_sr, 4),
            "expected_max_sharpe_under_null": round(dsr.expected_max_sr, 4),
            "n_trials_used": full_n,
            "n_observations": dsr.n_observations,
            "sharpe_standard_error": round(dsr.sr_std_error, 4),
            "trial_sr_variance_per_period": (
                round(effective_full_var, 8) if effective_full_var is not None else None
            ),
            "passes_95": dsr.passes_95,
            "dsr_if_own_grid_only": round(dsr_own_grid.dsr, 6),
        },
        "min_track_record_length_days": (
            round(mtrl, 1) if math.isfinite(mtrl) else None
        ),
        "min_track_record_length_note": (
            "infinite: the observed Sharpe does not exceed the deflated benchmark, "
            "so no amount of additional data would reject the null"
            if not math.isfinite(mtrl)
            else "days of observations needed to reject SR <= SR0 at 95% confidence"
        ),
        "pbo": pbo,
        "cpcv": {
            "n_paths": paths["n_paths"],
            "purge_bars": paths["purge_bars"],
            "embargo_bars": paths["embargo_bars"],
            "periods_per_year": paths["periods_per_year"],
            "winner_mean_path_sharpe": round(paths["mean_path_sharpe"][winner_index], 4),
            "winner_p05_path_sharpe": round(paths["p05_path_sharpe"][winner_index], 4),
            "winner_p95_path_sharpe": round(paths["p95_path_sharpe"][winner_index], 4),
            "winner_std_path_sharpe": round(paths["std_path_sharpe"][winner_index], 4),
        },
        "white_reality_check": rc,
        "psr_locked_oos": psr_oos,
        "psr_full_sample": psr_full,
        "sparse_diagnostic": sparse,
        "bootstrap_ci": ci,
        "bootstrap_ci_full_sample": ci_full,
        "trades": trades,
        "trades_full_sample": trades_full,
        "max_drawdown": round(dd_oos, 6),
        "compounded_max_drawdown": round(dd_oos_comp, 6),
        "calmar": (
            round(calmar(oos), 4) if math.isfinite(calmar(oos)) else None
        ),
        "cost_stress": stress_oos,
        "cost_stress_full_sample": stress_full,
        "parameter_plateau": plateau,
    }

    if regimes is not None:
        result["regime_attribution"] = {
            "full_sample": regimes_mod.attribute_by_regime(regimes, net, turnover),
            "locked_oos": regimes_mod.attribute_by_regime(
                regimes[oos_slice], oos, turnover[oos_slice]
            ),
        }

    if name in ("H1", "H1_G1"):
        result["btc_tail_correlation"] = tail_correlation(oos, btc_returns[oos_slice])
        result["btc_tail_correlation_full_sample"] = tail_correlation(net, btc_returns)

    result["gates"] = build_gates(
        dsr.dsr, pbo["pbo"], psr_oos["psr"], rc, plateau, break_even_oos
    )

    reasons = rejection_reasons(name, result)
    result["rejection_reasons"] = reasons
    result["verdict"] = "PASS" if not reasons else "REJECT"
    return result


def build_gates(
    dsr_value: float,
    pbo_value: float,
    psr_oos_value: float,
    rc: dict,
    plateau: dict,
    break_even: float,
) -> dict:
    """Normalise every threshold decision into one block."""
    return {
        "dsr": {"value": round(dsr_value, 4), "min": DSR_MIN, "pass": bool(dsr_value >= DSR_MIN)},
        "pbo": {
            "value": round(pbo_value, 4),
            "reject_at_or_above": PBO_REJECT_AT,
            "pass": bool(pbo_value < PBO_REJECT_AT),
        },
        "psr_oos": {
            "value": round(psr_oos_value, 4) if math.isfinite(psr_oos_value) else None,
            "min": PSR_MIN,
            "pass": bool(math.isfinite(psr_oos_value) and psr_oos_value >= PSR_MIN),
        },
        "white_reality_check": {"p_value": rc.get("p_value"), "pass": rc.get("verdict") == "PASS"},
        "plateau": {"value": plateau["verdict"], "pass": plateau["verdict"] == "PLATEAU"},
        "break_even_cost_multiple": {
            "value": round(break_even, 2) if math.isfinite(break_even) else None,
            "min": COST_STRESS_MULTIPLE,
            "pass": bool(math.isfinite(break_even) and break_even >= COST_STRESS_MULTIPLE),
        },
    }


def rejection_reasons(name: str, h: dict) -> list[str]:
    """Apply the audit's rejection rule and name every clause that fires."""
    reasons: list[str] = []
    g = h["gates"]
    if not g["dsr"]["pass"]:
        reasons.append(
            f"DSR {g['dsr']['value']} < {DSR_MIN} "
            f"(observed SR {h['deflated_sharpe']['observed_sharpe']} vs "
            f"deflated benchmark {h['deflated_sharpe']['expected_max_sharpe_under_null']} "
            f"at N={h['n_trials_full_recorded']})"
        )
    if not g["pbo"]["pass"]:
        reasons.append(f"PBO {g['pbo']['value']} >= {PBO_REJECT_AT}")
    if not g["psr_oos"]["pass"]:
        reasons.append(f"PSR on locked OOS {g['psr_oos']['value']} < {PSR_MIN}")
    if not g["white_reality_check"]["pass"]:
        reasons.append(
            f"White Reality Check p={g['white_reality_check']['p_value']} >= 0.05"
        )
    if not g["plateau"]["pass"]:
        reasons.append(
            f"parameter sits on a spike: {h['parameter_plateau']['worst_probe']} "
            f"neighbour drops Sharpe {h['parameter_plateau']['worst_drop_pct']}%"
        )
    if not g["break_even_cost_multiple"]["pass"]:
        reasons.append(
            f"break-even cost multiple {g['break_even_cost_multiple']['value']}x "
            f"< {COST_STRESS_MULTIPLE}x survival bar"
        )

    if name in ("H1", "H1_G1"):
        oos_sr = h["locked_oos"]["sharpe"]
        if oos_sr < H1_NET_SHARPE_FLOOR:
            reasons.append(
                f"H1 rule: net out-of-sample Sharpe {oos_sr} < {H1_NET_SHARPE_FLOOR}"
            )
        s2 = h["cost_stress"]["2.0x"]
        if s2["cum_net"] <= 0:
            reasons.append(
                f"H1 rule: net PnL turns negative at 2.0x cost (cum {s2['cum_net']})"
            )
        tc = h.get("btc_tail_correlation") or {}
        if tc.get("tail_correlation") is not None and tc["tail_correlation"] > H1_TAIL_CORR_MAX:
            reasons.append(
                f"H1 rule: BTC downside tail correlation {tc['tail_correlation']} "
                f"> {H1_TAIL_CORR_MAX}"
            )
    return reasons


def open_registry(
    batch2_trials: dict[str, list[dict]],
    panel_surv: run_grid.Panel,
    expected_total: int,
    *,
    registry_path: Path | None = None,
    batch1_count: int = BATCH1_COUNT,
    batch1_head_hash: str = BATCH1_HEAD_HASH,
) -> TrialRegistry:
    """Verify immutable lines `1..93` (`head == 0efe8164...`) and append Batch 2 once.

    NEVER unlinks or overwrites `trial_registry.jsonl`: deleting prior trials to
    reset `N` would falsify the multiple-testing ledger.
    """
    target_path = REGISTRY if registry_path is None else registry_path
    if not target_path.exists():
        raise RuntimeError(
            f"REFUSING: {target_path} missing; Batch 1 (seq 1..{batch1_count}) must exist intact"
        )

    registry = TrialRegistry(target_path)
    if not registry.verify():
        raise RuntimeError(f"REFUSING: {target_path} hash chain failed verification")
    if registry.count < batch1_count:
        raise RuntimeError(
            f"REFUSING: {target_path} holds {registry.count} < {batch1_count} Batch-1 trials"
        )

    records = registry.records()
    seq93_hash = records[batch1_count - 1].get("hash")
    if seq93_hash != batch1_head_hash:
        raise RuntimeError(
            f"REFUSING: seq {batch1_count} hash {seq93_hash} != pinned {batch1_head_hash}"
        )

    if registry.count == batch1_count:
        appended_expected = sum(len(v) for v in batch2_trials.values())
        print(
            f"  verified Batch 1 (seq 1..{batch1_count}, head {batch1_head_hash[:16]}...); "
            f"appending {appended_expected} Batch-2 trials"
        )
        run_grid.log_trials(
            registry,
            batch2_trials,
            panel_surv,
            train_fraction=TRAIN_FRACTION,
            note=BATCH2_NOTE,
        )
    elif registry.count == expected_total:
        print(f"  reusing verified cumulative registry: {registry.count} trials")
    else:
        raise RuntimeError(
            f"REFUSING: registry holds {registry.count} trials (expected {batch1_count} or {expected_total}); "
            "refusing to unlink or overwrite append-only ledger"
        )

    if not registry.verify() or registry.count != expected_total:
        raise RuntimeError("REFUSING: post-append registry verification or count mismatch")
    return registry


def _survivorship_fixed_param_comparison(
    winners_core: dict[str, dict],
    panel_core: run_grid.Panel,
    panel_surv: run_grid.Panel,
    split: int,
) -> dict[str, dict]:
    """Compare locked Batch-1 winners on `CORE_19` vs `SURVIVORSHIP_23` with zero search."""
    out: dict[str, dict] = {}
    for name in ("H1", "H2", "H3"):
        params = winners_core[name]
        embargo = 2 * int(params["lookback"])
        oos_s = slice(split + embargo, None)

        def _score(p: run_grid.Panel) -> dict:
            if name == "H1":
                res = h1.backtest(h1.build_positions(p.funding, **params), p.perp_returns, p.funding)
            elif name == "H2":
                res = h2.evaluate(h2.build_positions(p.perp_close, **params), p.perp_returns, p.funding)
            else:
                res = h3.evaluate(
                    h3.build_positions(p.basis, p.funding, **params),
                    p.perp_returns,
                    p.spot_returns,
                    p.funding,
                )
            net = res["net"]
            return {
                "full_sharpe": round(sharpe_ratio(net, PERIODS), 4),
                "full_cum_net": round(float(np.nansum(net)), 6),
                "locked_oos_sharpe": round(sharpe_ratio(net[oos_s], PERIODS), 4),
                "locked_oos_cum_net": round(float(np.nansum(net[oos_s])), 6),
                "locked_oos_max_drawdown": round(max_drawdown(net[oos_s]), 6),
            }

        c19 = _score(panel_core)
        s23 = _score(panel_surv)
        out[name] = {
            "params": params,
            "core_19_repaired": c19,
            "survivorship_23": s23,
            "delta_survivorship_minus_core19": {
                "full_sharpe": round(s23["full_sharpe"] - c19["full_sharpe"], 4),
                "full_cum_net": round(s23["full_cum_net"] - c19["full_cum_net"], 6),
                "locked_oos_sharpe": round(s23["locked_oos_sharpe"] - c19["locked_oos_sharpe"], 4),
                "locked_oos_cum_net": round(s23["locked_oos_cum_net"] - c19["locked_oos_cum_net"], 6),
            },
        }
    return out


def main() -> int:
    panel_core = run_grid.build_panel("CORE_19")
    panel_surv = run_grid.build_panel("SURVIVORSHIP_23")
    days = len(panel_core.days)
    split = int(days * TRAIN_FRACTION)
    btc = (
        panel_core.perp_returns["BTCUSDT"].cast(float).to_numpy()
        if "BTCUSDT" in panel_core.perp_returns.columns
        else None
    )
    if btc is None:
        print("REFUSING: BTCUSDT absent from the panel; H1's tail rule cannot be applied", file=sys.stderr)
        return 2

    # Build causal USD volume panel for 7-regime classification.
    perp_1d_raw = L.load("perp_1d").filter(pl.col("volume") > 0.0)
    tv_wide = (
        market.traded_value(perp_1d_raw.filter(pl.col("symbol").is_in(list(L.SURVIVORSHIP_23))))
        .pivot(values="value", index="day", on="symbol", aggregate_function="last")
        .sort("day")
    )
    regimes = regimes_mod.classify_regimes(
        panel_surv.perp_close,
        panel_surv.perp_returns,
        panel_surv.basis,
        perp_volume_usd=tv_wide,
    )

    OUT.mkdir(exist_ok=True)
    batch1_trials = run_grid.enumerate_all(panel_core)
    batch2_trials = run_grid.enumerate_batch2(panel_surv)
    expected_total = BATCH1_COUNT + sum(len(v) for v in batch2_trials.values())

    try:
        registry = open_registry(batch2_trials, panel_surv, expected_total)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    chain_ok = registry.verify()
    if not chain_ok:
        print("REFUSING: trial registry hash chain does not verify", file=sys.stderr)
        return 2

    all_hyp_names = ("H1", "H2", "H3", "H1_G1", "H2_G1", "H3_MAKER")
    counts = {h: len(registry.for_hypothesis(h)) for h in all_hyp_names}
    total_n = registry.count

    all_runs = [r for h in ("H1", "H2", "H3") for r in batch1_trials[h]] + [
        r for h in ("H1_G1", "H2_G1", "H3_MAKER") for r in batch2_trials[h]
    ]
    full_sr_var = _per_period_sr_variance(all_runs, split)

    results = []
    for name in ("H1", "H2", "H3"):
        results.append(
            evaluate_hypothesis(
                name,
                batch1_trials[name],
                total_n,
                split,
                btc,
                panel_core,
                trial_sr_variance=full_sr_var,
                regimes=regimes,
                batch_label="batch1_core19_repaired",
            )
        )
    for name in ("H1_G1", "H2_G1", "H3_MAKER"):
        results.append(
            evaluate_hypothesis(
                name,
                batch2_trials[name],
                total_n,
                split,
                btc,
                panel_surv,
                trial_sr_variance=full_sr_var,
                regimes=regimes,
                batch_label="batch2_survivorship23",
            )
        )

    winners_core = {r["hypothesis"]: r["winner_params"] for r in results if r["hypothesis"] in ("H1", "H2", "H3")}
    surv_comparison = _survivorship_fixed_param_comparison(winners_core, panel_core, panel_surv, split)

    reg_arr = np.asarray(regimes, dtype=object)
    regime_counts = {
        "full_sample": {r: int(np.sum(reg_arr == r)) for r in regimes_mod.REGIME_ORDER},
        "train": {r: int(np.sum(reg_arr[:split] == r)) for r in regimes_mod.REGIME_ORDER},
        "raw_locked_oos": {r: int(np.sum(reg_arr[split:] == r)) for r in regimes_mod.REGIME_ORDER},
    }

    payload = {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True
        ).stdout.strip(),
        "trial_registry": {
            "path": "artifacts/trial_registry.jsonl",
            "n_trials_total": total_n,
            "batch1_trials_preserved": BATCH1_COUNT,
            "batch1_seq93_hash": BATCH1_HEAD_HASH,
            "batch1_seq93_verified": registry.records()[BATCH1_COUNT - 1]["hash"] == BATCH1_HEAD_HASH,
            "batch2_trials_appended": total_n - BATCH1_COUNT,
            "n_trials_by_hypothesis": counts,
            "hash_chain_verified": chain_ok,
            "head_hash": registry.head,
            "append_only": True,
            "contains_failures": any(
                r.get("status") != "completed" or float(r.get("sharpe", 0.0)) < 0.0
                for r in registry.records()
            ),
            "note": (
                "Batch 1 (seq 1..93, head 0efe8164...) is preserved byte-for-bit; "
                "Batch 2 (seq 94..185) appends pre-registered survivorship-23 G1 overlay "
                "and H3_MAKER FIFO passive-quoting grids, and DSR deflates against N_total=185."
            ),
        },
        "regime_classification": {
            "regimes_order": list(regimes_mod.REGIME_ORDER),
            "causality": "strictly t-1 shifted features and post-onset (onset+1) disruption aftermath windows",
            "day_counts": regime_counts,
        },
        "survivorship_attribution_fixed_batch1_winners": surv_comparison,
        "methodology": {
            "train_fraction": TRAIN_FRACTION,
            "train_days": split,
            "locked_oos_days": days - split,
            "embargo_rule": "2 x winner lookback days purged between train and locked OOS",
            "selection_diagnostics_window": (
                "train_only (0..split) for DSR, MinTRL, PBO, CPCV, White Reality Check, "
                "and parameter plateau; locked OOS is scored once after embargo"
            ),
            "periods_per_year": PERIODS,
            "returns_are_net": (
                "daily net of 6 bps/turn on H1/H2/H1_G1/H2_G1, 12 bps/pair-turn on H3, and "
                "8.90 bps/pair-turn calibrated maker+adverse-selection+leg-miss midpoint on H3_MAKER"
            ),
            "bootstrap": {
                "scheme": "circular block",
                "block_days": BOOTSTRAP_BLOCK,
                "n_bootstrap": N_BOOTSTRAP,
            },
            "gates_from_audit": {
                "dsr_min": DSR_MIN,
                "pbo_reject_at_or_above": PBO_REJECT_AT,
                "psr_locked_oos_min": PSR_MIN,
                "white_reality_check_p_max": 0.05,
                "plateau_tolerance_pct": PLATEAU_TOLERANCE_PCT,
                "cost_stress_multiple": COST_STRESS_MULTIPLE,
                "h1_net_sharpe_floor": H1_NET_SHARPE_FLOOR,
                "h1_btc_tail_corr_max": H1_TAIL_CORR_MAX,
            },
            "not_implemented": [
                "Hansen's SPA test (White's Reality Check is used instead, as the audit permits either)",
                "Monte Carlo path perturbation beyond block bootstrap",
            ],
        },
        "hypotheses": results,
    }

    target = OUT / "g5_statistical_validity.json"
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n")

    print(f"wrote {target.relative_to(REPO)}")
    print(f"  registry N={total_n} chain={chain_ok} by-hyp {counts}")
    for h in results:
        g = h["gates"]
        print(
            f"  {h['hypothesis']:8s} {h['verdict']:6s} DSR {g['dsr']['value']} "
            f"PBO {g['pbo']['value']} PSR_oos {g['psr_oos']['value']} "
            f"RC p={g['white_reality_check']['p_value']} "
            f"BE {g['break_even_cost_multiple']['value']}x plateau {g['plateau']['value']}"
        )
        print(
            f"    train SR {h['train']['sharpe']:+.3f} -> locked OOS SR "
            f"{h['locked_oos']['sharpe']:+.3f} (cum {h['locked_oos']['cum_net']:+.4f}) "
            f"full SR {h['full_sample']['sharpe']:+.3f}"
        )
        if h["rejection_reasons"]:
            for reason in h["rejection_reasons"]:
                print(f"    ! {reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
