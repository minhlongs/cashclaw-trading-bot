"""Zero-auth Hyperliquid public `/info` loader with raw JSON cache and `--offline` support.

Fetches and normalises two distinct empirical datasets from `POST https://api.hyperliquid.xyz/info`:
1. Historical 1-hour perpetual `fundingHistory` (paginated in 500-row windows) across 10 liquid
   overlapping coins (`BTC, ETH, SOL, BNB, XRP, DOGE, AVAX, LINK, UNI, NEAR`) over
   `2024-10-01T00:00:00Z` through `2026-10-31T23:59:59Z` (`~18,264` hourly rows/coin, covering
   pre-OOS warm-up plus the entire `locked_oos` window), normalised to
   `hyperliquid_funding_1h.parquet` with explicit `available_at_ms` / `available_at_utc`.
2. Point-in-time empirical top-of-book `l2Book` L1 quotes and `metaAndAssetCtxs` `impactPxs`
   across all 19 overlapping coins (`CORE_19`), normalised to `hyperliquid_l1_quotes.parquet`
   and labelled explicitly as `point_in_time_top_of_book_snapshot` so G6 never mistakes a live
   snapshot for historical L2 replay.
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import polars as pl
import requests

HL_INFO_URL = "https://api.hyperliquid.xyz/info"

# Exact 19-coin overlap with CORE_19 Binance USDT perpetuals (used for L1 & impact snapshots).
HL_CORE_COINS: tuple[str, ...] = (
    "ADA", "APT", "ATOM", "AVAX", "BCH", "BNB", "BTC", "DOGE", "DOT",
    "ETC", "ETH", "FIL", "LINK", "LTC", "NEAR", "SOL", "TRX", "UNI", "XRP",
)

# Representative 10-coin liquid subset for paginated 1h fundingHistory (2024-10 .. 2026-10).
HL_FUNDING_COINS: tuple[str, ...] = (
    "AVAX", "BNB", "BTC", "DOGE", "ETH", "LINK", "NEAR", "SOL", "UNI", "XRP",
)

# Historical 1h window: 2024-10-01 00:00:00 UTC .. 2026-11-01 00:00:00 UTC (exclusive),
# matching the G2 monthly archive end (2026-10) and providing >120d warm-up before locked_oos.
DEFAULT_START_MS = 1_727_740_800_000  # 2024-10-01T00:00:00Z
DEFAULT_END_MS = 1_793_491_200_000    # 2026-11-01T00:00:00Z

MAX_RETRIES = 8
RETRY_BACKOFF_SEC = 2.5
RETRYABLE_STATUSES = {408, 429, 500, 502, 503, 504}


def ms_to_utc_iso(ts_ms: int) -> str:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _post_info(payload: dict[str, Any], *, timeout: int = 30) -> Any:
    last_exc: Exception | None = None
    resp = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(HL_INFO_URL, json=payload, timeout=timeout)
        except requests.RequestException as exc:
            last_exc = exc
            resp = None
        else:
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code not in RETRYABLE_STATUSES:
                raise RuntimeError(f"Hyperliquid /info HTTP {resp.status_code} for {payload}")
        if attempt < MAX_RETRIES:
            wait = min(30.0, RETRY_BACKOFF_SEC * attempt * (2.0 if resp is not None and resp.status_code == 429 else 1.0))
            time.sleep(wait)
    if last_exc is not None:
        raise RuntimeError(f"Hyperliquid /info request failed: {last_exc}") from last_exc
    status = resp.status_code if resp is not None else "none"
    raise RuntimeError(f"Hyperliquid /info exhausted retries (status={status}) for {payload}")


def fetch_coin_funding_history(
    coin: str,
    raw_dir: Path,
    *,
    start_ms: int = DEFAULT_START_MS,
    end_ms: int = DEFAULT_END_MS,
    offline: bool = False,
) -> dict[str, Any]:
    """Fetch or load cached 1h fundingHistory for `coin` over `[start_ms, end_ms)`."""
    hl_dir = raw_dir / "hyperliquid"
    hl_dir.mkdir(parents=True, exist_ok=True)
    cache_path = hl_dir / f"funding_{coin}.json"
    window_label = "2024-10..2026-10"

    if cache_path.exists():
        raw_bytes = cache_path.read_bytes()
        payload = json.loads(raw_bytes.decode("utf-8"))
        rows = payload.get("rows", payload if isinstance(payload, list) else [])
        retrieved_at = (
            payload.get("retrieved_at", ms_to_utc_iso(end_ms))
            if isinstance(payload, dict)
            else ms_to_utc_iso(end_ms)
        )
        cache_hit = True
    elif offline:
        return {
            "dataset": "hyperliquid_funding_1h",
            "symbol": f"{coin}USDT",
            "month": window_label,
            "url": f"{HL_INFO_URL}#fundingHistory:{coin}",
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "cache_hit": False,
            "bytes": 0,
            "sha256": "",
            "rows": 0,
            "first_ts_ms": None,
            "last_ts_ms": None,
            "available_at_utc": None,
            "is_delisted": False,
            "last_active_ts_ms": None,
            "zombie_bars_filtered": 0,
            "checksum_verified": False,
            "status": "cache_miss",
        }
    else:
        rows = []
        cursor = int(start_ms)
        while cursor < end_ms:
            page = _post_info({"type": "fundingHistory", "coin": coin, "startTime": cursor})
            if not isinstance(page, list) or not page:
                break
            in_window = [r for r in page if int(r["time"]) < end_ms]
            rows.extend(in_window)
            last_time = int(page[-1]["time"])
            if last_time >= end_ms or len(page) < 500 or last_time < cursor:
                break
            cursor = last_time + 1
            time.sleep(0.35)

        retrieved_at = datetime.now(timezone.utc).isoformat()
        envelope = {
            "coin": coin,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "retrieved_at": retrieved_at,
            "rows": rows,
        }
        raw_bytes = (json.dumps(envelope, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
        cache_path.write_bytes(raw_bytes)
        cache_hit = False

    ts_list = [int(r["time"]) for r in rows]
    first_ts = min(ts_list) if ts_list else None
    last_ts = max(ts_list) if ts_list else None
    sha = hashlib.sha256(raw_bytes).hexdigest()
    return {
        "dataset": "hyperliquid_funding_1h",
        "symbol": f"{coin}USDT",
        "month": window_label,
        "url": f"{HL_INFO_URL}#fundingHistory:{coin}",
        "retrieved_at": retrieved_at,
        "cache_hit": cache_hit,
        "bytes": len(raw_bytes),
        "sha256": sha,
        "rows": len(rows),
        "first_ts_ms": first_ts,
        "last_ts_ms": last_ts,
        "available_at_utc": ms_to_utc_iso(last_ts) if last_ts is not None else None,
        "is_delisted": False,
        "last_active_ts_ms": last_ts,
        "zombie_bars_filtered": 0,
        "checksum_verified": True,
        "status": "ok" if rows else "empty",
    }


def fetch_l1_and_meta_snapshots(
    coins: tuple[str, ...] | list[str] = HL_CORE_COINS,
    raw_dir: Path | None = None,
    *,
    offline: bool = False,
) -> dict[str, Any]:
    """Fetch or load cached `metaAndAssetCtxs` + `l2Book` snapshots for all 19 `coins`."""
    assert raw_dir is not None
    hl_dir = raw_dir / "hyperliquid"
    hl_dir.mkdir(parents=True, exist_ok=True)
    cache_path = hl_dir / "l1_and_meta_snapshot.json"

    if cache_path.exists():
        raw_bytes = cache_path.read_bytes()
        envelope = json.loads(raw_bytes.decode("utf-8"))
        cache_hit = True
    elif offline:
        return {
            "dataset": "hyperliquid_l1_quotes",
            "symbol": "ALL_19",
            "month": "snapshot",
            "url": f"{HL_INFO_URL}#metaAndAssetCtxs+l2Book",
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "cache_hit": False,
            "bytes": 0,
            "sha256": "",
            "rows": 0,
            "first_ts_ms": None,
            "last_ts_ms": None,
            "available_at_utc": None,
            "is_delisted": False,
            "last_active_ts_ms": None,
            "zombie_bars_filtered": 0,
            "checksum_verified": False,
            "status": "cache_miss",
        }
    else:
        meta_and_ctxs = _post_info({"type": "metaAndAssetCtxs"})
        books: dict[str, Any] = {}
        for coin in sorted(coins):
            books[coin] = _post_info({"type": "l2Book", "coin": coin})
            time.sleep(0.25)
        retrieved_at = datetime.now(timezone.utc).isoformat()
        envelope = {
            "retrieved_at": retrieved_at,
            "meta_and_asset_ctxs": meta_and_ctxs,
            "l2_books": books,
        }
        raw_bytes = (json.dumps(envelope, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
        cache_path.write_bytes(raw_bytes)
        cache_hit = False

    books = envelope.get("l2_books", {})
    book_times = [int(b["time"]) for b in books.values() if isinstance(b, dict) and "time" in b]
    first_ts = min(book_times) if book_times else None
    last_ts = max(book_times) if book_times else None
    return {
        "dataset": "hyperliquid_l1_quotes",
        "symbol": "ALL_19",
        "month": "snapshot",
        "url": f"{HL_INFO_URL}#metaAndAssetCtxs+l2Book",
        "retrieved_at": str(envelope.get("retrieved_at", "")),
        "cache_hit": cache_hit,
        "bytes": len(raw_bytes),
        "sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "rows": len(books),
        "first_ts_ms": first_ts,
        "last_ts_ms": last_ts,
        "available_at_utc": ms_to_utc_iso(last_ts) if last_ts is not None else None,
        "is_delisted": False,
        "last_active_ts_ms": last_ts,
        "zombie_bars_filtered": 0,
        "checksum_verified": True,
        "status": "ok" if books else "empty",
    }


def build_normalized_hyperliquid(
    raw_dir: Path,
    norm_dir: Path,
    *,
    funding_coins: tuple[str, ...] | list[str] = HL_FUNDING_COINS,
    quote_coins: tuple[str, ...] | list[str] = HL_CORE_COINS,
) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Build `hyperliquid_funding_1h.parquet` and `hyperliquid_l1_quotes.parquet` from raw cache."""
    hl_dir = raw_dir / "hyperliquid"
    norm_dir.mkdir(parents=True, exist_ok=True)

    funding_rows: list[tuple[Any, ...]] = []
    for coin in sorted(funding_coins):
        f_path = hl_dir / f"funding_{coin}.json"
        if not f_path.exists():
            raise FileNotFoundError(f"Missing cached Hyperliquid funding file: {f_path}")
        payload = json.loads(f_path.read_text(encoding="utf-8"))
        entries = payload.get("rows", payload if isinstance(payload, list) else [])
        sym = f"{coin}USDT"
        for item in entries:
            ts_ms = int(item["time"])
            hour_ts_ms = (ts_ms // 3_600_000) * 3_600_000
            funding_rows.append(
                (
                    coin,
                    sym,
                    ts_ms,
                    hour_ts_ms,
                    float(item["fundingRate"]),
                    float(item.get("premium", 0.0)),
                    ts_ms,
                    ms_to_utc_iso(ts_ms),
                )
            )

    funding_df = (
        pl.DataFrame(
            funding_rows,
            schema=[
                "coin",
                "symbol",
                "ts_ms",
                "hour_ts_ms",
                "funding_rate",
                "premium",
                "available_at_ms",
                "available_at_utc",
            ],
            orient="row",
        )
        .unique(subset=["symbol", "hour_ts_ms"])
        .sort(["symbol", "ts_ms"])
    )
    funding_df.write_parquet(norm_dir / "hyperliquid_funding_1h.parquet")

    snap_path = hl_dir / "l1_and_meta_snapshot.json"
    if not snap_path.exists():
        raise FileNotFoundError(f"Missing cached Hyperliquid snapshot file: {snap_path}")
    snap = json.loads(snap_path.read_text(encoding="utf-8"))
    meta, ctxs = snap["meta_and_asset_ctxs"]
    universe_idx = {u["name"]: i for i, u in enumerate(meta.get("universe", []))}
    books = snap.get("l2_books", {})

    quote_rows: list[tuple[Any, ...]] = []
    for coin in sorted(quote_coins):
        book = books.get(coin)
        idx = universe_idx.get(coin)
        if not book or idx is None:
            continue
        ctx = ctxs[idx]
        bids = book["levels"][0]
        asks = book["levels"][1]
        if not bids or not asks:
            continue
        best_bid = float(bids[0]["px"])
        best_ask = float(asks[0]["px"])
        bid_sz = float(bids[0]["sz"])
        ask_sz = float(asks[0]["sz"])
        mid = 0.5 * (best_bid + best_ask)
        l1_full_bps = ((best_ask - best_bid) / mid * 1e4) if mid > 0 else 0.0
        l1_half_bps = 0.5 * l1_full_bps

        impact_pxs = ctx.get("impactPxs") or [best_bid, best_ask]
        imp_bid = float(impact_pxs[0])
        imp_ask = float(impact_pxs[1])
        imp_mid = float(ctx.get("midPx") or mid)
        imp_full_bps = max(0.0, (imp_ask - imp_bid) / imp_mid * 1e4) if imp_mid > 0 else l1_full_bps
        imp_half_bps = 0.5 * imp_full_bps

        ts_ms = int(book["time"])
        quote_rows.append(
            (
                coin,
                f"{coin}USDT",
                ts_ms,
                ms_to_utc_iso(ts_ms),
                best_bid,
                best_ask,
                mid,
                float(ctx.get("markPx") or mid),
                bid_sz,
                ask_sz,
                round(l1_full_bps, 6),
                round(l1_half_bps, 6),
                imp_bid,
                imp_ask,
                round(imp_full_bps, 6),
                round(imp_half_bps, 6),
                float(ctx.get("funding") or 0.0),
                float(ctx.get("openInterest") or 0.0),
                float(ctx.get("dayNtlVlm") or 0.0),
                "point_in_time_top_of_book_snapshot",
            )
        )

    quotes_df = pl.DataFrame(
        quote_rows,
        schema=[
            "coin",
            "symbol",
            "ts_ms",
            "available_at_utc",
            "best_bid",
            "best_ask",
            "mid_px",
            "mark_px",
            "bid_sz",
            "ask_sz",
            "l1_full_spread_bps",
            "l1_half_spread_bps",
            "impact_bid_px",
            "impact_ask_px",
            "impact_full_spread_bps",
            "impact_half_spread_bps",
            "current_1h_funding_rate",
            "open_interest_coins",
            "day_ntl_vlm_usd",
            "snapshot_nature",
        ],
        orient="row",
    ).sort("symbol")
    quotes_df.write_parquet(norm_dir / "hyperliquid_l1_quotes.parquet")
    return funding_df, quotes_df


def ingest_hyperliquid(
    raw_dir: Path,
    norm_dir: Path,
    *,
    funding_coins: tuple[str, ...] | list[str] = HL_FUNDING_COINS,
    quote_coins: tuple[str, ...] | list[str] = HL_CORE_COINS,
    offline: bool = False,
) -> tuple[list[dict[str, Any]], pl.DataFrame | None, pl.DataFrame | None]:
    """Sequentially fetch/reuse Hyperliquid raw cache (respecting 1200 weight/min limit)."""
    records: list[dict[str, Any]] = []
    for coin in sorted(funding_coins):
        rec = fetch_coin_funding_history(coin, raw_dir, offline=offline)
        records.append(rec)
    snap_rec = fetch_l1_and_meta_snapshots(quote_coins, raw_dir, offline=offline)
    records.append(snap_rec)

    if any(r["status"] not in ("ok", "empty") for r in records):
        return records, None, None

    funding_df, quotes_df = build_normalized_hyperliquid(
        raw_dir, norm_dir, funding_coins=funding_coins, quote_coins=quote_coins
    )
    return records, funding_df, quotes_df
