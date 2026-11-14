"""G1 - Strictly causal volatility, correlation & negative-funding defensive overlay (§14.3).

Every feature used to scale or freeze bar `t` is computed strictly from observations
through bar `t - 1` (`0 .. t - 1`):
1. Causal 20-day realised market volatility exceeding its trailing 252-day 90th
   percentile (`vol_quantile = 0.90`), OR
2. Causal 30-day average pairwise cross-asset return correlation exceeding
   `corr_threshold` (e.g. `0.80`),
scales exposure down by `defensive_scale` (`0.50`) with a `hysteresis_bars` (`3`-bar)
cool-down buffer before restoring full size so single-day noise cannot whipsaw turnover.
3. For funding-carry books (`H1_G1`), when cross-sectional median funding flips deeply
   negative (`< -0.01% / 8h`, i.e. `< -0.0003` daily 3-print sum) for `consecutive_bars`
   (`3`) consecutive causal bars ending at `t - 1`, new carry entries are frozen until
   median funding turns non-negative.
"""

from __future__ import annotations

import math

import numpy as np
import polars as pl


def _pairwise_mean_corr(window: np.ndarray, min_obs: int = 20) -> float:
    """Fast mean off-diagonal Pearson correlation across active columns in `window`."""
    finite_counts = np.sum(np.isfinite(window), axis=0)
    keep = finite_counts >= min_obs
    if int(np.sum(keep)) < 2:
        return float("nan")
    sub = window[:, keep].copy()
    col_means = np.nanmean(sub, axis=0)
    inds = np.where(~np.isfinite(sub))
    sub[inds] = np.take(col_means, inds[1])
    centred = sub - np.mean(sub, axis=0, keepdims=True)
    norms = np.sqrt(np.sum(centred * centred, axis=0))
    valid_std = norms > 1e-12
    m = int(np.sum(valid_std))
    if m < 2:
        return float("nan")
    z = centred[:, valid_std] / norms[valid_std]
    corr_mat = z.T @ z
    off_diag_sum = float(np.sum(corr_mat) - m)
    return off_diag_sum / float(m * (m - 1))


def compute_defensive_scalar(
    returns_wide: pl.DataFrame,
    *,
    vol_window: int = 20,
    vol_pct_lookback: int = 252,
    vol_quantile: float = 0.90,
    corr_window: int = 30,
    corr_threshold: float = 0.80,
    defensive_scale: float = 0.50,
    hysteresis_bars: int = 3,
    periods_per_year: float = 365.0,
) -> dict[str, np.ndarray]:
    """Return causal exposure multiplier `scale[t]` in `{defensive_scale, 1.0}` for each day `t`."""
    symbols = [c for c in returns_wide.columns if c != "day"]
    r = returns_wide.select(symbols).cast(pl.Float64).to_numpy()
    t_len = r.shape[0]

    # Equal-weight cross-sectional market return per bar `s`.
    finite_mask = np.isfinite(r)
    row_counts = np.sum(finite_mask, axis=1)
    row_sums = np.nansum(r, axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        mkt_ret = np.where(row_counts > 0, row_sums / np.maximum(row_counts, 1), np.nan)

    rv = np.full(t_len, np.nan)
    avg_corr = np.full(t_len, np.nan)
    rv_thresh = np.full(t_len, np.nan)
    scale = np.ones(t_len, dtype=float)
    active_flag = np.zeros(t_len, dtype=bool)

    ann = math.sqrt(periods_per_year)
    min_corr_obs = min(20, max(5, corr_window - 5))

    in_defensive = False
    calm_streak = 0

    for t in range(1, t_len):
        if t >= vol_window:
            seg = mkt_ret[t - vol_window : t]
            seg_fin = seg[np.isfinite(seg)]
            if seg_fin.size >= max(5, vol_window // 2):
                rv[t] = float(np.std(seg_fin, ddof=1)) * ann

        if t >= vol_window + 30 and np.isfinite(rv[t]):
            hist_lo = max(vol_window, t - vol_pct_lookback)
            hist = rv[hist_lo:t]
            hist_fin = hist[np.isfinite(hist)]
            if hist_fin.size >= 20:
                rv_thresh[t] = float(np.quantile(hist_fin, vol_quantile))

        if t >= corr_window:
            avg_corr[t] = _pairwise_mean_corr(r[t - corr_window : t], min_obs=min_corr_obs)

        vol_stress = bool(np.isfinite(rv[t]) and np.isfinite(rv_thresh[t]) and rv[t] > rv_thresh[t])
        corr_stress = bool(np.isfinite(avg_corr[t]) and avg_corr[t] > corr_threshold)
        raw_stress = vol_stress or corr_stress

        if raw_stress:
            in_defensive = True
            calm_streak = 0
        elif in_defensive:
            calm_streak += 1
            if calm_streak >= max(1, hysteresis_bars):
                in_defensive = False
                calm_streak = 0

        active_flag[t] = in_defensive
        scale[t] = float(defensive_scale) if in_defensive else 1.0

    return {
        "scale": scale,
        "defensive_active": active_flag,
        "rv20": rv,
        "rv_threshold": rv_thresh,
        "avg_corr30": avg_corr,
    }


def compute_negative_funding_freeze(
    funding_wide: pl.DataFrame,
    *,
    neg_funding_8h_threshold: float = -0.0001,
    prints_per_day: float = 3.0,
    consecutive_bars: int = 3,
    hysteresis_bars: int = 3,
) -> np.ndarray:
    """Causal boolean mask `freeze[t]` when median prior funding stayed `< threshold`."""
    symbols = [c for c in funding_wide.columns if c != "day"]
    f = funding_wide.select(symbols).cast(pl.Float64).to_numpy()
    t_len = f.shape[0]
    daily_floor = float(neg_funding_8h_threshold) * float(prints_per_day)

    med = np.full(t_len, np.nan)
    for s in range(t_len):
        row = f[s]
        fin = row[np.isfinite(row)]
        if fin.size >= 4:
            med[s] = float(np.median(fin))

    freeze = np.zeros(t_len, dtype=bool)
    frozen = False
    neg_streak = 0
    pos_streak = 0
    k_need = max(1, int(consecutive_bars))
    h_need = max(1, int(hysteresis_bars))

    for t in range(1, t_len):
        prev_med = med[t - 1]
        if np.isfinite(prev_med) and prev_med < daily_floor:
            neg_streak += 1
            pos_streak = 0
            if neg_streak >= k_need:
                frozen = True
        elif np.isfinite(prev_med) and prev_med >= 0.0:
            neg_streak = 0
            if frozen:
                pos_streak += 1
                if pos_streak >= h_need:
                    frozen = False
                    pos_streak = 0
        else:
            neg_streak = 0
            pos_streak = 0
        freeze[t] = frozen

    return freeze
