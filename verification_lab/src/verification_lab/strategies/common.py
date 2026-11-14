"""Shared plumbing for the three surviving hypotheses.

Every strategy returns a weight frame keyed by `day`, and every backtest needs
the same three things before it can say anything: the weights lined up with the
returns of the *next* bar, a turnover-based cost, and the cost multiple at which
the edge disappears. Those live here so H1/H2/H3 cannot drift apart in how they
charge a trade.
"""

from __future__ import annotations

import numpy as np
import polars as pl


def align(
    weights: pl.DataFrame,
    returns: pl.DataFrame,
    symbols: list[str] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Line weights up with returns on shared days.

    The weight frame describes the position *held into* bar t, so pairing it with
    the return of bar t is the causal mapping: a signal formed from data through
    t-1 is applied to the change from t-1 to t. Strategies must therefore shift
    their signal by one bar when they build weights.
    """
    syms = symbols or [c for c in weights.columns if c != "day"]
    w = weights.select(["day", *syms]).rename({s: f"w_{s}" for s in syms})
    r = returns.select(["day", *syms]).rename({s: f"r_{s}" for s in syms})
    frame = w.join(r, on="day", how="inner").sort("day")
    days = frame["day"].to_numpy()
    wm = frame.select([f"w_{s}" for s in syms]).cast(pl.Float64).to_numpy()
    rm = frame.select([f"r_{s}" for s in syms]).cast(pl.Float64).to_numpy()
    return days, wm, rm


def apply_costs(
    weights: np.ndarray,
    returns: np.ndarray,
    cost_bps_per_turn: float,
    cost_multiplier: float = 1.0,
    leg_multiplier: float = 1.0,
) -> dict:
    """Gross return, turnover cost and net return for a weight matrix.

    A null return means the asset had no usable price for that bar, so the leg
    contributes zero rather than a silently interpolated return.
    """
    prev = np.vstack([np.zeros((1, weights.shape[1])), weights[:-1]])
    turnover = np.nansum(np.abs(weights - prev), axis=1) * leg_multiplier
    gross = np.nansum(np.nan_to_num(returns, nan=0.0) * np.nan_to_num(weights, nan=0.0), axis=1)
    cost = turnover * (cost_bps_per_turn / 10_000.0) * cost_multiplier
    return {"net": gross - cost, "gross": gross, "turnover": turnover, "cost": cost}


def break_even_multiple(gross: np.ndarray, cost: np.ndarray) -> float:
    """Cost multiple at which cumulative net PnL reaches zero.

    Below 1.0 the strategy loses money at modelled costs; the audit's rejection
    rule uses 2.0x as the survival bar, so this number is the verdict input.
    """
    total_cost = float(np.sum(cost))
    total_gross = float(np.sum(gross))
    if total_cost <= 0:
        return float("inf")
    return total_gross / total_cost


def summary(net: np.ndarray, gross: np.ndarray, turnover: np.ndarray, cost: np.ndarray) -> dict:
    return {
        "days": int(len(net)),
        "cum_net": float(np.sum(net)),
        "cum_gross": float(np.sum(gross)),
        "cum_cost": float(np.sum(cost)),
        "mean_turnover": float(np.mean(turnover)) if len(turnover) else 0.0,
        "break_even_multiple": break_even_multiple(gross, cost),
        "net": net,
        "gross": gross,
        "turnover": turnover,
        "cost": cost,
    }
