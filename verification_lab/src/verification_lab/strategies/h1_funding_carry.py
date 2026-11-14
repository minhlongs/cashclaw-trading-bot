"""H1 - Drift-Buffered Cross-Sectional Perpetual Funding Carry.

Mechanism: perpetual funding pays the short side when funding is positive. Rank
the panel by trailing funding, short the top and go long the bottom, so the book
collects the funding differential while staying close to market-neutral.

Causality: the weight held into day t is built from funding observed strictly
before t. The trailing mean excludes bar t-1's own value from its own average by
ending the window at t-1, and the drift buffer carries state forward without
ever looking at a future rank.

The drift buffer is what makes this more than a naive tail: a symbol keeps its
position until its rank clears an exit band, which cuts turnover and stops the
book from chasing one-day funding spikes.
"""

from __future__ import annotations

import numpy as np
import polars as pl

from .common import summary
from .overlay_g1 import compute_defensive_scalar, compute_negative_funding_freeze


def _trailing_mean(f: np.ndarray, lookback: int) -> np.ndarray:
    """Mean of the `lookback` bars ending at t-1, so bar t sees no same-day data."""
    t_len, n = f.shape
    filled = np.nan_to_num(f, nan=0.0)
    valid = ~np.isnan(f)
    cum = np.nancumsum(filled, axis=0)
    cnt = np.cumsum(valid, axis=0).astype(float)
    min_obs = min(3, max(1, lookback))
    out = np.full((t_len, n), np.nan)
    for t in range(lookback, t_len):
        lo = t - lookback
        hi_sum = cum[t - 1] if t > 0 else np.zeros(n)
        lo_sum = cum[lo - 1] if lo > 0 else np.zeros(n)
        hi_cnt = cnt[t - 1] if t > 0 else np.zeros(n)
        lo_cnt = cnt[lo - 1] if lo > 0 else np.zeros(n)
        num = hi_sum - lo_sum
        den = hi_cnt - lo_cnt
        with np.errstate(invalid="ignore", divide="ignore"):
            out[t] = np.where(den >= min_obs, num / np.maximum(den, 1.0), np.nan)
    return out


def build_positions(
    funding_wide: pl.DataFrame,
    *,
    lookback: int = 7,
    entry_band: float = 0.6,
    exit_band: float = 0.4,
) -> pl.DataFrame:
    """Day x symbol weights, dollar-neutral and gross-normalised to 1 on active days."""
    symbols = [c for c in funding_wide.columns if c != "day"]
    f = funding_wide.select(symbols).cast(pl.Float64).to_numpy()
    t_len, n = f.shape

    trail = _trailing_mean(f, lookback)

    # Cross-sectional rank in [0,1] over symbols with a valid trailing mean and
    # an observed prior-bar funding rate; 1 = highest trailing funding.
    rank = np.full((t_len, n), np.nan)
    for t in range(1, t_len):
        row = trail[t]
        valid = (~np.isnan(row)) & (~np.isnan(f[t - 1]))
        k = int(valid.sum())
        if k < 4:
            continue
        valid_idx = np.flatnonzero(valid)
        order = valid_idx[np.argsort(row[valid_idx], kind="mergesort")]
        rank[t, order] = np.arange(k, dtype=float) / (k - 1)

    # Symmetric per-side drift buffer: shorts enter at >= entry_band (> 0.5) and
    # hold down to exit_band; longs enter at <= 1 - entry_band (< 0.5) and hold
    # up to 1 - exit_band. Each active side receives +/-0.5 total notional so
    # sum(w) == 0 and sum(|w|) == 1 regardless of how many symbols sit in each leg.
    w = np.zeros((t_len, n))
    state = np.zeros(n)
    for t in range(t_len):
        rk = rank[t]
        fresh = ~np.isnan(rk)
        with np.errstate(invalid="ignore"):
            short_enter = fresh & (rk >= entry_band) & (rk > 0.5)
            long_enter = fresh & (rk <= 1.0 - entry_band) & (rk < 0.5)
            short_hold = fresh & (rk >= exit_band)
            long_hold = fresh & (rk <= 1.0 - exit_band)

        from_short = np.where(short_hold, -1.0, np.where(long_enter, 1.0, 0.0))
        from_long = np.where(long_hold, 1.0, np.where(short_enter, -1.0, 0.0))
        from_flat = np.where(short_enter, -1.0, np.where(long_enter, 1.0, 0.0))
        state = np.where(
            ~fresh,
            0.0,
            np.where(state < 0.0, from_short, np.where(state > 0.0, from_long, from_flat)),
        )
        longs = state > 0.0
        shorts = state < 0.0
        n_long = int(longs.sum())
        n_short = int(shorts.sum())
        if n_long > 0 and n_short > 0:
            w[t, longs] = 0.5 / n_long
            w[t, shorts] = -0.5 / n_short

    return pl.DataFrame({"day": funding_wide["day"], **{s: w[:, i] for i, s in enumerate(symbols)}})


