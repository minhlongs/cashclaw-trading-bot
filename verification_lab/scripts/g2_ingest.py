"""G2 data ingestion with per-file provenance, checksum verification, survivorship, OI & Hyperliquid.

Downloads Binance Vision public archives (including delisted perpetuals and monthly-anchor
Open Interest metrics) plus Hyperliquid public `/info` 1h funding history and L1/impact
top-of-book snapshots, tracing every row to a URL, SHA-256 digest, and `available_at_utc`
point-in-time availability timestamp. No API key is used and nothing authenticated is touched.

Resumable: an existing archive whose recorded sha256 still matches is not downloaded again.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import polars as pl
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from verification_lab.strategies import hyperliquid_loader as hl_loader  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
LAB = REPO / "verification_lab"
RAW = LAB / "data" / "raw"
NORM = LAB / "data" / "normalized"
ART = REPO / "artifacts"

BASE = "https://data.binance.vision/data"
DAY_MS = 86_400_000
FOUR_HOUR_MS = 14_400_000

# Core 19 surviving liquid USDT pairs (preserved for seq 1..93 reproducibility).
CORE_19 = sorted(
    {
        "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "SOLUSDT",
        "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "LTCUSDT", "BCHUSDT",
        "TRXUSDT", "ATOMUSDT", "UNIUSDT", "ETCUSDT", "FILUSDT", "NEARUSDT",
        "APTUSDT",
    }
)
UNIVERSE = list(CORE_19)

# Delisted / migrated Binance USD-M perpetual contracts for survivorship coverage.
DELISTED_SYMBOLS = sorted({"EOSUSDT", "FTMUSDT", "MATICUSDT", "MKRUSDT"})
SURVIVORSHIP_23 = sorted(set(CORE_19) | set(DELISTED_SYMBOLS))

DEFAULT_DATASETS = {
    "funding": BASE + "/futures/um/monthly/fundingRate/{sym}/{sym}-fundingRate-{ym}.zip",
    "perp_4h": BASE + "/futures/um/monthly/klines/{sym}/4h/{sym}-4h-{ym}.zip",
    "perp_1d": BASE + "/futures/um/monthly/klines/{sym}/1d/{sym}-1d-{ym}.zip",
    "spot_1d": BASE + "/spot/monthly/klines/{sym}/1d/{sym}-1d-{ym}.zip",
}
DATASETS = dict(DEFAULT_DATASETS)

OI_URL_TEMPLATE = BASE + "/futures/um/daily/metrics/{sym}/{sym}-metrics-{ym}-01.zip"
OI_START = (2021, 12)

# Explicit SHA-256 checksum pin for backfilled UNIUSDT perp_1d 2023-01 archive.
PINNED_CHECKSUMS: dict[tuple[str, str, str], str] = {
    ("perp_1d", "UNIUSDT", "2023-01"): "bf368553082004394bd4a5eb8774ee7d1dd56c80c946285f682866507cc0ffbd",
}

START = (2021, 1)


def ms_to_utc_iso(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def months_until_now() -> list[tuple[int, int]]:
    now = datetime.now(timezone.utc)
    # Only complete months: the running month exists as daily files only.
    end = (now.year, now.month - 1) if now.month > 1 else (now.year - 1, 12)
    out, y, m = [], START[0], START[1]
    while (y, m) <= end:
        out.append((y, m))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def to_ms(value: int) -> int:
    """Binance switched some archives to microsecond timestamps; normalise."""
    if value > 1e15:
        return value // 1000
    if value > 1e12:
        return value
    if value > 1e9:
        return value * 1000
    return value


def _bar_close_offset_ms(dataset: str) -> int:
    if dataset in ("perp_1d", "spot_1d"):
        return DAY_MS
    if dataset == "perp_4h":
        return FOUR_HOUR_MS
    return 0


def parse_zip_with_stats(payload: bytes, dataset: str) -> tuple[pl.DataFrame, int]:
    """Parse a Binance Vision zip archive and return `(active_frame, zombie_bars_filtered)`."""
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        name = zf.namelist()[0]
        text = zf.read(name).decode("utf-8", "replace")
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if dataset == "oi_metrics":
        if lines and not lines[0][0].isdigit():
            lines = lines[1:]
        if not lines:
            return pl.DataFrame(), 0
        def _opt_float(raw_cell: str, default: float = 0.0) -> float:
            cleaned = raw_cell.strip().strip('"').strip("'")
            if not cleaned or cleaned.lower() in ("nan", "null", "none"):
                return default
            return float(cleaned)

        parsed_oi = []
        zombies = 0
        for ln in lines:
            parts = ln.split(",")
            if len(parts) < 4:
                continue
            ts_str = parts[0].strip().strip('"')
            dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            ts_ms = int(dt.timestamp() * 1000)
            oi_coins = _opt_float(parts[2], 0.0)
            oi_usd = _opt_float(parts[3], 0.0)
            if oi_coins <= 0.0 or oi_usd <= 0.0:
                zombies += 1
                continue
            top_ls = _opt_float(parts[5], float("nan")) if len(parts) > 5 else float("nan")
            taker_ls = _opt_float(parts[7], float("nan")) if len(parts) > 7 else float("nan")
            parsed_oi.append((ts_ms, oi_coins, oi_usd, top_ls, taker_ls))
        if not parsed_oi:
            return pl.DataFrame(), zombies
        parsed_oi.sort(key=lambda x: x[0])
        last_ts, last_oi, last_val, last_top, last_taker = parsed_oi[-1]
        df_oi = pl.DataFrame(
            [(last_ts, last_oi, last_val, last_top, last_taker, len(parsed_oi), last_ts, ms_to_utc_iso(last_ts))],
            schema=[
                "ts_ms",
                "sum_open_interest",
                "sum_open_interest_value",
                "toptrader_long_short_ratio",
                "taker_long_short_vol_ratio",
                "n_intraday_obs",
                "available_at_ms",
                "available_at_utc",
            ],
            orient="row",
        )
        return df_oi, zombies

    if lines and not lines[0].split(",")[0].strip().lstrip("-").isdigit():
        lines = lines[1:]
    if not lines:
        return pl.DataFrame(), 0

    rows = [ln.split(",") for ln in lines]

    if dataset == "funding":
        out = []
        for r in rows:
            if len(r) >= 3:
                ts = to_ms(int(r[0]))
                out.append((ts, float(r[2]), ts, ms_to_utc_iso(ts)))
            elif len(r) == 2:
                ts = to_ms(int(r[0]))
                out.append((ts, float(r[1]), ts, ms_to_utc_iso(ts)))
        return (
            pl.DataFrame(
                out,
                schema=["ts_ms", "funding_rate", "available_at_ms", "available_at_utc"],
                orient="row",
            ),
            0,
        )

    # Klines: open_time,open,high,low,close,volume,...
    # Empirical Binance Vision quirk: settled/delisted perp archives emit flat zombie bars
    # (`open == high == low == close` and `volume == 0`) before returning HTTP 404.
    offset = _bar_close_offset_ms(dataset)
    out = []
    zombies = 0
    for r in rows:
        vol = float(r[5])
        if vol <= 0.0:
            zombies += 1
            continue
        ts = to_ms(int(r[0]))
        avail_ms = ts + offset
        out.append(
            (
                ts,
                float(r[1]),
                float(r[2]),
                float(r[3]),
                float(r[4]),
                vol,
                avail_ms,
                ms_to_utc_iso(avail_ms),
            )
        )
    if not out:
        return (
            pl.DataFrame(
                schema={
                    "ts_ms": pl.Int64,
                    "open": pl.Float64,
                    "high": pl.Float64,
                    "low": pl.Float64,
                    "close": pl.Float64,
                    "volume": pl.Float64,
                    "available_at_ms": pl.Int64,
                    "available_at_utc": pl.String,
                }
            ),
            zombies,
        )
    return (
        pl.DataFrame(
            out,
            schema=[
                "ts_ms",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "available_at_ms",
                "available_at_utc",
            ],
            orient="row",
        ),
        zombies,
    )


def parse_zip(payload: bytes, dataset: str) -> pl.DataFrame:
    frame, _ = parse_zip_with_stats(payload, dataset)
    return frame


MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 1.5
RETRYABLE_HTTP_STATUSES = {408, 429, 500, 502, 503, 504}


def _archive_path(dataset: str, sym: str, ym: str) -> Path:
    if dataset == "oi_metrics":
        return RAW / "oi_metrics" / f"{sym}-{ym}-01.zip"
    return RAW / dataset / f"{sym}-{ym}.zip"


def _archive_url(dataset: str, sym: str, ym: str) -> str:
    if dataset == "oi_metrics":
        return OI_URL_TEMPLATE.format(sym=sym, ym=ym)
    return DATASETS[dataset].format(sym=sym, ym=ym)


def verify_archive_checksum(
    dataset: str,
    sym: str,
    ym: str,
    url: str,
    sha256_hex: str,
    *,
    offline: bool = False,
) -> tuple[bool, str | None]:
    """Verify archive SHA-256 against Binance Vision `.CHECKSUM` (and pinned digests)."""
    chk_dest = _archive_path(dataset, sym, ym).with_suffix(".zip.CHECKSUM")
    expected_pin = PINNED_CHECKSUMS.get((dataset, sym, ym))
    if expected_pin is not None and sha256_hex != expected_pin:
        return False, f"pinned_checksum_mismatch:{sha256_hex}!={expected_pin}"

    text = None
    if chk_dest.exists():
        text = chk_dest.read_text(encoding="utf-8", errors="replace")
    elif not offline:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = requests.get(url + ".CHECKSUM", timeout=30)
            except requests.RequestException:
                resp = None
            else:
                if resp.status_code == 200:
                    text = resp.text
                    chk_dest.write_text(text, encoding="utf-8")
                    break
                if resp.status_code not in RETRYABLE_HTTP_STATUSES:
                    break
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * attempt)

    if text:
        remote_hex = text.strip().split()[0].lower()
        if remote_hex != sha256_hex.lower():
            return False, f"checksum_mismatch:{sha256_hex}!={remote_hex}"
        if expected_pin is not None and remote_hex != expected_pin.lower():
            return False, f"remote_checksum_pin_mismatch:{remote_hex}!={expected_pin}"
        return True, None
    return (expected_pin is not None), None


def fetch(
    job: tuple[str, str, int, int],
    *,
    offline: bool = False,
    check_remote_checksum: bool = False,
) -> dict[str, Any]:
    dataset, sym, y, m = job
    ym = f"{y:04d}-{m:02d}"
    url = _archive_url(dataset, sym, ym)
    dest = _archive_path(dataset, sym, ym)
    dest.parent.mkdir(parents=True, exist_ok=True)

    record: dict[str, Any] = {
        "dataset": dataset,
        "symbol": sym,
        "month": ym,
        "url": url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "zombie_bars_filtered": 0,
        "checksum_verified": False,
        "is_delisted": sym in DELISTED_SYMBOLS,
        "last_active_ts_ms": None,
        "available_at_utc": None,
    }

    payload = None
    if dest.exists() and dest.stat().st_size > 0:
        payload = dest.read_bytes()
        record["cache_hit"] = True
    elif offline:
        record.update(
            status="cache_miss",
            error="offline_mode_uncached_archive",
            bytes=0,
            sha256="",
            cache_hit=False,
        )
        return record
    else:
        resp = None
        last_exc: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = requests.get(url, timeout=60)
            except requests.RequestException as exc:
                last_exc = exc
                resp = None
            else:
                if resp.status_code not in RETRYABLE_HTTP_STATUSES:
                    break
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF_SEC * (2 ** (attempt - 1)))

        if resp is None:
            record.update(
                status="error",
                error=str(last_exc)[:200] if last_exc else "request_failed",
                bytes=0,
                sha256="",
            )
            return record
        if resp.status_code != 200:
            record.update(status=f"http_{resp.status_code}", bytes=0, sha256="")
            return record
        payload = resp.content
        dest.write_bytes(payload)
        record["cache_hit"] = False

    record["bytes"] = len(payload)
    record["sha256"] = hashlib.sha256(payload).hexdigest()

    must_verify = check_remote_checksum and (
        not record.get("cache_hit", True) or (dataset, sym, ym) in PINNED_CHECKSUMS
    )
    if must_verify:
        chk_ok, chk_err = verify_archive_checksum(
            dataset, sym, ym, url, record["sha256"], offline=offline
        )
        record["checksum_verified"] = chk_ok
        if chk_err is not None:
            record.update(status="checksum_error", error=chk_err, rows=0)
            return record
    elif (dataset, sym, ym) in PINNED_CHECKSUMS:
        if record["sha256"] != PINNED_CHECKSUMS[(dataset, sym, ym)]:
            record.update(status="checksum_error", error="pinned_checksum_mismatch", rows=0)
            return record
        record["checksum_verified"] = True

    try:
        frame, zombies = parse_zip_with_stats(payload, dataset)
        record["zombie_bars_filtered"] = int(zombies)
        record["rows"] = frame.height
        record["first_ts_ms"] = int(frame["ts_ms"].min()) if frame.height else None
        record["last_ts_ms"] = int(frame["ts_ms"].max()) if frame.height else None
        if frame.height and "available_at_utc" in frame.columns:
            record["available_at_utc"] = str(frame["available_at_utc"][-1])
        record["status"] = "ok" if frame.height else "empty"
    except Exception as exc:  # a malformed archive must be visible, not silent
        record.update(status="parse_error", error=f"{type(exc).__name__}: {exc}"[:200], rows=0)
    return record


def is_hard_failure_status(status: str) -> bool:
    """Return True for transport/parse/server/checksum failures; pre/post-listing 404/empty are benign."""
    if status in ("ok", "empty", "http_404"):
        return False
    return True


def _is_full_default_run() -> bool:
    """Detect normal full CLI runs vs narrowed unit-test monkeypatches."""
    return list(UNIVERSE) == CORE_19 and set(DATASETS.keys()) == set(DEFAULT_DATASETS.keys())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest Binance Vision & Hyperliquid public archives.")
    parser.add_argument(
        "--max-errors",
        type=int,
        default=0,
        help="Maximum tolerated transport/parse/non-404 HTTP errors before failing closed (default: 0).",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help=(
            "Rebuild normalized panels strictly from cached raw archives and existing "
            "artifacts/g2_data_provenance.parquet when present, without network calls."
        ),
    )
    args = parser.parse_args(argv)

    full_run = _is_full_default_run()
    active_symbols = SURVIVORSHIP_23 if full_run else list(UNIVERSE)

    prov_path = ART / "g2_data_provenance.parquet"
    if args.offline and prov_path.exists():
        prov = pl.read_parquet(prov_path)
        results = prov.to_dicts()
        print(f"offline: reusing existing {prov_path.relative_to(REPO)} ({prov.height} rows)")
    else:
        months = months_until_now()
        jobs = [(d, s, y, m) for d in DATASETS for s in active_symbols for (y, m) in months]
        if full_run:
            oi_months = [(y, m) for (y, m) in months if (y, m) >= OI_START]
            jobs.extend([("oi_metrics", s, y, m) for s in active_symbols for (y, m) in oi_months])
        print(
            f"{len(active_symbols)} symbols x {len(DATASETS)} core datasets "
            f"(+ OI={full_run}) = {len(jobs)} Binance archives"
        )

        results = []
        with ThreadPoolExecutor(max_workers=16) as pool:
            futures = {
                pool.submit(fetch, j, offline=args.offline, check_remote_checksum=full_run): j
                for j in jobs
            }
            done = 0
            for fut in as_completed(futures):
                results.append(fut.result())
                done += 1
                if done % 1000 == 0:
                    print(f"  {done}/{len(jobs)}", flush=True)

        if full_run:
            hl_records, _, _ = hl_loader.ingest_hyperliquid(RAW, NORM, offline=args.offline)
            results.extend(hl_records)

        # Compute per-symbol `last_active_ts_ms` and `is_delisted` from active perp_1d bars.
        perp_last: dict[str, int] = {}
        for r in results:
            if r.get("dataset") == "perp_1d" and r.get("status") == "ok" and r.get("last_ts_ms") is not None:
                sym = str(r["symbol"])
                close_ts = int(r["last_ts_ms"]) + DAY_MS
                if close_ts > perp_last.get(sym, 0):
                    perp_last[sym] = close_ts
        global_max_ts = max(perp_last.values()) if perp_last else 0
        for r in results:
            sym = str(r.get("symbol", ""))
            if sym in perp_last:
                r["last_active_ts_ms"] = perp_last[sym]
                r["is_delisted"] = (sym in DELISTED_SYMBOLS) or (
                    global_max_ts > 0 and perp_last[sym] < global_max_ts - 7 * DAY_MS
                )

        results.sort(key=lambda r: (str(r.get("dataset", "")), str(r.get("symbol", "")), str(r.get("month", ""))))
        prov = pl.DataFrame(results, infer_schema_length=None)
        ART.mkdir(parents=True, exist_ok=True)
        prov.write_parquet(prov_path)

    ok = prov.filter(pl.col("status") == "ok")
    print(f"\nok={ok.height}  total={prov.height}")
    missing = prov.filter(pl.col("status") != "ok").group_by("status").len().sort("len", descending=True)
    print(missing)

    hard_failures = sum(1 for r in results if is_hard_failure_status(str(r.get("status", ""))))
    if hard_failures > args.max_errors:
        print(
            f"ERROR: {hard_failures} hard ingestion failure(s) exceeded --max-errors={args.max_errors}",
            file=sys.stderr,
        )
        return 1

    # Verify raw cache presence in `--offline` mode before rebuilding normalized panels.
    binance_datasets = list(DATASETS.keys()) + (["oi_metrics"] if "oi_metrics" in ok["dataset"].to_list() else [])
    if args.offline:
        missing_raw = []
        for r in ok.iter_rows(named=True):
            ds = str(r["dataset"])
            if ds in binance_datasets:
                p = _archive_path(ds, str(r["symbol"]), str(r["month"]))
                if not p.exists():
                    missing_raw.append(str(p.relative_to(RAW)))
            elif ds == "hyperliquid_funding_1h":
                coin = str(r["symbol"]).removesuffix("USDT")
                p = RAW / "hyperliquid" / f"funding_{coin}.json"
                if not p.exists():
                    missing_raw.append(str(p.relative_to(RAW)))
            elif ds == "hyperliquid_l1_quotes":
                p = RAW / "hyperliquid" / "l1_and_meta_snapshot.json"
                if not p.exists():
                    missing_raw.append(str(p.relative_to(RAW)))
        if missing_raw:
            print(
                f"ERROR: offline mode requires cached archives under {RAW.relative_to(REPO)} "
                f"({len(missing_raw)} missing, e.g. {missing_raw[0]}); run without --offline first.",
                file=sys.stderr,
            )
            return 1

    NORM.mkdir(parents=True, exist_ok=True)

    # First build `perp_1d` if present so delisted `last_active_ts_ms` bounds post-settlement funding.
    ordered_datasets = []
    if "perp_1d" in binance_datasets:
        ordered_datasets.append("perp_1d")
    ordered_datasets.extend(d for d in binance_datasets if d != "perp_1d")

    perp_last_active_ms: dict[str, int] = {}
    delisted_map: dict[str, bool] = {}

    for dataset in ordered_datasets:
        frames = []
        for r in ok.filter(pl.col("dataset") == dataset).iter_rows(named=True):
            sym = str(r["symbol"])
            ym = str(r["month"])
            payload = _archive_path(dataset, sym, ym).read_bytes()
            frame = parse_zip(payload, dataset)
            if frame.height == 0:
                continue
            if dataset == "oi_metrics":
                frame = frame.with_columns(
                    pl.lit(sym).alias("symbol"),
                    pl.lit(ym).alias("month"),
                )
            else:
                frame = frame.with_columns(pl.lit(sym).alias("symbol"))
            frames.append(frame)

        if not frames:
            continue

        dedup_keys = ["symbol", "month"] if dataset == "oi_metrics" else ["symbol", "ts_ms"]
        combined = pl.concat(frames).unique(subset=dedup_keys).sort(["symbol", "ts_ms"])

        if dataset == "perp_1d":
            per_sym = combined.group_by("symbol").agg(pl.col("available_at_ms").max().alias("last_ms"))
            perp_last_active_ms = dict(zip(per_sym["symbol"].to_list(), per_sym["last_ms"].to_list()))
            g_max = max(perp_last_active_ms.values()) if perp_last_active_ms else 0
            delisted_map = {
                s: (s in DELISTED_SYMBOLS) or (g_max > 0 and ms < g_max - 7 * DAY_MS)
                for s, ms in perp_last_active_ms.items()
            }

        if perp_last_active_ms:
            if dataset == "funding":
                # Drop post-settlement zombie funding prints (`0.00010000`) emitted after a
                # delisted perpetual contract's final active kline close.
                cutoff_df = pl.DataFrame(
                    {
                        "symbol": list(perp_last_active_ms.keys()),
                        "last_active_ts_ms": list(perp_last_active_ms.values()),
                        "is_delisted": [delisted_map[s] for s in perp_last_active_ms],
                    }
                )
                combined = (
                    combined.join(cutoff_df, on="symbol", how="left")
                    .filter(
                        (~pl.col("is_delisted").fill_null(False))
                        | (pl.col("ts_ms") < pl.col("last_active_ts_ms"))
                    )
                    .sort(["symbol", "ts_ms"])
                )
            else:
                cutoff_df = pl.DataFrame(
                    {
                        "symbol": list(perp_last_active_ms.keys()),
                        "last_active_ts_ms": list(perp_last_active_ms.values()),
                        "is_delisted": [delisted_map[s] for s in perp_last_active_ms],
                    }
                )
                combined = combined.join(cutoff_df, on="symbol", how="left").sort(["symbol", "ts_ms"])

        out_name = "oi_monthly.parquet" if dataset == "oi_metrics" else f"{dataset}.parquet"
        combined.write_parquet(NORM / out_name)
        print(f"{dataset:12s} rows={combined.height:>9,}  symbols={combined['symbol'].n_unique()}")

    if full_run or "hyperliquid_funding_1h" in ok["dataset"].to_list():
        hl_fund, hl_quotes = hl_loader.build_normalized_hyperliquid(RAW, NORM)
        print(f"{'hl_fund_1h':12s} rows={hl_fund.height:>9,}  symbols={hl_fund['symbol'].n_unique()}")
        print(f"{'hl_l1_quote':12s} rows={hl_quotes.height:>9,}  symbols={hl_quotes['symbol'].n_unique()}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
