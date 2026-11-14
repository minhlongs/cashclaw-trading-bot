"""Panel construction from the normalised G2 parquet files.

Two rules shape this module. First, no back-fill anywhere: a symbol that has not
listed yet keeps a null price rather than borrowing a future one. Second, a
return is only computed across a real adjacent observation -- if a symbol is
missing for longer than `max_stale_days`, the return is nulled instead of
collapsing a multi-day move into one bar, because that inflated bar would look
like a tradable signal.
"""

from __future__ import annotations

from pathlib import Path

import polars as pl

LAB = Path(__file__).resolve().parents[3]
NORM = LAB / "data" / "normalized"

DAY_MS = 86_400_000


def load(name: str) -> pl.DataFrame:
    path = NORM / f"{name}.parquet"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing - run g2_ingest.py first")
    return pl.read_parquet(path)


def daily_close(dataset: str) -> pl.DataFrame:
    df = load(dataset)
    return (
        df.with_columns((pl.col("ts_ms") // DAY_MS).alias("day"))
        .group_by(["symbol", "day"])
        .agg(pl.col("close").last().alias("close"))
        .sort(["symbol", "day"])
    )


def wide_close(dataset: str) -> pl.DataFrame:
    """Wide close panel indexed by day; nulls are real absences, not gaps to fill."""
    return (
        daily_close(dataset)
        .pivot(values="close", index="day", on="symbol", aggregate_function="last")
        .sort("day")
    )


def daily_funding() -> pl.DataFrame:
    """Sum the funding events in a day into that day's total rate per symbol.

    The input is sorted by timestamp before aggregating. A parallel group-by sum
    is otherwise free to accumulate in whatever order the threads finish, and
    floating-point addition is not associative, so the last bits of each daily
    total changed between runs of the same code on the same data. That is not a
    cosmetic difference here: H1 ranks trailing funding cross-sectionally, and a
    perturbation of 1e-18 flips ranks that sit close together, which changes the
    book and every downstream statistic. Reproducibility is a precondition for
    the registry and the deflated Sharpe to mean anything.
    """
    df = load("funding")
    return (
        df.with_columns((pl.col("ts_ms") // DAY_MS).alias("day"))
        .sort(["symbol", "day", "ts_ms"])
        .group_by(["symbol", "day"], maintain_order=True)
        .agg(pl.col("funding_rate").sum().alias("funding"))
        .sort(["symbol", "day"])
    )


def wide_funding(days: pl.Series) -> pl.DataFrame:
    wide = (
        daily_funding()
        .pivot(values="funding", index="day", on="symbol", aggregate_function="first")
        .sort("day")
    )
    return pl.DataFrame({"day": days}).join(wide, on="day", how="left").sort("day")


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
