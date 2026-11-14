"""Per-symbol traded value and realised volatility, aligned to the panel's days.

Impact needs two numbers the price panel does not carry directly: how much the
symbol trades per day (so that a fixed book is a measurable fraction of it) and
how fast its price moves (so that the same fraction costs more in a fast tape).
Both are computed here, once, in panel-alignment form, so the cost model never
has to guess a symbol's liquidity from a name or a ranking.

Neither statistic uses the return of the day it is applied to. Traded value is a
trailing median and volatility is a trailing standard deviation shifted one day
forward, because an impact model that reads the day's own volume is using the
outcome to price the trade that produced it.
"""

from __future__ import annotations

import numpy as np
import polars as pl

ADV_WINDOW = 30
VOL_WINDOW = 30


def traded_value(ohlcv: pl.DataFrame) -> pl.DataFrame:
    """Daily traded value in quote currency, per symbol and day."""
    return (
        ohlcv.with_columns((pl.col("volume") * pl.col("close")).alias("value"))
        .with_columns((pl.col("ts_ms") // 86_400_000).alias("day"))
        .group_by(["symbol", "day"])
        .agg(pl.col("value").sum().alias("value"))
        .sort(["symbol", "day"])
    )


def _wide(frame: pl.DataFrame, value: str, days: pl.Series) -> pl.DataFrame:
    wide = (
        frame.pivot(values=value, index="day", on="symbol", aggregate_function="last")
        .sort("day")
    )
    out = pl.DataFrame({"day": days}).join(wide, on="day", how="left").sort("day")
    return out.select(["day", *[c for c in out.columns if c != "day"]])


def adv_panel(ohlcv: pl.DataFrame, days: pl.Series, window: int = ADV_WINDOW) -> pl.DataFrame:
    """Trailing median traded value per symbol, shifted so day t sees through t-1.

    The median rather than the mean: an exchange listing day or a liquidation
    cascade puts a single order of magnitude into one bar, and a mean would let
    that one bar set the symbol's liquidity for the following month.
    """
    value = traded_value(ohlcv)
    wide = _wide(value, "value", days)
    symbols = [c for c in wide.columns if c != "day"]
    out = {"day": wide["day"]}
    for sym in symbols:
        series = wide[sym].cast(pl.Float64)
        out[sym] = (
            series.rolling_median(window_size=window, min_samples=1).shift(1).alias(sym)
        )
    return pl.DataFrame(out)


def volatility_panel(
    returns: pl.DataFrame, window: int = VOL_WINDOW
) -> pl.DataFrame:
    """Trailing daily return standard deviation, shifted so day t sees through t-1."""
    symbols = [c for c in returns.columns if c != "day"]
    # A caller that asks for a short window still gets a usable panel: polars
    # rejects a min_samples larger than the window, and the 5-sample floor is a
    # variance estimate's requirement, not a rule about how long the window is.
    out = {"day": returns["day"]}
    min_samples = min(5, window)
    for sym in symbols:
        series = returns[sym].cast(pl.Float64)
        out[sym] = (
            series.rolling_std(window_size=window, min_samples=min_samples).shift(1).alias(sym)
        )
    return pl.DataFrame(out).sort("day")


def funding_cashflow(funding: pl.DataFrame, perp_positions: pl.DataFrame) -> np.ndarray:
    """Per-day funding paid by the held perp leg, on portfolio notional.

    A long perp pays funding when the rate is positive, so the cash flow is
    `-w * f` for the perp leg's signed weight. This is a cash flow on held
    notional, not a turn cost: it accrues while the position sits still, so
    charging it per unit of turnover would price a flat book at zero.

    Callers pass the *perp leg's* weight, not the book's. The carry pair holds
    spot long and perp short, so its perp weight is the negative half of the
    pair weight; passing the pair weight would flip the sign of the only cash
    flow the strategy is built to collect.
    """
    days = perp_positions["day"]
    symbols = [c for c in perp_positions.columns if c != "day"]
    # Rename before joining: both frames carry the same symbol name, and polars
    # keeps both columns on a same-name join, so a later select would read the
    # position twice and price -w*w instead of -w*funding.
    frame = perp_positions.select(["day", *symbols]).join(
        funding.select(["day", *symbols]).rename({s: f"f_{s}" for s in symbols}),
        on="day",
        how="left",
    ).sort("day")
    if frame.height != days.len():
        raise ValueError(
            f"funding panel covered {frame.height} of {days.len()} book days; "
            "a partial join would silently undercount the cash flow"
        )
    # A left join preserves every book day, so the height check above cannot
    # notice a missing funding day -- it shows up as a null. Nulls would then be
    # coerced to zero and the cash flow would be quietly understated, which is
    # exactly the failure the height check was written to prevent. Only a held
    # position with no funding observation is an error; a flat book earns
    # nothing and needs no rate.
    held = np.nan_to_num(frame.select(symbols).cast(pl.Float64).to_numpy(), nan=0.0) != 0.0
    missing = np.isnan(frame.select([f"f_{s}" for s in symbols]).cast(pl.Float64).to_numpy())
    unpriced = int(np.sum(held & missing))
    if unpriced:
        raise ValueError(
            f"{unpriced} held position-days have no funding observation; "
            "zero-filling them would silently undercount the cash flow"
        )
    w = frame.select(symbols).cast(pl.Float64).to_numpy()
    f = frame.select([f"f_{s}" for s in symbols]).cast(pl.Float64).to_numpy()
    return np.nansum(-np.nan_to_num(w, nan=0.0) * np.nan_to_num(f, nan=0.0), axis=1)


def row(df: pl.DataFrame, columns: list[str], day: int) -> np.ndarray:
    """One day's row as a float array over `columns`, NaN where the panel is null."""
    sub = df.filter(pl.col("day") == day)
    if sub.height == 0:
        return np.full(len(columns), np.nan)
    present = [c for c in columns if c in sub.columns]
    values = sub.select(present).to_numpy()[0].astype(float)
    if len(present) == len(columns):
        return values
    out = np.full(len(columns), np.nan)
    index = {c: i for i, c in enumerate(columns)}
    for c, v in zip(present, values):
        out[index[c]] = v
    return out


def as_matrix(df: pl.DataFrame, columns: list[str]) -> np.ndarray:
    """The full panel as a day x symbol matrix, NaN where a symbol has no observation."""
    present = {c: i for i, c in enumerate(columns) if c in df.columns}
    out = np.full((df.height, len(columns)), np.nan)
    for c, i in present.items():
        out[:, i] = df[c].cast(pl.Float64).to_numpy()
    return out
