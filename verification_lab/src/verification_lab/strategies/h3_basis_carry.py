"""H3 - Selective Spot-Perp Basis Cash-and-Carry.

Mechanism: long spot, short perpetual, and collect funding while the basis
converges. The selective part is the whole hypothesis: unconditioned
cash-and-carry is a funding-harvesting trade with a tail blow-up, so the audit's
version only holds when the annualised basis is wide enough to pay for two
legs and when funding is actually positive.

Accounting, per unit of gross notional: half sits long spot, half short perp.
Daily portfolio return is half the spot return minus half the perp return plus
half the funding accrued on the short perp leg. Two legs means turnover costs
count twice, which is the reason this hypothesis often dies on cost rather than
on signal.

Causality: basis at t is computed from closes at t, funding at t is the sum of
events during day t, and the position earns the return of t+1.
"""

from __future__ import annotations

import numpy as np
import polars as pl

from .common import break_even_multiple


def _nan_mean_blocks(x: np.ndarray, lookback: int) -> np.ndarray:
    """Trailing mean of the `lookback` bars ending at t inclusive; all-null windows stay null."""
    t_len, n = x.shape
    out = np.full((t_len, n), np.nan)
    for t in range(lookback - 1, t_len):
        window = x[t - lookback + 1 : t + 1]
        counts = np.sum(~np.isnan(window), axis=0)
        sums = np.nansum(window, axis=0)
        with np.errstate(invalid="ignore", divide="ignore"):
            out[t] = np.where(counts > 0, sums / np.maximum(counts, 1), np.nan)
    return out


def basis_wide(perp_close: pl.DataFrame, spot_close: pl.DataFrame) -> pl.DataFrame:
    """Perp premium to spot, aligned on day with the intersection of symbols."""
    common = [c for c in perp_close.columns if c != "day" and c in spot_close.columns]
    joined = perp_close.select(["day", *common]).join(
        spot_close.select(["day", *common]), on="day", how="inner"
    ).sort("day")
    p = joined.select([pl.col(c).alias(f"p_{c}") for c in common]).cast(pl.Float64).to_numpy()
    s = joined.select([pl.col(f"{c}_right").alias(c) for c in common]).cast(pl.Float64).to_numpy()
    with np.errstate(invalid="ignore", divide="ignore"):
        b = np.where(s > 0, p / s - 1.0, np.nan)
    return pl.DataFrame({"day": joined["day"], **{c: b[:, i] for i, c in enumerate(common)}})


def build_positions(
    basis: pl.DataFrame,
    funding: pl.DataFrame,
    *,
    lookback: int = 14,
    entry_annual_bps: float = 300.0,
    exit_annual_bps: float = 150.0,
    causal_shift: bool = True,
) -> pl.DataFrame:
    """Short perp / long spot where the smoothed annualised basis clears entry.

    Positions are signed +1 for the carry pair, 0 when flat. The trailing basis
    and funding means at bar t include bar t's close and are shifted forward one
    bar when `causal_shift=True` so the entry decision at t earns t+1's return.

    `causal_shift=False` deliberately returns the same-bar decision. It exists so
    the leakage audit can measure how much apparent edge the missing shift
    fabricates; no backtest may use it.
    """
    symbols = [c for c in basis.columns if c != "day"]
    b = basis.select(symbols).cast(pl.Float64).to_numpy()
    f = funding.select(symbols).cast(pl.Float64).to_numpy()
    t_len = b.shape[0]

    trailing = _nan_mean_blocks(b, lookback)

    # A carry pair needs a positive basis and positive funding to be worth holding.
    annual_bps = trailing * 10_000.0 * 365.0
    trailing_funding = _nan_mean_blocks(f, lookback)

    state = np.zeros_like(b)
    holding = np.zeros(b.shape[1], dtype=bool)
    for t in range(t_len):
        ab = annual_bps[t]
        fnd = trailing_funding[t]
        present = (~np.isnan(b[t])) & (~np.isnan(f[t]))
        with np.errstate(invalid="ignore"):
            enter = present & (ab > entry_annual_bps) & (fnd > 0)
            stay = present & (ab > exit_annual_bps)
        holding = np.where(holding, stay, enter)
        state[t] = holding.astype(float)

    # The holding decision is made from bar t's basis and funding, so it can only
    # be held from t+1. Shifting here keeps the decision and the return it earns
    # on opposite sides of the bar boundary.
    shifted = np.vstack([np.zeros((1, state.shape[1])), state[:-1]]) if causal_shift else state
    gross = np.nansum(shifted, axis=1, keepdims=True)
    w = np.divide(shifted, np.where(gross > 0, gross, 1.0))
    return pl.DataFrame({"day": basis["day"], **{s: w[:, i] for i, s in enumerate(symbols)}})


def evaluate(
    positions: pl.DataFrame,
    perp_returns: pl.DataFrame,
    spot_returns: pl.DataFrame,
    funding: pl.DataFrame,
    *,
    cost_bps_per_turn: float = 6.0,
    cost_multiplier: float = 1.0,
) -> dict:
    """Backtest the two-leg carry book, charging turnover on both legs."""
    symbols = [c for c in positions.columns if c != "day"]
    frame = positions.sort("day")
    pr = perp_returns.select(["day", *symbols])
    sr = spot_returns.select(["day", *symbols])
    fd = funding.select(["day", *symbols])
    frame = frame.join(pr, on="day", how="inner", suffix="_perp").join(
        sr, on="day", how="inner", suffix="_spot"
    ).join(fd, on="day", how="inner", suffix="_fund").sort("day")

    w = frame.select(symbols).cast(pl.Float64).to_numpy()
    rp = frame.select([f"{s}_perp" for s in symbols]).cast(pl.Float64).to_numpy()
    rs = frame.select([f"{s}_spot" for s in symbols]).cast(pl.Float64).to_numpy()
    rf = frame.select([f"{s}_fund" for s in symbols]).cast(pl.Float64).to_numpy()

    # Long spot (+0.5 weight), short perp (-0.5 weight), funding to the short leg.
    gross = np.nansum(
        0.5 * w * np.nan_to_num(rs, nan=0.0)
        - 0.5 * w * np.nan_to_num(rp, nan=0.0)
        + 0.5 * w * np.nan_to_num(rf, nan=0.0),
        axis=1,
    )

    prev = np.vstack([np.zeros((1, w.shape[1])), w[:-1]])
    # Both legs rebalance, so turnover is charged against spot and perp separately.
    turnover = np.nansum(np.abs(w - prev), axis=1) * 2.0
    cost = turnover * (cost_bps_per_turn / 10_000.0) * cost_multiplier
    net = gross - cost

    return {
        "net": net,
        "gross": gross,
        "turnover": turnover,
        "cost": cost,
        "days": int(w.shape[0]),
        "mean_turnover": float(np.nanmean(turnover)),
        "break_even_multiple": break_even_multiple(gross, cost),
        # Funding the short perp leg collects. H1 and H2 already report theirs;
        # without it here, the execution report cannot check its own funding
        # cash flow against the strategy that is supposed to have earned it.
        "carry_leg": np.nansum(0.5 * w * np.nan_to_num(rf, nan=0.0), axis=1),
    }


GRID = {
    "lookback": [7, 14, 21, 30],
    "entry_annual_bps": [150.0, 300.0, 500.0, 800.0],
    "exit_annual_bps": [75.0, 150.0, 250.0],
}
