"""Holding episodes: what counts as one "trade" for an expectancy figure.

A book that holds a cross-section of symbols enters and exits as a single
decision, so an expectancy computed per symbol leg would report one decision as
ten trades and would average away the correlation between them. An episode is
therefore a contiguous run of days on which the book held any position at all,
inclusive of the first day and exclusive of the day it went flat.

Kept separate from the scripts so that the G5 gate and the G6 cost report divide
by the same number of trades; two definitions of "trade" in one lab would make
their expectancies quietly incomparable.
"""

from __future__ import annotations

import numpy as np


def trade_episodes(positions: np.ndarray) -> list[tuple[int, int]]:
    """Contiguous runs of days on which the book held any position at all."""
    p = np.asarray(positions, dtype=float)
    active = np.any(np.nan_to_num(p, nan=0.0) != 0.0, axis=1)
    episodes: list[tuple[int, int]] = []
    start = None
    for i, on in enumerate(active):
        if on and start is None:
            start = i
        elif not on and start is not None:
            episodes.append((start, i))
            start = None
    if start is not None:
        episodes.append((start, active.size))
    return episodes


def episode_pnls(net: np.ndarray, positions: np.ndarray) -> np.ndarray:
    """Net PnL per holding episode, including the closing cost on the flat exit bar.

    In the backtest accounting (`turnover[t] = |w[t] - w[t-1]|`), when an episode
    `[a, b)` returns to flat at bar `b < net.size`, `positions[b]` is all-zero so
    `gross[b] == 0`, while `cost[b]` holds the exit turnover `|0 - w[b-1]|`. Since
    `active[b]` is False by construction of `trade_episodes`, the next episode can
    begin at `b + 1` at the earliest, so including bar `b` when `b < net.size`
    attributes the closing cost to the episode that incurred it without overlap.
    """
    arr = np.asarray(net, dtype=float)
    episodes = trade_episodes(positions)
    if not episodes:
        return np.empty(0, dtype=float)
    pnl = np.array(
        [
            float(np.nansum(arr[a : (b + 1 if b < arr.size else b)]))
            for a, b in episodes
        ],
        dtype=float,
    )
    return pnl[np.isfinite(pnl)]


def trade_expectancy(net: np.ndarray, positions: np.ndarray) -> dict:
    """Net PnL per holding episode, and its distribution."""
    episodes = trade_episodes(positions)
    if not episodes:
        return {"n_trades": 0}
    pnl = episode_pnls(net, positions)
    if pnl.size == 0:
        return {"n_trades": 0}
    return {
        "n_trades": int(pnl.size),
        "expectancy": round(float(pnl.mean()), 6),
        "median": round(float(np.median(pnl)), 6),
        "hit_rate": round(float(np.mean(pnl > 0)), 4),
        "best": round(float(pnl.max()), 6),
        "worst": round(float(pnl.min()), 6),
        "mean_hold_days": round(float(np.mean([b - a for a, b in episodes])), 2),
    }
