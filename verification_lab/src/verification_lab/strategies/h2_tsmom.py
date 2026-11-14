"""H2 - Asset-Conditional Volatility-Targeted TSMOM.

Mechanism: time-series momentum per asset, with the position size driven by that
asset's own trailing volatility instead of one portfolio-wide scalar. The claim
under test is not "momentum works" -- it is that volatility targeting and
per-asset sizing beat a volatility-targeted buy-and-hold on risk-adjusted
return, so buy-and-hold is computed on the same panel as the reference.

Causality: the momentum signal at t uses closes through t, the volatility scale
at t uses returns through t-1, and the weight built at t earns the return of
t+1.
"""

from __future__ import annotations

import numpy as np
import polars as pl

from .common import apply_costs, break_even_multiple
from .loaders import returns_from_wide
from .overlay_g1 import compute_defensive_scalar


def _guarded_returns(close_wide: pl.DataFrame, symbols: list[str]) -> np.ndarray:
    """Daily returns via the shared staleness guard (`max_stale_days=2`)."""
    rets_df = returns_from_wide(close_wide.select(["day", *symbols]), max_stale_days=2)
    return rets_df.select(symbols).cast(pl.Float64).to_numpy()


def _shift_one(m: np.ndarray) -> np.ndarray:
    """Move a signal built through bar t onto bar t+1, per the causal contract."""
    out = np.full_like(m, np.nan)
    out[1:] = m[:-1]
    return out


def _trailing_vol_annual(window: np.ndarray, periods: float = 365.0) -> np.ndarray:
    """Annualised per-column volatility of a trailing return window.

    `nanstd(..., ddof=1)` warns "Degrees of freedom <= 0" whenever a column is
    entirely NaN, which happens for every asset before it lists. The result is
    NaN either way, so the behaviour is correct, but at 19 symbols x 2130 bars
    the noise buries real warnings. Columns without two observations are handed
    back as NaN directly and the rest are measured without the warning.
    """
    counts = np.sum(np.isfinite(window), axis=0)
    vol = np.full(window.shape[1], np.nan)
    enough = counts >= 2
    if enough.any():
        vol[enough] = np.nanstd(window[:, enough], axis=0, ddof=1)
    return vol * np.sqrt(periods)


def build_positions(
    close_wide: pl.DataFrame,
    *,
    lookback: int = 90,
    target_vol_annual: float = 0.25,
    causal_shift: bool = True,
) -> pl.DataFrame:
    """Sign from trailing momentum, size from trailing volatility, gross capped at 1.

    The signal is built from closes through bar t and then shifted one bar, so row
    t+1 holds the position that bar t's information justifies. Without the shift
    the weight and the return it multiplies share the same closing price, and the
    backtest measures its own bar rather than the next one.
    """
    symbols = [c for c in close_wide.columns if c != "day"]
    px = close_wide.select(symbols).cast(pl.Float64).to_numpy()
    t_len, n = px.shape
    rets = _guarded_returns(close_wide, symbols)

    mom = np.full((t_len, n), np.nan)
    for t in range(lookback, t_len):
        past = px[t - lookback]
        with np.errstate(invalid="ignore", divide="ignore"):
            mom[t] = np.where(past > 0, px[t] / past - 1.0, np.nan)

    # Trailing volatility through t-1 only, so the size cannot use its own bar.
    lev = np.full((t_len, n), np.nan)
    for t in range(lookback, t_len):
        sd = _trailing_vol_annual(rets[t - lookback:t])
        with np.errstate(invalid="ignore", divide="ignore"):
            lev[t] = np.where(sd > 0, target_vol_annual / sd, np.nan)
    lev = np.clip(lev, 0.0, 2.0)

    w = np.sign(np.nan_to_num(mom, nan=0.0)) * np.nan_to_num(lev, nan=0.0)
    if causal_shift:
        w = np.nan_to_num(_shift_one(w), nan=0.0)
    gross = np.nansum(np.abs(w), axis=1, keepdims=True)
    w = np.divide(w, np.where(gross > 1.0, gross, 1.0))

    return pl.DataFrame({"day": close_wide["day"], **{s: w[:, i] for i, s in enumerate(symbols)}})


def benchmark_buy_and_hold(close_wide: pl.DataFrame, target_vol_annual: float = 0.25) -> np.ndarray:
    """Volatility-targeted, equal-weight buy-and-hold on the same assets."""
    symbols = [c for c in close_wide.columns if c != "day"]
    t_len, n = close_wide.height, len(symbols)
    rets = _guarded_returns(close_wide, symbols)

    # `rets[t - 30 : t]` uses returns through bar `t - 1` only, so `lev[t]` is
    # already causal for sizing bar `t`'s return without an extra bar shift.
    lev = np.full((t_len, n), np.nan)
    for t in range(30, t_len):
        sd = _trailing_vol_annual(rets[t - 30:t])
        with np.errstate(invalid="ignore", divide="ignore"):
            lev[t] = np.where(sd > 0, target_vol_annual / sd, np.nan)
    lev = np.clip(lev, 0.0, 2.0)

    w = np.nan_to_num(lev, nan=0.0) / max(n, 1)
    return np.nansum(np.nan_to_num(rets, nan=0.0) * w, axis=1)


