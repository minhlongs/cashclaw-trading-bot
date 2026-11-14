"""Millisecond L2 `bookDepth` + `perp/spot aggTrades` FIFO queue & adverse-selection calibrator.

Self-contained HftBacktest-methodology two-leg synchronised execution simulator over public
`data.binance.vision` daily tick and depth archives with mandatory `.CHECKSUM` SHA-256
verification and deterministic `--offline` replay from `verification_lab/data/raw/tick_calibration/`.

Zero OOS leakage invariant:
* Only `train` rebalance dates (`<= 2024-12-31`, strictly prior to the `locked_oos` split)
  feed the calibrated `H3_MAKER` queue, adverse-selection, and emergency-taker spread bounds.
* `locked_oos` rebalance dates (`>= 2025-04-01` post-embargo) are replayed and reported in a
  strictly separate verification block and are NEVER fed back into train parameters.
"""

from __future__ import annotations

import hashlib
import io
import math
import re
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
import requests

BASE_VISION_URL = "https://data.binance.vision/data"
SYMBOL_RE = re.compile(r"^[A-Z0-9]{2,20}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_HTTP_DOWNLOAD_BYTES = 256 * 1024 * 1024  # 256 MiB compressed archive ceiling
MAX_UNCOMPRESSED_CSV_BYTES = 512 * 1024 * 1024  # 512 MiB uncompressed CSV ceiling
MARKOUT_HORIZONS_MS: tuple[tuple[str, int], ...] = (
    ("1s", 1_000),
    ("5s", 5_000),
    ("10s", 10_000),
    ("30s", 30_000),
    ("60s", 60_000),
)

DATASET_URL_TEMPLATES: dict[str, str] = {
    "perp_book_depth": BASE_VISION_URL + "/futures/um/daily/bookDepth/{sym}/{sym}-bookDepth-{date}.zip",
    "perp_agg_trades": BASE_VISION_URL + "/futures/um/daily/aggTrades/{sym}/{sym}-aggTrades-{date}.zip",
    "spot_agg_trades": BASE_VISION_URL + "/spot/daily/aggTrades/{sym}/{sym}-aggTrades-{date}.zip",
}

MAX_HTTP_RETRIES = 6
RETRYABLE_HTTP = {408, 429, 500, 502, 503, 504}


@dataclass(frozen=True)
class RebalanceSampleSpec:
    split: str  # "train" | "locked_oos"
    symbol: str
    date: str  # YYYY-MM-DD
    direction: str  # "entry" (buy spot, sell perp) | "exit" (sell spot, buy perp)
    pair_weight_delta: float


@dataclass(frozen=True)
class TickStream:
    symbol: str
    leg: str  # "spot" | "perp"
    ts_ms: np.ndarray  # int64 sorted ascending
    price: np.ndarray  # float64
    qty_usd: np.ndarray  # float64 (price * base_qty)
    is_buyer_maker: np.ndarray  # bool (True => seller aggressor hit bid; False => buyer aggressor lifted ask)
    tick_size: float


@dataclass(frozen=True)
class BookDepthSnapshots:
    symbol: str
    ts_ms: np.ndarray  # int64 sorted ascending
    bid_bucket_pct: np.ndarray  # float64 (e.g. -0.2 or -1.0)
    bid_notional_usd: np.ndarray  # float64
    ask_bucket_pct: np.ndarray  # float64 (e.g. +0.2 or +1.0)
    ask_notional_usd: np.ndarray  # float64


def normalise_timestamp_ms(raw_ts: int) -> int:
    """Normalise Binance millisecond or microsecond epoch integers to integer milliseconds."""
    if raw_ts >= 100_000_000_000_000:  # >= 1e14 -> microseconds (2025+ spot archives)
        return int(raw_ts // 1_000)
    if raw_ts >= 100_000_000_000:  # >= 1e11 -> milliseconds
        return int(raw_ts)
    return int(raw_ts * 1_000)


def parse_expected_checksum(checksum_text: str) -> str:
    tokens = checksum_text.strip().split()
    if not tokens or len(tokens[0]) != 64:
        raise ValueError(f"Malformed Binance .CHECKSUM payload: {checksum_text!r}")
    digest = tokens[0].lower()
    int(digest, 16)  # validate hex
    return digest


def _validate_archive_identifiers(symbol: str, date: str) -> None:
    if not SYMBOL_RE.fullmatch(symbol):
        raise ValueError(f"Invalid archive symbol {symbol!r}; expected ^[A-Z0-9]{{2,20}}$")
    if not DATE_RE.fullmatch(date):
        raise ValueError(f"Invalid archive date {date!r}; expected YYYY-MM-DD")
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"Non-existent calendar date {date!r}") from exc


def _http_get_bytes(
    url: str,
    *,
    timeout: int = 45,
    max_bytes: int = MAX_HTTP_DOWNLOAD_BYTES,
) -> bytes:
    last_exc: Exception | None = None
    for attempt in range(1, MAX_HTTP_RETRIES + 1):
        try:
            with requests.get(url, timeout=timeout, stream=True) as resp:
                if resp.status_code == 200:
                    chunks: list[bytes] = []
                    total = 0
                    for chunk in resp.iter_content(chunk_size=65_536):
                        if not chunk:
                            continue
                        total += len(chunk)
                        if total > max_bytes:
                            raise ValueError(
                                f"HTTP download from {url} exceeded {max_bytes} byte ceiling"
                            )
                        chunks.append(chunk)
                    return b"".join(chunks)
                if resp.status_code not in RETRYABLE_HTTP:
                    raise RuntimeError(f"HTTP {resp.status_code} fetching {url}")
        except requests.RequestException as exc:
            last_exc = exc
        if attempt < MAX_HTTP_RETRIES:
            time.sleep(min(15.0, 1.5 * attempt))
    raise RuntimeError(f"Failed fetching {url}: {last_exc}")


def _read_bounded_single_csv_from_zip(
    zip_bytes: bytes,
    *,
    max_uncompressed_bytes: int = MAX_UNCOMPRESSED_CSV_BYTES,
) -> bytes:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        if len(names) != 1:
            raise ValueError(f"Expected single-entry ZIP archive, got {len(names)} entries")
        csv_name = names[0]
        if "/" in csv_name or "\\" in csv_name or ".." in csv_name or ":" in csv_name:
            raise ValueError(f"Unsafe ZIP entry path: {csv_name!r}")
        info = zf.getinfo(csv_name)
        if info.file_size > max_uncompressed_bytes:
            raise ValueError(
                f"ZIP entry {csv_name!r} declared size {info.file_size} exceeds {max_uncompressed_bytes} byte ceiling"
            )
        with zf.open(info, "r") as fp:
            raw_csv = fp.read(max_uncompressed_bytes + 1)
        if len(raw_csv) > max_uncompressed_bytes:
            raise ValueError(
                f"ZIP entry {csv_name!r} actual uncompressed size exceeds {max_uncompressed_bytes} byte ceiling"
            )
        return raw_csv


def fetch_verified_vision_zip(
    dataset: str,
    symbol: str,
    date: str,
    cache_root: Path,
    *,
    offline: bool = False,
) -> tuple[bytes, dict[str, Any]]:
    """Fetch or load a daily Binance Vision zip archive and verify its SHA-256 `.CHECKSUM`."""
    if dataset not in DATASET_URL_TEMPLATES:
        raise KeyError(f"Unknown tick calibration dataset {dataset!r}")
    _validate_archive_identifiers(symbol, date)
    url = DATASET_URL_TEMPLATES[dataset].format(sym=symbol, date=date)
    checksum_url = url + ".CHECKSUM"
    filename = url.rsplit("/", 1)[-1]
    resolved_cache_root = cache_root.resolve()
    target_dir = (resolved_cache_root / dataset / symbol).resolve()
    if not target_dir.is_relative_to(resolved_cache_root):
        raise ValueError(f"Resolved cache directory {target_dir} escapes {resolved_cache_root}")
    zip_path = target_dir / filename
    chk_path = target_dir / f"{filename}.CHECKSUM"

    zip_bytes = b""
    actual_sha = ""
    cache_hit = zip_path.exists() and chk_path.exists()
    if cache_hit:
        cached_size = zip_path.stat().st_size
        if cached_size > MAX_HTTP_DOWNLOAD_BYTES:
            raise ValueError(
                f"Cached archive {zip_path} size {cached_size} exceeds {MAX_HTTP_DOWNLOAD_BYTES} byte ceiling"
            )
        zip_bytes = zip_path.read_bytes()
        expected_sha = parse_expected_checksum(chk_path.read_text(encoding="utf-8"))
        actual_sha = hashlib.sha256(zip_bytes).hexdigest()
        if actual_sha != expected_sha:
            if offline:
                raise ValueError(
                    f"Cached SHA-256 mismatch in --offline mode for {zip_path}: "
                    f"actual {actual_sha} != expected {expected_sha}"
                )
            cache_hit = False

    if not cache_hit:
        if offline:
            raise FileNotFoundError(
                f"Missing cached tick archive in --offline mode: {zip_path}"
            )
        target_dir.mkdir(parents=True, exist_ok=True)
        chk_bytes = _http_get_bytes(checksum_url)
        expected_sha = parse_expected_checksum(chk_bytes.decode("utf-8", "replace"))
        zip_bytes = _http_get_bytes(url)
        actual_sha = hashlib.sha256(zip_bytes).hexdigest()
        if actual_sha != expected_sha:
            raise ValueError(
                f"Downloaded SHA-256 mismatch for {url}: actual {actual_sha} != expected {expected_sha}"
            )
        zip_path.write_bytes(zip_bytes)
        chk_path.write_bytes(chk_bytes)

    return zip_bytes, {
        "dataset": dataset,
        "symbol": symbol,
        "date": date,
        "url": url,
        "checksum_url": checksum_url,
        "bytes": len(zip_bytes),
        "sha256": actual_sha,
        "checksum_verified": True,
        "cache_hit": cache_hit,
    }


def _infer_tick_size(prices: np.ndarray) -> float:
    uniq = np.unique(prices[np.isfinite(prices) & (prices > 0.0)])
    if uniq.size < 2:
        return max(1e-6, float(uniq[0]) * 1e-4) if uniq.size == 1 else 1e-4
    diffs = np.diff(uniq)
    pos = diffs[diffs > 1e-9]
    if pos.size == 0:
        return max(1e-6, float(uniq[0]) * 1e-4)
    # Use 5th percentile of unique price step gaps and snap to decimal grid to resist float noise.
    raw = float(np.percentile(pos, 5))
    exp = math.floor(math.log10(raw) + 1e-9)
    base = 10.0**exp
    mant = raw / base
    snapped = 1.0 if mant < 1.5 else (2.0 if mant < 3.5 else (5.0 if mant < 7.5 else 10.0))
    return round(snapped * base, 8)


def parse_agg_trades_zip(zip_bytes: bytes, *, symbol: str, leg: str) -> TickStream:
    """Parse `futures/um` or `spot` daily `aggTrades` zip into chronological `TickStream`."""
    raw_csv = _read_bounded_single_csv_from_zip(zip_bytes)

    first_line = raw_csv.split(b"\n", 1)[0].decode("utf-8", "replace").strip()
    has_header = bool(first_line) and not (first_line[0].isdigit() or first_line[0] == "-")

    df = pl.read_csv(
        io.BytesIO(raw_csv),
        has_header=has_header,
        infer_schema_length=1000,
    )
    cols = df.columns
    if len(cols) < 7:
        raise ValueError(f"Expected >= 7 columns in aggTrades archive for {symbol} {leg}, got {cols}")

    df = df.select(
        [
            pl.col(cols[0]).cast(pl.Int64).alias("agg_id"),
            pl.col(cols[1]).cast(pl.Float64).alias("price"),
            pl.col(cols[2]).cast(pl.Float64).alias("qty"),
            pl.col(cols[5]).cast(pl.Int64).alias("raw_ts"),
            pl.col(cols[6]).cast(pl.Utf8).str.to_lowercase().is_in(["true", "1", "t"]).alias("is_bm"),
        ]
    ).filter((pl.col("price") > 0.0) & (pl.col("qty") > 0.0))

    df = (
        df.with_columns(
            pl.when(pl.col("raw_ts") >= 100_000_000_000_000)
            .then(pl.col("raw_ts") // 1_000)
            .when(pl.col("raw_ts") >= 100_000_000_000)
            .then(pl.col("raw_ts"))
            .otherwise(pl.col("raw_ts") * 1_000)
            .cast(pl.Int64)
            .alias("ts_ms")
        )
        .sort(["ts_ms", "agg_id"])
    )

    prices = df["price"].to_numpy()
    qty = df["qty"].to_numpy()
    return TickStream(
        symbol=symbol,
        leg=leg,
        ts_ms=df["ts_ms"].to_numpy(),
        price=prices,
        qty_usd=prices * qty,
        is_buyer_maker=df["is_bm"].to_numpy(),
        tick_size=_infer_tick_size(prices),
    )


def parse_book_depth_zip(zip_bytes: bytes, *, symbol: str) -> BookDepthSnapshots:
    """Parse `futures/um/daily/bookDepth` zip into innermost bid/ask cumulative depth snapshots."""
    raw_csv = _read_bounded_single_csv_from_zip(zip_bytes)

    first_line = raw_csv.split(b"\n", 1)[0].decode("utf-8", "replace").strip()
    has_header = bool(first_line) and not first_line[0].isdigit()
    df = pl.read_csv(io.BytesIO(raw_csv), has_header=has_header)
    cols = df.columns
    if len(cols) < 4:
        raise ValueError(f"Expected >= 4 columns in bookDepth archive for {symbol}, got {cols}")

    ts_col, pct_col, not_col = cols[0], cols[1], cols[3]
    df = df.select(
        [
            pl.col(ts_col).cast(pl.Utf8).str.strip_chars().alias("ts_str"),
            pl.col(pct_col).cast(pl.Float64).alias("pct"),
            pl.col(not_col).cast(pl.Float64).alias("notional"),
        ]
    ).filter(pl.col("notional") > 0.0)

    # Parse ISO timestamp `"YYYY-MM-DD HH:MM:SS"` (or numeric epoch) into UTC `ts_ms`.
    sample_ts = df["ts_str"][0] if df.height else ""
    if sample_ts.isdigit():
        df = df.with_columns(
            pl.col("ts_str")
            .cast(pl.Int64)
            .map_elements(normalise_timestamp_ms, return_dtype=pl.Int64)
            .alias("ts_ms")
        )
    else:
        df = df.with_columns(
            pl.col("ts_str")
            .str.to_datetime("%Y-%m-%d %H:%M:%S", time_zone="UTC", strict=False)
            .dt.epoch("ms")
            .cast(pl.Int64)
            .alias("ts_ms")
        ).drop_nulls("ts_ms")

    # Innermost bid bucket = largest negative percentage (e.g. -0.2% if present, else -1.0%).
    bids = (
        df.filter(pl.col("pct") < 0.0)
        .sort(["ts_ms", "pct"])
        .group_by("ts_ms", maintain_order=True)
        .agg(
            pl.col("pct").last().alias("bid_pct"),
            pl.col("notional").last().alias("bid_notional"),
        )
    )
    # Innermost ask bucket = smallest positive percentage (e.g. +0.2% if present, else +1.0%).
    asks = (
        df.filter(pl.col("pct") > 0.0)
        .sort(["ts_ms", "pct"])
        .group_by("ts_ms", maintain_order=True)
        .agg(
            pl.col("pct").first().alias("ask_pct"),
            pl.col("notional").first().alias("ask_notional"),
        )
    )
    joined = bids.join(asks, on="ts_ms", how="inner").sort("ts_ms")
    return BookDepthSnapshots(
        symbol=symbol,
        ts_ms=joined["ts_ms"].to_numpy(),
        bid_bucket_pct=joined["bid_pct"].to_numpy(),
        bid_notional_usd=joined["bid_notional"].to_numpy(),
        ask_bucket_pct=joined["ask_pct"].to_numpy(),
        ask_notional_usd=joined["ask_notional"].to_numpy(),
    )


def estimate_l1_queue_ahead_usd(
    bucket_notional_usd: float,
    bucket_pct: float,
    *,
    tick_size: float,
    mid_price: float,
    volume_scale: float = 1.0,
    touch_concentration: float = 2.5,
) -> float:
    """Scale cumulative percentage-bucket depth (`-0.2%` / `-1%`) to L1 top-of-book queue ahead.

    Across `B = |bucket_pct| * 100` bps spanning `N_levels = B / tick_bps` discrete price levels,
    near-touch density concentrates `touch_concentration / N_levels` of cumulative depth at the
    best quote where a newly placed passive slice joins the back of the FIFO queue.
    """
    if bucket_notional_usd <= 0.0 or mid_price <= 0.0:
        return 0.0
    bucket_bps = max(0.1, abs(float(bucket_pct)) * 100.0)
    tick_bps = max(0.1, float(tick_size) / float(mid_price) * 1e4)
    if bucket_bps <= tick_bps * 1.25:
        l1_share = 1.0
    else:
        l1_share = min(0.50, max(0.01, float(touch_concentration) * (tick_bps / bucket_bps)))
    return float(bucket_notional_usd) * l1_share * max(0.05, float(volume_scale))


def causal_quote_at(stream: TickStream, t0_ms: int) -> tuple[float, float, float] | None:
    """Reconstruct causal `(best_bid, best_ask, mid)` strictly from trades at `ts_ms <= t0_ms`."""
    idx = int(np.searchsorted(stream.ts_ms, t0_ms, side="right")) - 1
    if idx < 0:
        return None
    lo = max(0, idx - 2_000)
    win_px = stream.price[lo : idx + 1]
    win_bm = stream.is_buyer_maker[lo : idx + 1]
    last_px = float(win_px[-1])
    tick = max(1e-8, stream.tick_size)

    bid_prints = win_px[win_bm]
    ask_prints = win_px[~win_bm]
    raw_bid = float(bid_prints[-1]) if bid_prints.size else last_px - 0.5 * tick
    raw_ask = float(ask_prints[-1]) if ask_prints.size else last_px + 0.5 * tick

    # Enforce uncrossed top-of-book anchored on the freshest print at `idx`.
    if bool(win_bm[-1]):
        best_bid = last_px
        best_ask = max(last_px + tick, raw_ask) if raw_ask <= last_px else min(raw_ask, last_px + 20.0 * tick)
    else:
        best_ask = last_px
        best_bid = min(last_px - tick, raw_bid) if raw_bid >= last_px else max(raw_bid, last_px - 20.0 * tick)

    mid = 0.5 * (best_bid + best_ask)
    return best_bid, best_ask, mid


def simulate_single_leg_fifo_slice(
    stream: TickStream,
    *,
    side: str,
    t0_ms: int,
    passive_horizon_ms: int,
    clip_usd: float,
    queue_ahead_usd: float,
    limit_price: float | None = None,
    entry_mid_price: float | None = None,
) -> dict[str, Any]:
    """Replay chronological `aggTrades` to fill a passive order at `limit_price` in strict FIFO order.

    * Passive `buy` rests at `best_bid(t0)`:
      - `price < limit_price` sweeps all queue ahead and fills 100% of remaining clip immediately.
      - `price == limit_price` with `is_buyer_maker == True` (seller aggressor) depletes
        `queue_ahead_usd` first, then fills our clip in strict FIFO order.
    * Passive `sell` rests at `best_ask(t0)`:
      - `price > limit_price` sweeps all queue ahead and fills 100% of remaining clip immediately.
      - `price == limit_price` with `is_buyer_maker == False` (buyer aggressor) depletes
        `queue_ahead_usd` first, then fills our clip in strict FIFO order.
    """
    if side not in ("buy", "sell"):
        raise ValueError(f"side must be 'buy' or 'sell', got {side!r}")
    if clip_usd <= 0.0:
        raise ValueError(f"clip_usd must be > 0, got {clip_usd}")

    if limit_price is None or entry_mid_price is None:
        q = causal_quote_at(stream, t0_ms)
        if q is None:
            return {
                "valid": False,
                "filled_usd": 0.0,
                "fill_fraction": 0.0,
                "completed": False,
                "first_fill_ts_ms": None,
                "complete_fill_ts_ms": None,
                "markouts_mid_adverse_bps": {},
                "markouts_vs_fill_px_bps": {},
            }
        bid_px, ask_px, mid_px = q
        lim_px = bid_px if side == "buy" else ask_px
    else:
        lim_px = float(limit_price)
        mid_px = float(entry_mid_price)

    start_i = int(np.searchsorted(stream.ts_ms, t0_ms, side="right"))
    end_i = int(np.searchsorted(stream.ts_ms, t0_ms + int(passive_horizon_ms), side="right"))

    rem_ahead = max(0.0, float(queue_ahead_usd))
    rem_clip = float(clip_usd)
    filled_usd = 0.0
    first_fill_ts: int | None = None
    complete_fill_ts: int | None = None
    weighted_ts_num = 0.0
    tol = max(1e-10, 0.25 * stream.tick_size)

    # Cumulative passive fill events `(ts_ms, cumulative_filled_usd)` for exact hedge-window lookup.
    fill_events: list[tuple[int, float]] = []

    is_buy = side == "buy"
    ts_arr = stream.ts_ms
    px_arr = stream.price
    usd_arr = stream.qty_usd
    bm_arr = stream.is_buyer_maker

    for idx in range(start_i, end_i):
        t = int(ts_arr[idx])
        px = float(px_arr[idx])
        q_usd = float(usd_arr[idx])
        bm = bool(bm_arr[idx])

        if is_buy:
            price_through = px < (lim_px - tol)
            at_touch = (abs(px - lim_px) <= tol) and bm
        else:
            price_through = px > (lim_px + tol)
            at_touch = (abs(px - lim_px) <= tol) and (not bm)

        if price_through:
            fill_now = rem_clip
            rem_ahead = 0.0
            rem_clip = 0.0
        elif at_touch:
            if rem_ahead > 0.0:
                deplete = min(rem_ahead, q_usd)
                rem_ahead -= deplete
                avail = q_usd - deplete
            else:
                avail = q_usd
            fill_now = min(rem_clip, avail) if (rem_ahead <= 1e-9 and avail > 0.0) else 0.0
            rem_clip -= fill_now
        else:
            continue

        if fill_now > 0.0:
            if first_fill_ts is None:
                first_fill_ts = t
            filled_usd += fill_now
            weighted_ts_num += fill_now * float(t)
            fill_events.append((t, filled_usd))
            if rem_clip <= 1e-6:
                rem_clip = 0.0
                filled_usd = float(clip_usd)
                complete_fill_ts = t
                break

    markouts_mid: dict[str, float] = {}
    markouts_fill_px: dict[str, float] = {}
    if filled_usd > 0.0:
        anchor_ts = int(round(weighted_ts_num / filled_usd))
        q_fill = causal_quote_at(stream, anchor_ts)
        ref_mid = q_fill[2] if q_fill is not None else mid_px
        for label, h_ms in MARKOUT_HORIZONS_MS:
            q_post = causal_quote_at(stream, anchor_ts + h_ms)
            if q_post is None:
                continue
            post_mid = q_post[2]
            if is_buy:
                # Adverse move after BUY = mid drops (`ref_mid - post_mid > 0`).
                adv_mid = (ref_mid - post_mid) / ref_mid * 1e4
                adv_px = (lim_px - post_mid) / lim_px * 1e4
            else:
                # Adverse move after SELL = mid rises (`post_mid - ref_mid > 0`).
                adv_mid = (post_mid - ref_mid) / ref_mid * 1e4
                adv_px = (post_mid - lim_px) / lim_px * 1e4
            markouts_mid[label] = round(float(adv_mid), 6)
            markouts_fill_px[label] = round(float(adv_px), 6)

    return {
        "valid": True,
        "side": side,
        "limit_price": lim_px,
        "entry_mid_price": mid_px,
        "queue_ahead_usd": round(float(queue_ahead_usd), 4),
        "clip_usd": round(float(clip_usd), 4),
        "filled_usd": round(float(filled_usd), 6),
        "fill_fraction": round(float(filled_usd / clip_usd), 6),
        "completed": complete_fill_ts is not None,
        "first_fill_ts_ms": first_fill_ts,
        "complete_fill_ts_ms": complete_fill_ts,
        "fill_events": fill_events,
        "markouts_mid_adverse_bps": markouts_mid,
        "markouts_vs_fill_px_bps": markouts_fill_px,
    }


def _filled_by_ts(fill_events: list[tuple[int, float]], cutoff_ts_ms: int) -> float:
    amt = 0.0
    for ts, cum_usd in fill_events:
        if ts <= cutoff_ts_ms:
            amt = cum_usd
        else:
            break
    return amt


def evaluate_two_leg_hedge_window(
    spot_slice: dict[str, Any],
    perp_slice: dict[str, Any],
    *,
    t0_ms: int,
    passive_horizon_ms: int,
    hedge_window_ms: int,
) -> dict[str, Any]:
    """Evaluate synchronised two-leg passive fills and emergency-taker single-leg miss fallback."""
    clip_usd = float(spot_slice["clip_usd"])
    s_done = spot_slice["complete_fill_ts_ms"]
    p_done = perp_slice["complete_fill_ts_ms"]
    s_filled = float(spot_slice["filled_usd"])
    p_filled = float(perp_slice["filled_usd"])

    if s_filled <= 0.0 and p_filled <= 0.0:
        return {
            "active_fill": False,
            "pair_passive_fill_fraction": 0.0,
            "leg_miss_triggered": False,
            "emergency_taker_usd": 0.0,
            "total_executed_two_leg_usd": 0.0,
            "per_leg_emergency_taker_share": 0.0,
        }

    horizon_end = t0_ms + int(passive_horizon_ms)
    # Determine if one leg completed first and forced a hedge deadline `t_first + hedge_window_ms`.
    if s_done is not None and (p_done is None or s_done <= p_done):
        deadline = int(s_done) + int(hedge_window_ms)
        target_pair_leg_usd = clip_usd
        s_pass = clip_usd
        p_pass = _filled_by_ts(perp_slice["fill_events"], deadline)
    elif p_done is not None and (s_done is None or p_done < s_done):
        deadline = int(p_done) + int(hedge_window_ms)
        target_pair_leg_usd = clip_usd
        p_pass = clip_usd
        s_pass = _filled_by_ts(spot_slice["fill_events"], deadline)
    else:
        # Neither completed 100%, but at least one partially filled by `horizon_end`.
        deadline = horizon_end
        target_pair_leg_usd = max(s_filled, p_filled)
        s_pass = s_filled
        p_pass = p_filled

    unhedged_gap_usd = abs(s_pass - p_pass)
    leg_miss = unhedged_gap_usd > 1e-6
    total_exec_two_leg_usd = 2.0 * target_pair_leg_usd
    per_leg_taker_share = (
        unhedged_gap_usd / total_exec_two_leg_usd if total_exec_two_leg_usd > 0.0 else 0.0
    )
    pair_passive_frac = min(s_pass, p_pass) / clip_usd if clip_usd > 0.0 else 0.0

    return {
        "active_fill": True,
        "pair_passive_fill_fraction": round(float(pair_passive_frac), 6),
        "either_leg_fill_fraction": round(float(0.5 * (s_pass + p_pass) / clip_usd), 6),
        "leg_miss_triggered": bool(leg_miss),
        "emergency_taker_usd": round(float(unhedged_gap_usd), 4),
        "total_executed_two_leg_usd": round(float(total_exec_two_leg_usd), 4),
        "per_leg_emergency_taker_share": round(float(per_leg_taker_share), 6),
    }


def measure_tick_bounce_half_spread(stream: TickStream) -> dict[str, float]:
    """Measure actual tick-level emergency-taker half-spread from `is_buyer_maker` aggressor prints.

    Computes two complementary microstructure estimators:
    1. `vwap_60s_half_spread_bps`: `0.5 * |vwap_buy_aggressor - vwap_sell_aggressor| / mid * 1e4`
       across 60-second micro-windows containing both buy and sell aggressors.
    2. `sign_flip_half_spread_bps`: `0.5 * |p_t - p_{t-1}| / mid * 1e4` across adjacent aggressor
       sign flips (`is_buyer_maker[t] != is_buyer_maker[t-1]`) occurring within `<= 5,000 ms`.
    """
    n = stream.ts_ms.size
    if n < 4:
        return {
            "vwap_60s_median_half_spread_bps": 0.0,
            "vwap_60s_p90_half_spread_bps": 0.0,
            "sign_flip_median_half_spread_bps": 0.0,
            "sign_flip_mean_half_spread_bps": 0.0,
            "sign_flip_p90_half_spread_bps": 0.0,
            "effective_half_spread_bps": 0.0,
            "n_60s_windows": 0,
            "n_sign_flips": 0,
        }

    # 1. Adjacent aggressor sign-flip bounce (`dt <= 5,000 ms`).
    dt = np.diff(stream.ts_ms)
    flip_mask = (stream.is_buyer_maker[1:] != stream.is_buyer_maker[:-1]) & (dt >= 0) & (dt <= 5_000)
    if np.any(flip_mask):
        p_prev = stream.price[:-1][flip_mask]
        p_curr = stream.price[1:][flip_mask]
        mids = 0.5 * (p_prev + p_curr)
        flips_bps = 0.5 * np.abs(p_curr - p_prev) / mids * 1e4
        sf_med = float(np.median(flips_bps))
        sf_mean = float(np.mean(flips_bps))
        sf_p90 = float(np.percentile(flips_bps, 90))
        n_flips = int(flips_bps.size)
    else:
        sf_med = sf_mean = sf_p90 = 0.0
        n_flips = 0

    # 2. 60-second micro-window buyer-aggressor vs seller-aggressor VWAP bounce.
    df = pl.DataFrame(
        {
            "bucket": stream.ts_ms // 60_000,
            "px": stream.price,
            "usd": stream.qty_usd,
            "is_bm": stream.is_buyer_maker,
        }
    ).with_columns((pl.col("usd") / pl.col("px")).alias("qty"))

    agg = (
        df.group_by(["bucket", "is_bm"])
        .agg(
            (pl.col("usd").sum() / pl.col("qty").sum()).alias("vwap")
        )
        .pivot(values="vwap", index="bucket", on="is_bm", aggregate_function="first")
    )
    if "true" in agg.columns and "false" in agg.columns:
        both = agg.drop_nulls(["true", "false"])
        if both.height > 0:
            v_sell = both["true"].to_numpy()
            v_buy = both["false"].to_numpy()
            mid_b = 0.5 * (v_buy + v_sell)
            w_bps = 0.5 * np.abs(v_buy - v_sell) / mid_b * 1e4
            vw_med = float(np.median(w_bps))
            vw_p90 = float(np.percentile(w_bps, 90))
            n_win = int(w_bps.size)
        else:
            vw_med = vw_p90 = 0.0
            n_win = 0
    else:
        vw_med = vw_p90 = 0.0
        n_win = 0

    eff = max(vw_med, sf_mean)
    return {
        "vwap_60s_median_half_spread_bps": round(vw_med, 4),
        "vwap_60s_p90_half_spread_bps": round(vw_p90, 4),
        "sign_flip_median_half_spread_bps": round(sf_med, 4),
        "sign_flip_mean_half_spread_bps": round(sf_mean, 4),
        "sign_flip_p90_half_spread_bps": round(sf_p90, 4),
        "effective_half_spread_bps": round(eff, 4),
        "n_60s_windows": n_win,
        "n_sign_flips": n_flips,
    }


def simulate_rebalance_day(
    spec: RebalanceSampleSpec,
    *,
    book_depth: BookDepthSnapshots,
    perp_stream: TickStream,
    spot_stream: TickStream,
    capital_usd: float = 1_000_000.0,
    n_twap_slices: int = 24,
    default_clip_usd: float = 25_000.0,
    passive_horizon_ms: int = 300_000,
    hedge_window_ms: int = 30_000,
) -> dict[str, Any]:
    """Replay 24 hourly intraday two-leg TWAP slices on a single `H3_MAKER` rebalance date."""
    dt_utc = datetime.strptime(spec.date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    day_start_ms = int(dt_utc.timestamp() * 1000)

    spot_side = "buy" if spec.direction == "entry" else "sell"
    perp_side = "sell" if spec.direction == "entry" else "buy"

    leg_target_usd = 0.5 * abs(spec.pair_weight_delta) * float(capital_usd)
    clip_usd = min(50_000.0, max(float(default_clip_usd), leg_target_usd / max(1, n_twap_slices)))

    # Prefix sums of USD volume for strictly causal `spot / perp` liquidity scaling at each `t0`.
    perp_cum_usd = np.concatenate([[0.0], np.cumsum(perp_stream.qty_usd)])
    spot_cum_usd = np.concatenate([[0.0], np.cumsum(spot_stream.qty_usd)])

    slice_rows: list[dict[str, Any]] = []
    horizon_900s_fills: list[float] = []
    hedge_sens: dict[str, list[float]] = {"5s": [], "10s": [], "30s": [], "60s": []}

    # Hourly TWAP child clips at `00:15, 01:15, ..., 23:15 UTC` (leaving >=45m for post-fill markouts).
    for k in range(n_twap_slices):
        t0_ms = day_start_ms + k * 3_600_000 + 900_000
        d_idx = int(np.searchsorted(book_depth.ts_ms, t0_ms, side="right")) - 1
        if d_idx < 0:
            continue
        q_perp = causal_quote_at(perp_stream, t0_ms)
        q_spot = causal_quote_at(spot_stream, t0_ms)
        if q_perp is None or q_spot is None:
            continue

        # Strictly causal spot-to-perp cumulative volume ratio up to `t0_ms`.
        p_vi = int(np.searchsorted(perp_stream.ts_ms, t0_ms, side="right"))
        s_vi = int(np.searchsorted(spot_stream.ts_ms, t0_ms, side="right"))
        vol_ratio = (
            float(spot_cum_usd[s_vi] / perp_cum_usd[p_vi])
            if p_vi > 0 and perp_cum_usd[p_vi] > 0.0 and s_vi > 0
            else 0.5
        )
        vol_ratio = min(2.0, max(0.10, vol_ratio))

        perp_bucket_not = (
            float(book_depth.bid_notional_usd[d_idx])
            if perp_side == "buy"
            else float(book_depth.ask_notional_usd[d_idx])
        )
        perp_bucket_pct = (
            float(book_depth.bid_bucket_pct[d_idx])
            if perp_side == "buy"
            else float(book_depth.ask_bucket_pct[d_idx])
        )
        spot_bucket_not = (
            float(book_depth.bid_notional_usd[d_idx])
            if spot_side == "buy"
            else float(book_depth.ask_notional_usd[d_idx])
        )
        spot_bucket_pct = (
            float(book_depth.bid_bucket_pct[d_idx])
            if spot_side == "buy"
            else float(book_depth.ask_bucket_pct[d_idx])
        )

        perp_q_ahead = estimate_l1_queue_ahead_usd(
            perp_bucket_not,
            perp_bucket_pct,
            tick_size=perp_stream.tick_size,
            mid_price=q_perp[2],
            volume_scale=1.0,
        )
        spot_q_ahead = estimate_l1_queue_ahead_usd(
            spot_bucket_not,
            spot_bucket_pct,
            tick_size=spot_stream.tick_size,
            mid_price=q_spot[2],
            volume_scale=vol_ratio,
        )

        spot_res = simulate_single_leg_fifo_slice(
            spot_stream,
            side=spot_side,
            t0_ms=t0_ms,
            passive_horizon_ms=passive_horizon_ms,
            clip_usd=clip_usd,
            queue_ahead_usd=spot_q_ahead,
            limit_price=q_spot[0] if spot_side == "buy" else q_spot[1],
            entry_mid_price=q_spot[2],
        )
        perp_res = simulate_single_leg_fifo_slice(
            perp_stream,
            side=perp_side,
            t0_ms=t0_ms,
            passive_horizon_ms=passive_horizon_ms,
            clip_usd=clip_usd,
            queue_ahead_usd=perp_q_ahead,
            limit_price=q_perp[0] if perp_side == "buy" else q_perp[1],
            entry_mid_price=q_perp[2],
        )
        if not (spot_res["valid"] and perp_res["valid"]):
            continue

        # Also evaluate 900s passive horizon sensitivity.
        spot_900 = simulate_single_leg_fifo_slice(
            spot_stream,
            side=spot_side,
            t0_ms=t0_ms,
            passive_horizon_ms=900_000,
            clip_usd=clip_usd,
            queue_ahead_usd=spot_q_ahead,
            limit_price=q_spot[0] if spot_side == "buy" else q_spot[1],
            entry_mid_price=q_spot[2],
        )
        perp_900 = simulate_single_leg_fifo_slice(
            perp_stream,
            side=perp_side,
            t0_ms=t0_ms,
            passive_horizon_ms=900_000,
            clip_usd=clip_usd,
            queue_ahead_usd=perp_q_ahead,
            limit_price=q_perp[0] if perp_side == "buy" else q_perp[1],
            entry_mid_price=q_perp[2],
        )
        horizon_900s_fills.append(0.5 * (spot_900["fill_fraction"] + perp_900["fill_fraction"]))

        hedge_30s = evaluate_two_leg_hedge_window(
            spot_res,
            perp_res,
            t0_ms=t0_ms,
            passive_horizon_ms=passive_horizon_ms,
            hedge_window_ms=hedge_window_ms,
        )
        for h_lbl, h_w_ms in (("5s", 5_000), ("10s", 10_000), ("30s", 30_000), ("60s", 60_000)):
            hw = evaluate_two_leg_hedge_window(
                spot_res,
                perp_res,
                t0_ms=t0_ms,
                passive_horizon_ms=passive_horizon_ms,
                hedge_window_ms=h_w_ms,
            )
            if hw["active_fill"]:
                hedge_sens[h_lbl].append(hw["per_leg_emergency_taker_share"])

        slice_rows.append(
            {
                "t0_ms": t0_ms,
                "clip_usd": clip_usd,
                "spot_queue_ahead_usd": spot_res["queue_ahead_usd"],
                "perp_queue_ahead_usd": perp_res["queue_ahead_usd"],
                "spot_fill_fraction": spot_res["fill_fraction"],
                "perp_fill_fraction": perp_res["fill_fraction"],
                "spot_markouts_mid_bps": spot_res["markouts_mid_adverse_bps"],
                "perp_markouts_mid_bps": perp_res["markouts_mid_adverse_bps"],
                "spot_markouts_vs_fill_px_bps": spot_res["markouts_vs_fill_px_bps"],
                "perp_markouts_vs_fill_px_bps": perp_res["markouts_vs_fill_px_bps"],
                "hedge": hedge_30s,
            }
        )

    perp_spread = measure_tick_bounce_half_spread(perp_stream)
    spot_spread = measure_tick_bounce_half_spread(spot_stream)

    n_slices = len(slice_rows)
    spot_fills = [r["spot_fill_fraction"] for r in slice_rows]
    perp_fills = [r["perp_fill_fraction"] for r in slice_rows]
    leg_avg_fills = [0.5 * (s + p) for s, p in zip(spot_fills, perp_fills)]
    active_hedges = [r["hedge"] for r in slice_rows if r["hedge"]["active_fill"]]

    markout_summary_mid: dict[str, float] = {}
    markout_summary_px: dict[str, float] = {}
    for h_lbl, _ in MARKOUT_HORIZONS_MS:
        vals_mid = [
            v
            for r in slice_rows
            for v in (
                r["spot_markouts_mid_bps"].get(h_lbl),
                r["perp_markouts_mid_bps"].get(h_lbl),
            )
            if v is not None
        ]
        vals_px = [
            v
            for r in slice_rows
            for v in (
                r["spot_markouts_vs_fill_px_bps"].get(h_lbl),
                r["perp_markouts_vs_fill_px_bps"].get(h_lbl),
            )
            if v is not None
        ]
        markout_summary_mid[h_lbl] = round(float(np.mean(vals_mid)), 4) if vals_mid else 0.0
        markout_summary_px[h_lbl] = round(float(np.mean(vals_px)), 4) if vals_px else 0.0

    emp_p_fill_300s = float(np.mean(leg_avg_fills)) if leg_avg_fills else 0.0
    emp_p_fill_900s = float(np.mean(horizon_900s_fills)) if horizon_900s_fills else 0.0
    emp_leg_miss_per_leg = (
        float(np.mean([h["per_leg_emergency_taker_share"] for h in active_hedges]))
        if active_hedges
        else 0.0
    )
    emp_pair_miss_event_rate = (
        float(np.mean([1.0 if h["leg_miss_triggered"] else 0.0 for h in active_hedges]))
        if active_hedges
        else 0.0
    )
    pair_half_spread_bps = 0.5 * (
        spot_spread["effective_half_spread_bps"] + perp_spread["effective_half_spread_bps"]
    )
    pair_p90_half_spread_bps = 0.5 * (
        max(spot_spread["vwap_60s_p90_half_spread_bps"], spot_spread["sign_flip_p90_half_spread_bps"])
        + max(perp_spread["vwap_60s_p90_half_spread_bps"], perp_spread["sign_flip_p90_half_spread_bps"])
    )

    return {
        "split": spec.split,
        "symbol": spec.symbol,
        "date": spec.date,
        "direction": spec.direction,
        "pair_weight_delta": round(spec.pair_weight_delta, 6),
        "leg_target_notional_usd": round(leg_target_usd, 2),
        "slice_clip_usd": round(clip_usd, 2),
        "n_slices": n_slices,
        "n_active_slices": len(active_hedges),
        "perp_trades_count": int(perp_stream.ts_ms.size),
        "spot_trades_count": int(spot_stream.ts_ms.size),
        "book_depth_snapshots_count": int(book_depth.ts_ms.size),
        "perp_tick_size": perp_stream.tick_size,
        "spot_tick_size": spot_stream.tick_size,
        "median_spot_queue_ahead_usd": round(
            float(np.median([r["spot_queue_ahead_usd"] for r in slice_rows])), 2
        )
        if slice_rows
        else 0.0,
        "median_perp_queue_ahead_usd": round(
            float(np.median([r["perp_queue_ahead_usd"] for r in slice_rows])), 2
        )
        if slice_rows
        else 0.0,
        "empirical_p_fill_300s": round(emp_p_fill_300s, 4),
        "empirical_p_fill_900s": round(emp_p_fill_900s, 4),
        "spot_p_fill_300s": round(float(np.mean(spot_fills)), 4) if spot_fills else 0.0,
        "perp_p_fill_300s": round(float(np.mean(perp_fills)), 4) if perp_fills else 0.0,
        "empirical_adverse_selection_mid_markout_bps": markout_summary_mid,
        "empirical_adverse_selection_vs_fill_px_bps": markout_summary_px,
        "empirical_p_leg_miss_30s": round(emp_leg_miss_per_leg, 4),
        "pair_leg_miss_event_rate_30s": round(emp_pair_miss_event_rate, 4),
        "hedge_window_per_leg_miss_sensitivity": {
            k: round(float(np.mean(v)), 4) if v else 0.0 for k, v in hedge_sens.items()
        },
        "perp_tick_half_spread": perp_spread,
        "spot_tick_half_spread": spot_spread,
        "empirical_emergency_taker_half_spread_bps": round(pair_half_spread_bps, 4),
        "empirical_emergency_taker_p90_half_spread_bps": round(pair_p90_half_spread_bps, 4),
    }


def summarise_calibration_split(day_results: list[dict[str, Any]], *, split_name: str) -> dict[str, Any]:
    """Aggregate day-level FIFO calibration metrics into conservative floor/median/ceiling bounds."""
    if not day_results:
        raise ValueError(f"No day_results supplied for {split_name!r}")

    p_fills_300 = [d["empirical_p_fill_300s"] for d in day_results]
    p_fills_900 = [d["empirical_p_fill_900s"] for d in day_results]
    leg_misses = [d["empirical_p_leg_miss_30s"] for d in day_results]
    pair_miss_events = [d["pair_leg_miss_event_rate_30s"] for d in day_results]
    half_spreads = [d["empirical_emergency_taker_half_spread_bps"] for d in day_results]
    p90_half_spreads = [d["empirical_emergency_taker_p90_half_spread_bps"] for d in day_results]

    markout_curve_mid: dict[str, float] = {}
    markout_curve_px: dict[str, float] = {}
    for h_lbl, _ in MARKOUT_HORIZONS_MS:
        markout_curve_mid[h_lbl] = round(
            float(np.mean([d["empirical_adverse_selection_mid_markout_bps"][h_lbl] for d in day_results])),
            4,
        )
        markout_curve_px[h_lbl] = round(
            float(np.mean([d["empirical_adverse_selection_vs_fill_px_bps"][h_lbl] for d in day_results])),
            4,
        )

    # Conservative non-negative adverse selection per leg across all markout horizons (1s..60s).
    adv_per_day_worst = [
        max(0.0, *(d["empirical_adverse_selection_mid_markout_bps"].values()))
        for d in day_results
    ]
    adv_median = max(0.0, max(markout_curve_mid.values()))
    adv_ceiling = max(adv_per_day_worst) if adv_per_day_worst else adv_median

    return {
        "split": split_name,
        "n_rebalance_days": len(day_results),
        "symbols": sorted({d["symbol"] for d in day_results}),
        "dates": [f"{d['symbol']}:{d['date']}" for d in day_results],
        "empirical_p_fill": round(float(np.mean(p_fills_300)), 4),
        "empirical_p_fill_900s": round(float(np.mean(p_fills_900)), 4),
        "empirical_p_fill_min_day": round(float(np.min(p_fills_300)), 4),
        "empirical_adverse_selection_bps": round(float(adv_median), 4),
        "empirical_adverse_selection_ceiling_bps": round(float(adv_ceiling), 4),
        "markout_curve_mid_adverse_bps": markout_curve_mid,
        "markout_curve_vs_fill_px_bps": markout_curve_px,
        "empirical_p_leg_miss": round(float(np.mean(leg_misses)), 4),
        "empirical_p_leg_miss_ceiling": round(float(np.max(leg_misses)), 4),
        "pair_single_leg_miss_event_rate": round(float(np.mean(pair_miss_events)), 4),
        "empirical_emergency_taker_half_spread_bps": round(float(np.median(half_spreads)), 4),
        "empirical_emergency_taker_mean_half_spread_bps": round(float(np.mean(half_spreads)), 4),
        "empirical_emergency_taker_ceiling_half_spread_bps": round(float(np.max(p90_half_spreads)), 4),
    }
