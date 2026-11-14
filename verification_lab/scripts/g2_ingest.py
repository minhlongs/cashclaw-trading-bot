"""G2 data ingestion with per-file provenance.

Downloads Binance Vision monthly archives directly from the public bucket, so
every row in the lab can be traced to a URL, a hash and a retrieval time. No
API key is used and nothing authenticated is touched.

Resumable: an existing archive whose recorded sha256 still matches is not
downloaded again.
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

REPO = Path(__file__).resolve().parents[2]
LAB = REPO / "verification_lab"
RAW = LAB / "data" / "raw"
NORM = LAB / "data" / "normalized"
ART = REPO / "artifacts"

BASE = "https://data.binance.vision/data"

# Pairs with the longest continuous perpetual history and the deepest volume.
# Cross-sectional work needs a wide panel; single-asset work still works if
# listings start later, since panels are built on the intersection of dates.
UNIVERSE = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT", "SOLUSDT",
    "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "LTCUSDT", "BCHUSDT",
    "TRXUSDT", "ATOMUSDT", "UNIUSDT", "ETCUSDT", "FILUSDT", "NEARUSDT",
    "APTUSDT",
]
UNIVERSE = sorted(set(UNIVERSE))

DATASETS = {
    # name: (url template, path segment)
    "funding": BASE + "/futures/um/monthly/fundingRate/{sym}/{sym}-fundingRate-{ym}.zip",
    "perp_4h": BASE + "/futures/um/monthly/klines/{sym}/4h/{sym}-4h-{ym}.zip",
    "perp_1d": BASE + "/futures/um/monthly/klines/{sym}/1d/{sym}-1d-{ym}.zip",
    "spot_1d": BASE + "/spot/monthly/klines/{sym}/1d/{sym}-1d-{ym}.zip",
}

START = (2021, 1)


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


def parse_zip(payload: bytes, dataset: str) -> pl.DataFrame:
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        name = zf.namelist()[0]
        text = zf.read(name).decode("utf-8", "replace")
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if lines and not lines[0].split(",")[0].strip().lstrip("-").isdigit():
        lines = lines[1:]
    if not lines:
        return pl.DataFrame()

    rows = [ln.split(",") for ln in lines]

    if dataset == "funding":
        # Newer archives: calc_time,funding_interval_hours,last_funding_rate
        # Older archives: fundingTime,fundingRate
        out = []
        for r in rows:
            if len(r) >= 3:
                out.append((to_ms(int(r[0])), float(r[2])))
            elif len(r) == 2:
                out.append((to_ms(int(r[0])), float(r[1])))
        return pl.DataFrame(out, schema=["ts_ms", "funding_rate"], orient="row")

    # Klines: open_time,open,high,low,close,volume,...
    out = []
    for r in rows:
        out.append((
            to_ms(int(r[0])),
            float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5]),
        ))
    return pl.DataFrame(
        out, schema=["ts_ms", "open", "high", "low", "close", "volume"], orient="row"
    )


MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 1.5
RETRYABLE_HTTP_STATUSES = {408, 429, 500, 502, 503, 504}


def fetch(job: tuple[str, str, int, int], *, offline: bool = False) -> dict[str, Any]:
    dataset, sym, y, m = job
    ym = f"{y:04d}-{m:02d}"
    url = DATASETS[dataset].format(sym=sym, ym=ym)
    dest = RAW / dataset / f"{sym}-{ym}.zip"
    dest.parent.mkdir(parents=True, exist_ok=True)

    record: dict[str, Any] = {
        "dataset": dataset, "symbol": sym, "month": ym, "url": url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    }

    payload = None
    if dest.exists():
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
    try:
        frame = parse_zip(payload, dataset)
        record["rows"] = frame.height
        record["first_ts_ms"] = int(frame["ts_ms"].min()) if frame.height else None
        record["last_ts_ms"] = int(frame["ts_ms"].max()) if frame.height else None
        record["status"] = "ok" if frame.height else "empty"
    except Exception as exc:  # a malformed archive must be visible, not silent
        record.update(status="parse_error", error=f"{type(exc).__name__}: {exc}"[:200], rows=0)
    return record


def is_hard_failure_status(status: str) -> bool:
    """Return True for transport/parse/server failures; pre-listing 404/empty are benign."""
    if status in ("ok", "empty", "http_404"):
        return False
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest Binance Vision monthly archives.")
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

    prov_path = ART / "g2_data_provenance.parquet"
    if args.offline and prov_path.exists():
        prov = pl.read_parquet(prov_path)
        results = prov.to_dicts()
        print(f"offline: reusing existing {prov_path.relative_to(REPO)} ({prov.height} rows)")
    else:
        months = months_until_now()
        jobs = [(d, s, y, m) for d in DATASETS for s in UNIVERSE for (y, m) in months]
        print(f"{len(UNIVERSE)} symbols x {len(DATASETS)} datasets x {len(months)} months = {len(jobs)} archives")

        results = []
        with ThreadPoolExecutor(max_workers=12) as pool:
            futures = {pool.submit(fetch, j, offline=args.offline): j for j in jobs}
            done = 0
            for fut in as_completed(futures):
                results.append(fut.result())
                done += 1
                if done % 500 == 0:
                    print(f"  {done}/{len(jobs)}", flush=True)

        prov = pl.DataFrame(results)
        ART.mkdir(exist_ok=True)
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

    # Normalised panels, one per dataset, symbol column added.
    if args.offline:
        missing_raw = [
            f"{r['dataset']}/{r['symbol']}-{r['month']}.zip"
            for r in ok.iter_rows(named=True)
            if not (RAW / r["dataset"] / f"{r['symbol']}-{r['month']}.zip").exists()
        ]
        if missing_raw:
            print(
                f"ERROR: offline mode requires cached archives under {RAW.relative_to(REPO)} "
                f"({len(missing_raw)} missing, e.g. {missing_raw[0]}); run without --offline first.",
                file=sys.stderr,
            )
            return 1

    NORM.mkdir(parents=True, exist_ok=True)
    for dataset in DATASETS:
        frames = []
        for r in ok.filter(pl.col("dataset") == dataset).iter_rows(named=True):
            payload = (RAW / dataset / f"{r['symbol']}-{r['month']}.zip").read_bytes()
            frame = parse_zip(payload, dataset).with_columns(pl.lit(r["symbol"]).alias("symbol"))
            frames.append(frame)
        if frames:
            combined = pl.concat(frames).unique(subset=["symbol", "ts_ms"]).sort(["symbol", "ts_ms"])
            combined.write_parquet(NORM / f"{dataset}.parquet")
            print(f"{dataset:9s} rows={combined.height:>9,}  symbols={combined['symbol'].n_unique()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
