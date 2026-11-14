"""Effective-spread estimates from high/low/close bars, without a book.

The audit forbids pricing an OHLCV backtest at the mid: testing on close prices
means half-spread, slippage and volatility-dependent impact must be added
explicitly to the fill price. There is no L2 book in this lab, so the spread
has to be inferred from the bars themselves. Two published estimators are used
rather than one, because a single noisy estimator would drive the verdict alone.

Both return a *signed* squared spread per bar, in fraction units. The sign
carries information: an estimate that is negative means the bars show less
range than sampling noise alone would produce, which is the estimator saying
"no spread is detectable here". Clamping those to zero inside the estimator
would silently convert an over-estimate in one direction into a guaranteed
floor, so the sign is kept and reported per symbol instead.
"""

from __future__ import annotations

import numpy as np

DENOM = 3.0 - 2.0 * np.sqrt(2.0)

# The only spread figure in the audit that is a spread rather than a fee: its
# two-leg worked example prices half-spread for a liquid pair at 3.0 bps when the
# emergency close of one leg crosses alone. It is an anchor, not a measurement.
AUDIT_LIQUID_HALF_SPREAD_BPS = 3.0


def corwin_schultz(high: np.ndarray, low: np.ndarray) -> np.ndarray:
    """Corwin-Schultz (2012) two-bar high-low spread, squared, signed by alpha.

    Each bar's estimate needs the previous bar, so the first entry is NaN.
    """
    h = np.asarray(high, dtype=float)
    l = np.asarray(low, dtype=float)
    n = h.shape[0]
    out = np.full(n, np.nan)
    if n < 2:
        return out
    with np.errstate(invalid="ignore", divide="ignore"):
        log_hl = np.log(h / l) ** 2
        beta = log_hl[1:] + log_hl[:-1]
        hi = np.maximum(h[1:], h[:-1])
        lo = np.minimum(l[1:], l[:-1])
        gamma = np.log(hi / lo) ** 2
        alpha = (np.sqrt(2.0 * beta) - np.sqrt(beta)) / DENOM - np.sqrt(gamma / DENOM)
        span = 2.0 * (np.exp(alpha) - 1.0) / (1.0 + np.exp(alpha))
        out[1:] = np.sign(alpha) * span**2
    return out


def abdi_ranaldo(high: np.ndarray, low: np.ndarray, close: np.ndarray) -> np.ndarray:
    """Abdi-Ranaldo (2017) close-vs-range spread, squared, signed by the product.

    Uses the close against the midpoint of its own bar's range and the next bar's
    range, so a close parked at one extreme of the range reads as a wide spread.
    """
    h = np.asarray(high, dtype=float)
    l = np.asarray(low, dtype=float)
    c = np.asarray(close, dtype=float)
    n = c.shape[0]
    out = np.full(n, np.nan)
    if n < 2:
        return out
    with np.errstate(invalid="ignore", divide="ignore"):
        eta = 0.5 * (np.log(h) + np.log(l))
        lc = np.log(c)
        out[:-1] = 4.0 * (lc[:-1] - eta[:-1]) * (lc[:-1] - eta[1:])
    return out


def summarise(s2: np.ndarray) -> dict:
    """Reduce a per-bar squared-spread series to one symbol-level estimate.

    The median, not the mean: the series is heavy-tailed by construction and a
    single wide bar would otherwise set the symbol's spread for the whole sample.
    Negative median `s2` indicates sampling variance dominating quoted spread
    (no detectable spread on these bars) and is clamped to `0.0` bps per
    Corwin & Schultz (2012) / Abdi & Ranaldo (2017), while preserving the signed
    median in `bps^2` (`1e8 * med`) and `detectable` flag for diagnostics.
    """
    x = s2[np.isfinite(s2)]
    if x.size == 0:
        return {
            "spread_bps": None,
            "n_bars": 0,
            "negative_fraction": None,
            "signed_median_bps2": None,
            "detectable": False,
        }
    med = float(np.median(x))
    return {
        "spread_bps": round(1e4 * float(np.sqrt(max(0.0, med))), 4),
        "n_bars": int(x.size),
        "negative_fraction": round(float(np.mean(x < 0.0)), 4),
        "signed_median_bps2": round(1e8 * med, 6),
        "detectable": bool(med > 0.0),
    }


def half_spread_bps(spread_bps: float | None) -> float:
    """Crossing from the mid to one side of the quoted spread costs half of it."""
    if spread_bps is None or spread_bps <= 0.0:
        return 0.0
    return float(spread_bps) / 2.0


ESTIMATOR_METHOD = (
    "Corwin-Schultz on per-symbol 4-hour bars, median of per-bar estimates, sign kept; "
    "4-hour bars rather than daily because a daily high-low range is dominated by the "
    "day's trend rather than by the quoted spread"
)
ESTIMATOR_CAVEAT = (
    "A high-low estimator measures the range the price covered, and only part of that "
    "range is the bid-ask. For a liquid pair the true quoted spread is a few bps, while "
    "this estimator reads tens of bps on the same bars, so the estimate is an upper "
    "bound rather than a calibration. It is used as the top of a band whose floor is the "
    "audit's own liquid-pair half-spread anchor; the band's width is reported rather than "
    "hidden behind a single point estimate."
)


def band(per_symbol_spread_bps: dict[str, float], *, floor_half_spread_bps: float) -> dict:
    """The half-spread band the cost model is run across, and how wide it is.

    The floor is the audit's own liquid-pair half-spread anchor; the ceiling is the
    estimated spread, median across all measured symbols (including symbols clamped
    to `0.0` bps when no positive spread was detectable), halved. A verdict that
    survives both ends of the band does not depend on which of the two is closer to
    the truth; one that flips inside the band is the finding, and is reported as such.
    """
    values = [v for v in per_symbol_spread_bps.values() if v is not None and v >= 0.0]
    if not values:
        return {
            "floor_half_spread_bps": round(float(floor_half_spread_bps), 4),
            "ceiling_half_spread_bps": round(float(floor_half_spread_bps), 4),
            "median_full_spread_bps": None,
            "n_symbols": 0,
            "width_multiple": 1.0,
            "method": ESTIMATOR_METHOD,
            "caveat": ESTIMATOR_CAVEAT,
        }
    median_full = float(np.median(values))
    ceiling = median_full / 2.0
    floor = float(floor_half_spread_bps)
    if ceiling < floor:
        ceiling = floor
    return {
        "floor_half_spread_bps": round(floor, 4),
        "ceiling_half_spread_bps": round(ceiling, 4),
        "median_full_spread_bps": round(median_full, 4),
        "n_symbols": len(values),
        "width_multiple": round(ceiling / floor, 3) if floor > 0 else None,
        "method": ESTIMATOR_METHOD,
        "caveat": ESTIMATOR_CAVEAT,
    }