def evaluate(
    positions: pl.DataFrame,
    returns: pl.DataFrame,
    funding: pl.DataFrame | None = None,
    *,
    cost_bps_per_turn: float = 6.0,
    cost_multiplier: float = 1.0,
) -> dict:
    """Price PnL plus the funding a held perpetual position pays or receives.

    A time-series-momentum book on perpetuals is not a spot book: net long perps
    pay funding and net short perps collect it. Omitting that leg would credit
    the strategy with a carry it never earns, so it is charged here whenever the
    funding panel is supplied, and reported separately so the split is visible.
    """
    symbols = [c for c in positions.columns if c != "day"]
    frame = positions.sort("day").join(
        returns.select(["day", *symbols]), on="day", how="inner"
    ).sort("day")

    w = frame.select(symbols).cast(pl.Float64).to_numpy()
    r = frame.select([f"{s}_right" for s in symbols]).cast(pl.Float64).to_numpy()

    res = apply_costs(w, r, cost_bps_per_turn, cost_multiplier)
    res["price_leg"] = res["gross"].copy()
    res["carry_leg"] = np.zeros_like(res["gross"])

    if funding is not None:
        fd = (
            positions.sort("day")
            .join(funding.select(["day", *symbols]), on="day", how="inner")
            .sort("day")
            .select([f"{s}_right" for s in symbols])
            .cast(pl.Float64)
            .to_numpy()
        )
        carry = np.nansum(-np.nan_to_num(fd, nan=0.0) * np.nan_to_num(w, nan=0.0), axis=1)
        res["carry_leg"] = carry
        res["gross"] = res["price_leg"] + carry
        res["net"] = res["gross"] - res["cost"]

    res["cum_price"] = float(np.nansum(res["price_leg"]))
    res["cum_carry"] = float(np.nansum(res["carry_leg"]))
    res["days"] = int(w.shape[0])
    res["mean_turnover"] = float(np.nanmean(res["turnover"]))
    res["break_even_multiple"] = break_even_multiple(res["gross"], res["cost"])
    return res


def benchmark_costs(close_wide: pl.DataFrame, target_vol_annual: float = 0.25) -> dict:
    """The same benchmark, priced like the strategy so the comparison is fair."""
    symbols = [c for c in close_wide.columns if c != "day"]
    t_len, n = close_wide.height, len(symbols)
    rets = _guarded_returns(close_wide, symbols)

    # `lev[t]` is computed strictly from `rets[t - 30 : t]` (through bar `t - 1`),
    # matching `benchmark_buy_and_hold` with a single causal lag.
    lev = np.full((t_len, n), np.nan)
    for t in range(30, t_len):
        sd = _trailing_vol_annual(rets[t - 30:t])
        with np.errstate(invalid="ignore", divide="ignore"):
            lev[t] = np.where(sd > 0, target_vol_annual / sd, np.nan)
    lev = np.clip(lev, 0.0, 2.0)
    w = np.nan_to_num(lev, nan=0.0) / max(n, 1)
    res = apply_costs(w, rets, 6.0)
    res["days"] = int(w.shape[0])
    return res


GRID = {"lookback": [30, 60, 90, 120, 180], "target_vol_annual": [0.15, 0.25, 0.40]}

G1_GRID = {
    "lookback": [30, 60, 90, 120],
    "target_vol_annual": [0.15, 0.25, 0.40],
    "corr_threshold": [0.75, 0.80],
}


def build_positions_g1(
    close_wide: pl.DataFrame,
    *,
    lookback: int = 90,
    target_vol_annual: float = 0.25,
    corr_threshold: float = 0.80,
    causal_shift: bool = True,
) -> pl.DataFrame:
    """H2 with G1 causal volatility & correlation hysteresis scale-down overlay."""
    base = build_positions(
        close_wide,
        lookback=lookback,
        target_vol_annual=target_vol_annual,
        causal_shift=causal_shift,
    )
    symbols = [c for c in base.columns if c != "day"]
    rets_wide = returns_from_wide(close_wide.select(["day", *symbols]), max_stale_days=2)
    scalar = compute_defensive_scalar(rets_wide, corr_threshold=corr_threshold)["scale"]
    w = base.select(symbols).cast(pl.Float64).to_numpy() * scalar[:, None]
    return pl.DataFrame({"day": base["day"], **{s: w[:, i] for i, s in enumerate(symbols)}})
