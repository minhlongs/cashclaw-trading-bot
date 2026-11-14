"""Panel construction from the normalised G2 parquet files.

Three rules shape this module:
1. No back-fill anywhere: a symbol that has not listed yet keeps a null price
   rather than borrowing a future one.
2. Staleness guard: a return is only computed across a real adjacent observation;
   if a symbol is missing for longer than `max_stale_days`, the return is nulled
   instead of collapsing a multi-day move into one bar.
3. Survivorship zombie-bar & post-settlement funding guard: kline bars with
   `volume <= 0` and post-settlement funding prints on delisted contracts after
   `last_active_ts_ms` are nulled/excluded so strategies never hold or rank dead
   contracts after settlement. `CORE_19` vs `SURVIVORSHIP_23` preserves exact
   reproducibility for `seq 1..93` alongside the 23-symbol survivorship panel.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import polars as pl

LAB = Path(__file__).resolve().parents[3]
NORM = LAB / "data" / "normalized"

DAY_MS = 86_400_000

CORE_19: tuple[str, ...] = (
    "ADAUSDT", "APTUSDT", "ATOMUSDT", "AVAXUSDT", "BCHUSDT", "BNBUSDT",
    "BTCUSDT", "DOGEUSDT", "DOTUSDT", "ETCUSDT", "ETHUSDT", "FILUSDT",
    "LINKUSDT", "LTCUSDT", "NEARUSDT", "SOLUSDT", "TRXUSDT", "UNIUSDT",
    "XRPUSDT",
)
DELISTED_4: tuple[str, ...] = ("EOSUSDT", "FTMUSDT", "MATICUSDT", "MKRUSDT")
SURVIVORSHIP_23: tuple[str, ...] = tuple(sorted(set(CORE_19) | set(DELISTED_4)))


def resolve_universe(universe: str | Sequence[str] | None) -> list[str] | None:
    if universe is None:
        return None
    if isinstance(universe, str):
        key = universe.strip().upper()
        if key == "CORE_19":
            return list(CORE_19)
        if key == "SURVIVORSHIP_23":
            return list(SURVIVORSHIP_23)
        raise ValueError(f"unknown universe {universe!r}; expected 'CORE_19' or 'SURVIVORSHIP_23'")
    return sorted(set(universe))


def load(name: str) -> pl.DataFrame:
    path = NORM / f"{name}.parquet"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing - run g2_ingest.py first")
    return pl.read_parquet(path)


def daily_close(
    dataset: str,
    *,
    symbols: str | Sequence[str] | None = None,
) -> pl.DataFrame:
    df = load(dataset)
    if "volume" in df.columns:
        df = df.filter(pl.col("volume") > 0.0)
    resolved = resolve_universe(symbols)
    if resolved is not None:
        df = df.filter(pl.col("symbol").is_in(resolved))
    return (
        df.with_columns((pl.col("ts_ms") // DAY_MS).alias("day"))
        .sort(["symbol", "day", "ts_ms"])
        .group_by(["symbol", "day"], maintain_order=True)
        .agg(pl.col("close").last().alias("close"))
        .sort(["symbol", "day"])
    )


def wide_close(
    dataset: str,
    *,
    symbols: str | Sequence[str] | None = None,
) -> pl.DataFrame:
    """Wide close panel indexed by day; nulls are real absences, not gaps to fill."""
    wide = (
        daily_close(dataset, symbols=symbols)
        .pivot(values="close", index="day", on="symbol", aggregate_function="last")
        .sort("day")
    )
    sym_cols = sorted(c for c in wide.columns if c != "day")
    return wide.select(["day", *sym_cols])


def daily_funding(
    *,
    symbols: str | Sequence[str] | None = None,
) -> pl.DataFrame:
    """Sum the funding events in a day into that day's total rate per symbol.

    The input is sorted by timestamp before aggregating so floating-point addition
    is deterministic across repeated calls. Post-settlement zombie funding rows on
    delisted contracts (`ts_ms > last_active_ts_ms`) are excluded when metadata is
    present.
    """
    df = load("funding")
    if "is_delisted" in df.columns and "last_active_ts_ms" in df.columns:
        df = df.filter(
            (~pl.col("is_delisted").fill_null(False))
            | (pl.col("ts_ms") < pl.col("last_active_ts_ms"))
        )
    resolved = resolve_universe(symbols)
    if resolved is not None:
        df = df.filter(pl.col("symbol").is_in(resolved))
    return (
        df.with_columns((pl.col("ts_ms") // DAY_MS).alias("day"))
        .sort(["symbol", "day", "ts_ms"])
        .group_by(["symbol", "day"], maintain_order=True)
        .agg(pl.col("funding_rate").sum().alias("funding"))
        .sort(["symbol", "day"])
    )


def wide_funding(
    days: pl.Series,
    *,
    symbols: str | Sequence[str] | None = None,
    perp_close_wide: pl.DataFrame | None = None,
) -> pl.DataFrame:
    wide = (
        daily_funding(symbols=symbols)
        .pivot(values="funding", index="day", on="symbol", aggregate_function="first")
        .sort("day")
    )
    joined = pl.DataFrame({"day": days}).join(wide, on="day", how="left").sort("day")
    sym_cols = sorted(c for c in joined.columns if c != "day")
    joined = joined.select(["day", *sym_cols])

    if perp_close_wide is not None:
        exprs = []
        for sym in sym_cols:
            if sym in DELISTED_4 and sym in perp_close_wide.columns:
                non_null = perp_close_wide.select(["day", sym]).drop_nulls()
                if non_null.height > 0:
                    max_day = int(non_null["day"].max())
                    exprs.append(
                        pl.when(pl.col("day") <= max_day)
                        .then(pl.col(sym))
                        .otherwise(None)
                        .alias(sym)
                    )
        if exprs:
            joined = joined.with_columns(exprs)
    return joined


def load_oi_monthly(*, symbols: str | Sequence[str] | None = None) -> pl.DataFrame:
    df = load("oi_monthly")
    resolved = resolve_universe(symbols)
    if resolved is not None:
        df = df.filter(pl.col("symbol").is_in(resolved))
    return df.sort(["symbol", "ts_ms"])


def load_hyperliquid_funding_1h() -> pl.DataFrame:
    return load("hyperliquid_funding_1h").sort(["symbol", "ts_ms"])


def load_hyperliquid_l1_quotes() -> pl.DataFrame:
    return load("hyperliquid_l1_quotes").sort("symbol")


def returns_from_wide(wide: pl.DataFrame, max_stale_days: int = 2) -> pl.DataFrame:
    """Close-to-close returns with an explicit staleness guard per symbol."""
    symbols = [c for c in wide.columns if c != "day"]
    pieces: list[pl.DataFrame] = []

    for sym in symbols:
        obs = (
            wide.select(["day", sym])
            .drop_nulls()
            .sort("day")
            .with_columns(
                (pl.col("day") - pl.col("day").shift(1)).alias("gap_days")
            )
            .with_columns(
                pl.when(pl.col("gap_days").is_not_null() & (pl.col("gap_days") <= max_stale_days))
                .then(pl.col(sym) / pl.col(sym).shift(1) - 1.0)
                .otherwise(None)
                .alias(sym)
            )
            .select(["day", sym])
        )
        pieces.append(obs)

    out = wide.select("day").sort("day")
    for piece in pieces:
        out = out.join(piece, on="day", how="left")
    return out.sort("day")