def backtest(
    positions: pl.DataFrame,
    returns: pl.DataFrame,
    funding: pl.DataFrame,
    *,
    cost_bps_per_turn: float = 6.0,
    cost_multiplier: float = 1.0,
) -> dict:
    """Net return of the perp book: price leg plus the funding the book receives.

    A long perp pays funding when the rate is positive, so the funding leg of the
    return is -weight * funding. Splitting carry from price matters for the
    verdict: a book whose entire edge is the funding leg is a very different
    object from one that also has price momentum.
    """
    symbols = [c for c in positions.columns if c != "day"]
    frame = (
        positions.sort("day")
        .join(returns.select(["day", *symbols]).rename({s: f"r_{s}" for s in symbols}), on="day", how="inner")
        .join(funding.select(["day", *symbols]).rename({s: f"f_{s}" for s in symbols}), on="day", how="inner")
        .sort("day")
    )
    w = frame.select(symbols).cast(pl.Float64).to_numpy()
    r = frame.select([f"r_{s}" for s in symbols]).cast(pl.Float64).to_numpy()
    fd = frame.select([f"f_{s}" for s in symbols]).cast(pl.Float64).to_numpy()

    price = np.nansum(np.nan_to_num(r, nan=0.0) * np.nan_to_num(w, nan=0.0), axis=1)
    carry = np.nansum(-np.nan_to_num(fd, nan=0.0) * np.nan_to_num(w, nan=0.0), axis=1)
    gross = price + carry

    prev = np.vstack([np.zeros((1, w.shape[1])), w[:-1]])
    turnover = np.nansum(np.abs(w - prev), axis=1)
    cost = turnover * (cost_bps_per_turn / 10_000.0) * cost_multiplier
    net = gross - cost

    return {
        **summary(net, gross, turnover, cost),
        "price_leg": price,
        "carry_leg": carry,
        "cum_price": float(np.sum(price)),
        "cum_carry": float(np.sum(carry)),
    }


GRID = {
    "lookback": [3, 5, 7, 10, 14],
    "entry_band": [0.5, 0.6, 0.7],
    "exit_band": [0.3, 0.4],
}

G1_GRID = {
    "lookback": [3, 5, 7, 14],
    "entry_band": [0.6, 0.7],
    "exit_band": [0.3, 0.4],
    "corr_threshold": [0.75, 0.80],
}


def build_positions_g1(
    funding_wide: pl.DataFrame,
    returns_wide: pl.DataFrame,
    *,
    lookback: int = 7,
    entry_band: float = 0.6,
    exit_band: float = 0.4,
    corr_threshold: float = 0.80,
) -> pl.DataFrame:
    """H1 with G1 causal defensive hysteresis overlay and negative-funding entry freeze."""
    symbols = [c for c in funding_wide.columns if c != "day"]
    f = funding_wide.select(symbols).cast(pl.Float64).to_numpy()
    t_len, n = f.shape

    trail = _trailing_mean(f, lookback)
    freeze = compute_negative_funding_freeze(funding_wide)
    scalar = compute_defensive_scalar(
        returns_wide.select(["day", *symbols]),
        corr_threshold=corr_threshold,
    )["scale"]

    rank = np.full((t_len, n), np.nan)
    for t in range(1, t_len):
        row = trail[t]
        valid = (~np.isnan(row)) & (~np.isnan(f[t - 1]))
        k = int(valid.sum())
        if k < 4:
            continue
        valid_idx = np.flatnonzero(valid)
        order = valid_idx[np.argsort(row[valid_idx], kind="mergesort")]
        rank[t, order] = np.arange(k, dtype=float) / (k - 1)

    w = np.zeros((t_len, n))
    state = np.zeros(n)
    for t in range(t_len):
        rk = rank[t]
        fresh = ~np.isnan(rk)
        allow_entry = not bool(freeze[t])
        with np.errstate(invalid="ignore"):
            short_enter = fresh & allow_entry & (rk >= entry_band) & (rk > 0.5)
            long_enter = fresh & allow_entry & (rk <= 1.0 - entry_band) & (rk < 0.5)
            short_hold = fresh & (rk >= exit_band)
            long_hold = fresh & (rk <= 1.0 - exit_band)

        from_short = np.where(short_hold, -1.0, np.where(long_enter, 1.0, 0.0))
        from_long = np.where(long_hold, 1.0, np.where(short_enter, -1.0, 0.0))
        from_flat = np.where(short_enter, -1.0, np.where(long_enter, 1.0, 0.0))
        state = np.where(
            ~fresh,
            0.0,
            np.where(state < 0.0, from_short, np.where(state > 0.0, from_long, from_flat)),
        )
        longs = state > 0.0
        shorts = state < 0.0
        n_long = int(longs.sum())
        n_short = int(shorts.sum())
        if n_long > 0 and n_short > 0:
            gross_half = 0.5 * float(scalar[t])
            w[t, longs] = gross_half / n_long
            w[t, shorts] = -gross_half / n_short

    return pl.DataFrame({"day": funding_wide["day"], **{s: w[:, i] for i, s in enumerate(symbols)}})
