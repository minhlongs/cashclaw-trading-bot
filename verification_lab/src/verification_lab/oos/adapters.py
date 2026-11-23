"""Read-only public market-data adapters for Binance and Hyperliquid.

Security and safety invariants:
- Public read-only endpoints ONLY; strict host/path allowlist enforced before any request.
- Zero exchange credentials, zero API key headers, zero order/account routes.
- No CCXT or order-capable clients.
- Bounded retries with backoff on transient network/429 errors.
- Unavailable fields remain explicitly None (never invented defaults).
- Raw HTTP response bytes and SHA-256 hashes are preserved for offline audit.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from email.utils import parsedate_to_datetime
from typing import Any, Callable, Mapping, Sequence
from urllib.parse import urlsplit

import requests

from verification_lab.oos.causal_timing import (
    CausalTimestamps,
    DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS,
    DEFAULT_MAX_QUOTE_STALENESS_SECONDS,
    format_utc_iso,
    ms_to_utc,
    validate_causal_funding_events,
    validate_daily_candle_finalization,
    validate_quote_freshness,
)

# Strict public read-only allowlist. No order, account, or private endpoint may be added.
ALLOWED_PUBLIC_GET_ENDPOINTS: frozenset[tuple[str, str]] = frozenset(
    {
        ("api.binance.com", "/api/v3/klines"),
        ("api.binance.com", "/api/v3/ticker/bookTicker"),
        ("fapi.binance.com", "/fapi/v1/klines"),
        ("fapi.binance.com", "/fapi/v1/ticker/bookTicker"),
        ("fapi.binance.com", "/fapi/v1/fundingRate"),
    }
)

ALLOWED_PUBLIC_POST_ENDPOINTS: frozenset[tuple[str, str]] = frozenset(
    {
        ("api.hyperliquid.xyz", "/info"),
    }
)

ALLOWED_HYPERLIQUID_INFO_TYPES: frozenset[str] = frozenset(
    {
        "metaAndAssetCtxs",
        "l2Book",
        "fundingHistory",
        "allBorrowLendReserveStates",
        "spotMeta",
    }
)

FORBIDDEN_HEADER_KEYS: frozenset[str] = frozenset(
    {
        "authorization",
        "x-mbx-apikey",
        "x-api-key",
        "api-key",
        "x-signature",
        "x-hl-signature",
        "cookie",
    }
)

DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024  # 5 MiB response cap

SOURCE_AUTHENTICITY_UNVERIFIED_HTTP = "SOURCE_CAPTURED_LOCAL_UNAUTHENTICATED"

BINANCE_FUNDING_EVENTS_PER_YEAR = Decimal("1095")  # 3 * 365 (8h settlement)
HYPERLIQUID_FUNDING_EVENTS_PER_YEAR = Decimal("8760")  # 24 * 365 (1h settlement)


class AdapterError(RuntimeError):
    """Base fail-closed error for read-only market-data adapters."""


class UnauthorizedEndpointError(AdapterError):
    """Raised when an adapter attempts to access a non-allowlisted or credentialed route."""


class RateLimitExhaustedError(AdapterError):
    """Raised when bounded retries are exhausted on HTTP 429."""


class DataQualityError(AdapterError):
    """Raised when venue payload fails schema, pair-consistency, or causal checks."""


@dataclass(frozen=True)
class HttpResponseData:
    status_code: int
    raw_bytes: bytes
    headers: Mapping[str, str]


@dataclass(frozen=True)
class RawCaptureEnvelope:
    raw_source_id: str
    venue: str
    endpoint_url: str
    method: str
    request_params: dict[str, Any]
    http_status: int
    raw_bytes: bytes
    raw_sha256: str
    captured_at_utc: str
    source_authenticity_status: str = SOURCE_AUTHENTICITY_UNVERIFIED_HTTP
    requested_at_utc: str | None = None
    http_date_utc: str | None = None

    def metadata_dict(self) -> dict[str, Any]:
        meta: dict[str, Any] = {
            "raw_source_id": self.raw_source_id,
            "venue": self.venue,
            "endpoint_url": self.endpoint_url,
            "method": self.method,
            "request_params": self.request_params,
            "http_status": self.http_status,
            "raw_bytes_len": len(self.raw_bytes),
            "raw_sha256": self.raw_sha256,
            "captured_at_utc": self.captured_at_utc,
            "source_authenticity_status": self.source_authenticity_status,
        }
        if self.requested_at_utc is not None:
            meta["requested_at_utc"] = self.requested_at_utc
        if self.http_date_utc is not None:
            meta["http_date_utc"] = self.http_date_utc
        return meta


@dataclass(frozen=True)
class NormalizedMarketObservation:
    venue: str
    instrument: str
    spot_symbol: str | None
    perp_symbol: str
    observation_day_utc: str
    spot_price: str | None
    perp_price: str
    basis_bps: str | None
    funding_rate_interval: str
    funding_interval_hours: int
    annualized_funding_bps: str
    borrow_apr_bps: str | None
    bid_price: str | None
    ask_price: str | None
    spread_bps: str | None
    l1_bid_qty: str | None
    l1_ask_qty: str | None
    public_liquidity_metadata: dict[str, Any]
    instrument_availability_status: str
    causal_timestamps: dict[str, Any]
    data_completeness: float
    source_request_ids: list[str]
    source_response_hashes: dict[str, str]
    source_authenticity_status: str
    warnings: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _to_decimal(val: Any, field: str) -> Decimal:
    if isinstance(val, bool) or val is None:
        raise DataQualityError(f"missing_or_invalid_decimal ({field}={val!r})")
    try:
        dec = Decimal(str(val))
    except (InvalidOperation, ValueError) as exc:
        raise DataQualityError(f"malformed_decimal ({field}={val!r})") from exc
    if not dec.is_finite():
        raise DataQualityError(f"non_finite_decimal ({field}={val!r})")
    return dec


def _compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _parse_http_date_header(headers: Mapping[str, str]) -> str | None:
    """Safely parse HTTP Date header to UTC ISO-8601 Z without inventing timestamps."""
    for key, val in headers.items():
        if key.lower() == "date" and isinstance(val, str) and val.strip():
            try:
                dt = parsedate_to_datetime(val.strip())
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return format_utc_iso(dt.astimezone(timezone.utc))
            except (TypeError, ValueError):
                return None
    return None


def _default_transport(
    method: str,
    url: str,
    params: Mapping[str, Any] | None,
    json_body: Mapping[str, Any] | None,
    headers: Mapping[str, str],
    timeout_s: float,
    *,
    max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
) -> HttpResponseData:
    with requests.Session() as session:
        session.trust_env = False
        with session.request(
            method=method,
            url=url,
            params=params,
            json=json_body,
            headers=dict(headers),
            timeout=timeout_s,
            allow_redirects=False,
            stream=True,
        ) as resp:
            content_length = resp.headers.get("Content-Length") or resp.headers.get("content-length")
            if content_length is not None:
                try:
                    declared_len = int(content_length)
                except ValueError:
                    declared_len = -1
                if declared_len > max_response_bytes:
                    raise DataQualityError(
                        f"oversized_response_body (content_length={declared_len} > max={max_response_bytes})"
                    )
            chunks: list[bytes] = []
            total = 0
            for chunk in resp.iter_content(chunk_size=65536):
                if not chunk:
                    continue
                total += len(chunk)
                if total > max_response_bytes:
                    raise DataQualityError(
                        f"oversized_response_body (len>{max_response_bytes})"
                    )
                chunks.append(chunk)
            return HttpResponseData(
                status_code=resp.status_code,
                raw_bytes=b"".join(chunks),
                headers=dict(resp.headers),
            )


class PublicReadOnlyHttpClient:
    """Bounded-retry HTTP client restricted strictly to allowlisted public read-only endpoints."""

    def __init__(
        self,
        *,
        transport: Callable[..., HttpResponseData] = _default_transport,
        clock_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        sleep_fn: Callable[[float], None] = time.sleep,
        timeout_s: float = 10.0,
        max_retries: int = 3,
        base_backoff_s: float = 0.5,
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    ) -> None:
        if not math.isfinite(timeout_s) or timeout_s <= 0:
            raise ValueError("timeout_s must be finite and positive")
        if not math.isfinite(base_backoff_s) or base_backoff_s < 0:
            raise ValueError("base_backoff_s must be finite and non-negative")
        if max_retries < 0 or max_retries > 5:
            raise ValueError("max_retries must be bounded between 0 and 5")
        if max_response_bytes <= 0:
            raise ValueError("max_response_bytes must be positive")
        if transport is _default_transport:
            self._transport = lambda m, u, p, jb, h, t: _default_transport(
                m, u, p, jb, h, t, max_response_bytes=max_response_bytes
            )
        else:
            self._transport = transport
        self._clock_fn = clock_fn
        self._sleep_fn = sleep_fn
        self._timeout_s = timeout_s
        self._max_retries = max_retries
        self._base_backoff_s = base_backoff_s
        self._max_response_bytes = max_response_bytes

    @staticmethod
    def _assert_allowed_request(
        *,
        method: str,
        url: str,
        json_body: Mapping[str, Any] | None,
        headers: Mapping[str, str],
    ) -> None:
        parsed = urlsplit(url)
        safe_url = f"{parsed.scheme}://{parsed.hostname or ''}{parsed.path}"
        if parsed.scheme != "https":
            raise UnauthorizedEndpointError(f"non_https_endpoint_forbidden ({safe_url})")
        if parsed.query or parsed.fragment or parsed.username is not None or parsed.password is not None:
            raise UnauthorizedEndpointError(f"url_components_not_allowed ({safe_url})")
        lower_path = parsed.path.lower()
        if ";" in parsed.path or ".." in parsed.path or "%2f" in lower_path or "%5c" in lower_path or "\\" in parsed.path:
            raise UnauthorizedEndpointError(f"url_path_normalization_forbidden ({safe_url})")

        for key in headers:
            if key.lower() in FORBIDDEN_HEADER_KEYS:
                raise UnauthorizedEndpointError(f"credential_header_forbidden ({key})")

        method_upper = method.upper()
        key_pair = (parsed.netloc.lower(), parsed.path)
        if method_upper == "GET":
            if key_pair not in ALLOWED_PUBLIC_GET_ENDPOINTS:
                raise UnauthorizedEndpointError(f"endpoint_not_in_public_read_only_allowlist ({method_upper} {safe_url})")
        elif method_upper == "POST":
            if key_pair not in ALLOWED_PUBLIC_POST_ENDPOINTS:
                raise UnauthorizedEndpointError(f"endpoint_not_in_public_read_only_allowlist ({method_upper} {safe_url})")
            info_type = (json_body or {}).get("type")
            if not isinstance(info_type, str) or info_type not in ALLOWED_HYPERLIQUID_INFO_TYPES:
                raise UnauthorizedEndpointError(
                    f"hyperliquid_post_type_not_read_only_allowlisted ({info_type!r})"
                )
        else:
            raise UnauthorizedEndpointError(f"http_method_not_allowed ({method_upper})")

    def fetch(
        self,
        *,
        venue: str,
        method: str,
        url: str,
        params: Mapping[str, Any] | None = None,
        json_body: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> RawCaptureEnvelope:
        req_headers = {"User-Agent": "cashclaw-passive-oos-reader/1.0"}
        if headers:
            req_headers.update(headers)
        self._assert_allowed_request(method=method, url=url, json_body=json_body, headers=req_headers)
        parsed = urlsplit(url)
        safe_url = f"{parsed.scheme}://{parsed.hostname or ''}{parsed.path}"

        last_exc: Exception | None = None
        for attempt in range(self._max_retries + 1):
            requested_dt = self._clock_fn().astimezone(timezone.utc)
            try:
                resp = self._transport(
                    method.upper(),
                    url,
                    dict(params) if params else None,
                    dict(json_body) if json_body else None,
                    req_headers,
                    self._timeout_s,
                )
            except (TimeoutError, requests.Timeout, requests.ConnectionError) as exc:
                last_exc = exc
                if attempt >= self._max_retries:
                    raise AdapterError(f"http_timeout_or_network_error ({safe_url}): {exc}") from exc
                self._sleep_fn(self._base_backoff_s * (2**attempt))
                continue
            except requests.RequestException as exc:
                raise AdapterError(f"http_transport_error ({safe_url}): {exc}") from exc

            if 300 <= resp.status_code < 400:
                raise UnauthorizedEndpointError(
                    f"http_redirect_rejected (status={resp.status_code} url={safe_url})"
                )

            if resp.status_code == 429:
                if attempt >= self._max_retries:
                    raise RateLimitExhaustedError(f"http_429_rate_limit_exhausted ({safe_url})")
                headers_lower = {k.lower(): v for k, v in resp.headers.items()}
                retry_after = headers_lower.get("retry-after")
                fallback_delay = self._base_backoff_s * (2**attempt)
                delay = fallback_delay
                if retry_after is not None:
                    try:
                        parsed_delay = float(retry_after)
                        if math.isfinite(parsed_delay):
                            delay = min(max(parsed_delay, 0.0), 30.0)
                    except ValueError:
                        delay = fallback_delay
                self._sleep_fn(max(delay, 0.0))
                continue

            if resp.status_code >= 500:
                if attempt >= self._max_retries:
                    raise AdapterError(f"exchange_http_5xx ({resp.status_code} {safe_url})")
                self._sleep_fn(self._base_backoff_s * (2**attempt))
                continue

            if resp.status_code != 200:
                raise AdapterError(f"exchange_http_error (status={resp.status_code} url={safe_url})")

            if not resp.raw_bytes:
                raise DataQualityError(f"empty_response_body ({safe_url})")

            if len(resp.raw_bytes) > self._max_response_bytes:
                raise DataQualityError(
                    f"oversized_response_body (len={len(resp.raw_bytes)} > max={self._max_response_bytes})"
                )

            captured_dt = self._clock_fn().astimezone(timezone.utc)
            raw_hash = _compute_sha256(resp.raw_bytes)
            req_id = f"{venue}:{parsed.path}:{raw_hash[:16]}"
            return RawCaptureEnvelope(
                raw_source_id=req_id,
                venue=venue,
                endpoint_url=url,
                method=method.upper(),
                request_params=dict(params or json_body or {}),
                http_status=resp.status_code,
                raw_bytes=resp.raw_bytes,
                raw_sha256=raw_hash,
                captured_at_utc=format_utc_iso(captured_dt),
                source_authenticity_status=SOURCE_AUTHENTICITY_UNVERIFIED_HTTP,
                requested_at_utc=format_utc_iso(requested_dt),
                http_date_utc=_parse_http_date_header(resp.headers),
            )

        raise AdapterError(f"request_failed ({safe_url}): {last_exc}")


def _parse_json_bytes(envelope: RawCaptureEnvelope) -> Any:
    try:
        payload = json.loads(envelope.raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DataQualityError(f"malformed_json_response ({envelope.raw_source_id}): {exc}") from exc
    if payload is None or payload == [] or payload == {}:
        raise DataQualityError(f"empty_json_payload ({envelope.raw_source_id})")
    if isinstance(payload, dict) and "code" in payload and "msg" in payload:
        raise DataQualityError(
            f"exchange_api_error ({envelope.raw_source_id}: code={payload['code']} msg={payload['msg']})"
        )
    return payload


class BinanceReadOnlyAdapter:
    """Public read-only Binance spot + USD-M perpetual + funding adapter."""

    SPOT_KLINES_URL = "https://api.binance.com/api/v3/klines"
    SPOT_BOOK_URL = "https://api.binance.com/api/v3/ticker/bookTicker"
    PERP_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines"
    PERP_BOOK_URL = "https://fapi.binance.com/fapi/v1/ticker/bookTicker"
    PERP_FUNDING_URL = "https://fapi.binance.com/fapi/v1/fundingRate"

    def __init__(
        self,
        client: PublicReadOnlyHttpClient,
        *,
        clock_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._client = client
        self._clock_fn = clock_fn

    def capture_daily_observation(
        self,
        *,
        instrument: str,
        spot_symbol: str,
        perp_symbol: str,
        borrow_apr_bps: Decimal | None = None,
    ) -> tuple[NormalizedMarketObservation, list[RawCaptureEnvelope]]:
        """Capture finalized daily spot/perp candles, funding history, and top-of-book L1."""
        if not spot_symbol or not perp_symbol:
            raise DataQualityError("missing_spot_or_perp_symbol")
        base_upper = instrument.upper()
        allowed_symbols = {f"{base_upper}{q}" for q in ("USDT", "USDC", "FDUSD")}
        if spot_symbol not in allowed_symbols or perp_symbol not in allowed_symbols:
            raise DataQualityError(
                f"inconsistent_spot_perp_pair (instrument={instrument}, spot={spot_symbol}, perp={perp_symbol})"
            )

        spot_kline_env = self._client.fetch(
            venue="binance",
            method="GET",
            url=self.SPOT_KLINES_URL,
            params={"symbol": spot_symbol, "interval": "1d", "limit": 2},
        )
        perp_kline_env = self._client.fetch(
            venue="binance",
            method="GET",
            url=self.PERP_KLINES_URL,
            params={"symbol": perp_symbol, "interval": "1d", "limit": 2},
        )
        funding_env = self._client.fetch(
            venue="binance",
            method="GET",
            url=self.PERP_FUNDING_URL,
            params={"symbol": perp_symbol, "limit": 6},
        )
        perp_book_env = self._client.fetch(
            venue="binance",
            method="GET",
            url=self.PERP_BOOK_URL,
            params={"symbol": perp_symbol},
        )
        envelopes = [spot_kline_env, perp_kline_env, funding_env, perp_book_env]

        capture_dt = self._clock_fn().astimezone(timezone.utc)
        spot_klines = _parse_json_bytes(spot_kline_env)
        perp_klines = _parse_json_bytes(perp_kline_env)
        funding_rows = _parse_json_bytes(funding_env)
        perp_book = _parse_json_bytes(perp_book_env)

        if not isinstance(spot_klines, list) or not isinstance(perp_klines, list):
            raise DataQualityError("malformed_binance_klines_container")

        # Select the latest strictly finalized daily candle (never an unfinished candle).
        spot_candle = self._select_finalized_candle(spot_klines, capture_dt, "spot")
        perp_candle = self._select_finalized_candle(perp_klines, capture_dt, "perp")

        if int(spot_candle[0]) != int(perp_candle[0]) or int(spot_candle[6]) != int(perp_candle[6]):
            raise DataQualityError(
                f"inconsistent_spot_perp_candle_window (spot_open={spot_candle[0]}, perp_open={perp_candle[0]})"
            )

        ok_candle, candle_reasons, obs_day, avail_dt = validate_daily_candle_finalization(
            open_time_ms=int(spot_candle[0]),
            close_time_ms=int(spot_candle[6]),
            local_capture_time_utc=capture_dt,
        )
        if not ok_candle or obs_day is None or avail_dt is None:
            raise DataQualityError(f"candle_finalization_failed: {'; '.join(candle_reasons)}")

        spot_close = _to_decimal(spot_candle[4], "spot_close")
        perp_close = _to_decimal(perp_candle[4], "perp_close")
        if spot_close <= 0 or perp_close <= 0:
            raise DataQualityError("non_positive_spot_or_perp_price")

        basis_bps = ((perp_close - spot_close) / spot_close) * Decimal("10000")

        # Validate funding rows fail-closed: only include funding settled at or before
        # the finalized daily candle availability cutoff (avail_dt) to prevent future funding leakage.
        if not isinstance(funding_rows, list) or not funding_rows:
            raise DataQualityError("empty_binance_funding_rows")
        all_funding_times: list[int] = []
        causal_funding_times: list[int] = []
        causal_funding_rates: list[Decimal] = []
        avail_ms = int(avail_dt.timestamp() * 1000)
        for row in funding_rows:
            if not isinstance(row, dict):
                raise DataQualityError("malformed_binance_funding_row")
            if row.get("symbol") != perp_symbol:
                raise DataQualityError(
                    f"symbol_mapping_mismatch (expected={perp_symbol}, got={row.get('symbol')!r})"
                )
            if "fundingTime" not in row or "fundingRate" not in row:
                raise DataQualityError("missing_funding_fields")
            ft_ms = int(row["fundingTime"])
            fr_dec = _to_decimal(row["fundingRate"], "fundingRate")
            all_funding_times.append(ft_ms)
            if ft_ms <= avail_ms:
                causal_funding_times.append(ft_ms)
                causal_funding_rates.append(fr_dec)

        # Verify no returned funding event is in the future relative to capture_dt
        ok_all_funding, all_funding_reasons = validate_causal_funding_events(
            venue="binance",
            funding_times_ms=all_funding_times,
            evaluation_time_utc=capture_dt,
            expected_interval_hours=8,
        )
        if not ok_all_funding:
            raise DataQualityError(f"causal_funding_validation_failed: {'; '.join(all_funding_reasons)}")

        if not causal_funding_times:
            raise DataQualityError(
                f"no_causal_funding_settled_by_candle_close (avail={format_utc_iso(avail_dt)})"
            )

        ok_causal_funding, causal_funding_reasons = validate_causal_funding_events(
            venue="binance",
            funding_times_ms=causal_funding_times,
            evaluation_time_utc=avail_dt,
            expected_interval_hours=8,
        )
        if not ok_causal_funding:
            raise DataQualityError(f"causal_funding_cutoff_failed: {'; '.join(causal_funding_reasons)}")

        latest_funding = causal_funding_rates[-1]
        annualized_funding_bps = latest_funding * BINANCE_FUNDING_EVENTS_PER_YEAR * Decimal("10000")

        # Parse L1 bookTicker
        if not isinstance(perp_book, dict) or perp_book.get("symbol") != perp_symbol:
            raise DataQualityError("malformed_or_mismatched_perp_book_ticker")
        bid_px = _to_decimal(perp_book.get("bidPrice"), "bidPrice")
        ask_px = _to_decimal(perp_book.get("askPrice"), "askPrice")
        bid_qty = _to_decimal(perp_book.get("bidQty"), "bidQty")
        ask_qty = _to_decimal(perp_book.get("askQty"), "askQty")
        if bid_px <= 0 or ask_px <= 0 or bid_px > ask_px:
            raise DataQualityError(f"crossed_or_invalid_l1_book (bid={bid_px}, ask={ask_px})")
        mid_px = (bid_px + ask_px) / Decimal("2")
        spread_bps = ((ask_px - bid_px) / mid_px) * Decimal("10000")

        book_time_ms = perp_book.get("time")
        book_event_dt = ms_to_utc(book_time_ms, "perp_book.time") if book_time_ms is not None else None
        ok_fresh, fresh_reasons, quote_age_s = validate_quote_freshness(
            exchange_event_time_utc=book_event_dt,
            local_capture_time_utc=capture_dt,
            max_future_skew_seconds=DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS,
            max_staleness_seconds=DEFAULT_MAX_QUOTE_STALENESS_SECONDS,
        )
        if not ok_fresh:
            raise DataQualityError(f"perp_book_freshness_failed: {'; '.join(fresh_reasons)}")

        timestamps = CausalTimestamps(
            market_event_time_utc=format_utc_iso(avail_dt),
            exchange_publication_time_utc=format_utc_iso(avail_dt),
            local_capture_time_utc=format_utc_iso(capture_dt),
            strategy_evaluation_time_utc=format_utc_iso(capture_dt),
        )

        if borrow_apr_bps is not None:
            if not isinstance(borrow_apr_bps, Decimal) or not borrow_apr_bps.is_finite() or borrow_apr_bps < Decimal("0"):
                raise DataQualityError(f"invalid_borrow_apr_bps ({borrow_apr_bps!r})")
        obs = NormalizedMarketObservation(
            venue="binance",
            instrument=instrument.upper(),
            spot_symbol=spot_symbol,
            perp_symbol=perp_symbol,
            observation_day_utc=obs_day,
            spot_price=f"{spot_close:.8f}",
            perp_price=f"{perp_close:.8f}",
            basis_bps=f"{basis_bps:.6f}",
            funding_rate_interval=f"{latest_funding:.10f}",
            funding_interval_hours=8,
            annualized_funding_bps=f"{annualized_funding_bps:.6f}",
            borrow_apr_bps=f"{borrow_apr_bps:.6f}" if borrow_apr_bps is not None else None,
            bid_price=f"{bid_px:.8f}",
            ask_price=f"{ask_px:.8f}",
            spread_bps=f"{spread_bps:.6f}",
            l1_bid_qty=f"{bid_qty:.8f}",
            l1_ask_qty=f"{ask_qty:.8f}",
            public_liquidity_metadata={
                "spot_quote_volume_24h": str(spot_candle[7]),
                "perp_quote_volume_24h": str(perp_candle[7]),
                "quote_age_seconds": round(quote_age_s, 4) if quote_age_s is not None else None,
            },
            instrument_availability_status="AVAILABLE",
            causal_timestamps=timestamps.to_dict(),
            data_completeness=1.0,
            source_request_ids=[e.raw_source_id for e in envelopes],
            source_response_hashes={e.raw_source_id: e.raw_sha256 for e in envelopes},
            source_authenticity_status=SOURCE_AUTHENTICITY_UNVERIFIED_HTTP,
            warnings=[] if borrow_apr_bps is not None else ["borrow_apr_bps_unavailable_public_endpoint"],
        )
        return obs, envelopes

    @staticmethod
    def _select_finalized_candle(klines: Sequence[Any], capture_dt: datetime, leg: str) -> Sequence[Any]:
        finalized: list[Sequence[Any]] = []
        for row in klines:
            if not isinstance(row, list) or len(row) < 8:
                raise DataQualityError(f"malformed_binance_{leg}_kline_row")
            ok, _, _, _ = validate_daily_candle_finalization(
                open_time_ms=int(row[0]),
                close_time_ms=int(row[6]),
                local_capture_time_utc=capture_dt,
            )
            if ok:
                finalized.append(row)
        if not finalized:
            raise DataQualityError(f"no_finalized_daily_candle_available_for_{leg}")
        return sorted(finalized, key=lambda r: int(r[0]))[-1]


class HyperliquidReadOnlyAdapter:
    """Public read-only Hyperliquid market, fundingHistory, and L2 top-of-book adapter."""

    INFO_URL = "https://api.hyperliquid.xyz/info"

    def __init__(
        self,
        client: PublicReadOnlyHttpClient,
        *,
        clock_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self._client = client
        self._clock_fn = clock_fn

    def capture_market_observation(
        self,
        *,
        coin: str,
        funding_start_time_ms: int,
        funding_end_time_ms: int | None = None,
        borrow_apr_bps: Decimal | None = None,
        fetch_public_borrow_rate: bool = False,
    ) -> tuple[NormalizedMarketObservation, list[RawCaptureEnvelope]]:
        """Capture public Hyperliquid oracle/mark context, 1h funding history, and L1 top-of-book."""
        coin_upper = coin.upper()
        meta_env = self._client.fetch(
            venue="hyperliquid",
            method="POST",
            url=self.INFO_URL,
            json_body={"type": "metaAndAssetCtxs"},
        )
        book_env = self._client.fetch(
            venue="hyperliquid",
            method="POST",
            url=self.INFO_URL,
            json_body={"type": "l2Book", "coin": coin_upper},
        )
        funding_req: dict[str, Any] = {
            "type": "fundingHistory",
            "coin": coin_upper,
            "startTime": int(funding_start_time_ms),
        }
        if funding_end_time_ms is not None:
            funding_req["endTime"] = int(funding_end_time_ms)
        funding_env = self._client.fetch(
            venue="hyperliquid",
            method="POST",
            url=self.INFO_URL,
            json_body=funding_req,
        )
        envelopes = [meta_env, book_env, funding_env]

        if borrow_apr_bps is not None:
            if not isinstance(borrow_apr_bps, Decimal) or not borrow_apr_bps.is_finite() or borrow_apr_bps < Decimal("0"):
                raise DataQualityError(f"invalid_borrow_apr_bps ({borrow_apr_bps!r})")

        spot_meta_env: RawCaptureEnvelope | None = None
        reserve_env: RawCaptureEnvelope | None = None
        if fetch_public_borrow_rate and borrow_apr_bps is None:
            from verification_lab.oos.hyperliquid_borrow_rate import HyperliquidBorrowRateAdapter

            borrow_adapter = HyperliquidBorrowRateAdapter(self._client, clock_fn=self._clock_fn)
            spot_meta_env = borrow_adapter.fetch_spot_meta()
            reserve_env = borrow_adapter.fetch_reserve_states()
            envelopes.extend([spot_meta_env, reserve_env])

        # Sample evaluation/capture timestamp AFTER all HTTP envelopes are received so live
        # advancing wall clocks satisfy cap_dt <= eval_dt across every envelope.
        capture_dt = self._clock_fn().astimezone(timezone.utc)
        meta_payload = _parse_json_bytes(meta_env)
        book_payload = _parse_json_bytes(book_env)
        funding_payload = _parse_json_bytes(funding_env)

        if not isinstance(meta_payload, list) or len(meta_payload) != 2:
            raise DataQualityError("malformed_hyperliquid_metaAndAssetCtxs")
        universe = meta_payload[0].get("universe") if isinstance(meta_payload[0], dict) else None
        ctxs = meta_payload[1]
        if not isinstance(universe, list) or not isinstance(ctxs, list) or len(universe) != len(ctxs):
            raise DataQualityError("mismatched_hyperliquid_universe_and_ctxs")

        asset_ctx: dict[str, Any] | None = None
        for meta_item, ctx_item in zip(universe, ctxs):
            if isinstance(meta_item, dict) and meta_item.get("name") == coin_upper:
                asset_ctx = ctx_item
                break
        if asset_ctx is None or not isinstance(asset_ctx, dict):
            raise DataQualityError(f"missing_market_instrument ({coin_upper} on hyperliquid)")

        oracle_px = _to_decimal(asset_ctx.get("oraclePx"), "oraclePx")
        mark_px = _to_decimal(asset_ctx.get("markPx"), "markPx")
        if oracle_px <= 0 or mark_px <= 0:
            raise DataQualityError("non_positive_hyperliquid_oracle_or_mark_price")
        basis_bps = ((mark_px - oracle_px) / oracle_px) * Decimal("10000")

        # Validate L2 top-of-book
        if not isinstance(book_payload, dict) or book_payload.get("coin") != coin_upper:
            raise DataQualityError("malformed_or_mismatched_hyperliquid_l2Book")
        levels = book_payload.get("levels")
        if not isinstance(levels, list) or len(levels) != 2 or not levels[0] or not levels[1]:
            raise DataQualityError("empty_hyperliquid_l2_levels")
        top_bid = levels[0][0]
        top_ask = levels[1][0]
        bid_px = _to_decimal(top_bid.get("px"), "l2Book.bid.px")
        ask_px = _to_decimal(top_ask.get("px"), "l2Book.ask.px")
        bid_sz = _to_decimal(top_bid.get("sz"), "l2Book.bid.sz")
        ask_sz = _to_decimal(top_ask.get("sz"), "l2Book.ask.sz")
        if bid_px <= 0 or ask_px <= 0 or bid_px > ask_px:
            raise DataQualityError(f"crossed_or_invalid_hyperliquid_book (bid={bid_px}, ask={ask_px})")
        spread_bps = ((ask_px - bid_px) / ((bid_px + ask_px) / Decimal("2"))) * Decimal("10000")

        book_time_ms = book_payload.get("time")
        book_dt = ms_to_utc(book_time_ms, "l2Book.time") if book_time_ms is not None else None
        ok_fresh, fresh_reasons, quote_age_s = validate_quote_freshness(
            exchange_event_time_utc=book_dt,
            local_capture_time_utc=capture_dt,
        )
        if not ok_fresh or book_dt is None:
            raise DataQualityError(f"hyperliquid_quote_freshness_failed: {'; '.join(fresh_reasons)}")

        # Validate 1h funding history
        if not isinstance(funding_payload, list) or not funding_payload:
            raise DataQualityError("empty_hyperliquid_fundingHistory")
        funding_times: list[int] = []
        funding_rates: list[Decimal] = []
        for row in funding_payload:
            if not isinstance(row, dict) or row.get("coin") != coin_upper:
                raise DataQualityError("malformed_or_mismatched_hyperliquid_funding_row")
            funding_times.append(int(row["time"]))
            funding_rates.append(_to_decimal(row["fundingRate"], "fundingRate"))

        ok_funding, funding_reasons = validate_causal_funding_events(
            venue="hyperliquid",
            funding_times_ms=funding_times,
            evaluation_time_utc=capture_dt,
            expected_interval_hours=1,
        )
        if not ok_funding:
            raise DataQualityError(f"hyperliquid_causal_funding_failed: {'; '.join(funding_reasons)}")

        latest_funding_dt = ms_to_utc(funding_times[-1], "hyperliquid.latest_funding_time")
        funding_age_s = (capture_dt - latest_funding_dt).total_seconds()
        if funding_age_s > 7200.0:
            raise DataQualityError(
                f"stale_hyperliquid_funding_timestamp (age={funding_age_s:.1f}s > 7200s)"
            )

        latest_funding = funding_rates[-1]
        annualized_funding_bps = latest_funding * HYPERLIQUID_FUNDING_EVENTS_PER_YEAR * Decimal("10000")

        timestamps = CausalTimestamps(
            market_event_time_utc=format_utc_iso(book_dt),
            exchange_publication_time_utc=format_utc_iso(book_dt),
            local_capture_time_utc=format_utc_iso(capture_dt),
            strategy_evaluation_time_utc=format_utc_iso(capture_dt),
        )

        liquidity_meta: dict[str, Any] = {
            "open_interest": str(asset_ctx.get("openInterest")),
            "day_ntl_vlm": str(asset_ctx.get("dayNtlVlm")),
            "quote_age_seconds": round(quote_age_s, 4) if quote_age_s is not None else None,
            "reference_price_type": "ORACLE_REFERENCE_NOT_SPOT_BOOK",
        }
        resolved_borrow_bps: str | None = f"{borrow_apr_bps:.6f}" if borrow_apr_bps is not None else None
        warnings: list[str] = []

        if spot_meta_env is not None and reserve_env is not None:
            from verification_lab.oos.hyperliquid_borrow_rate import (
                build_borrow_rate_observation_from_envelopes,
            )

            borrow_obs = build_borrow_rate_observation_from_envelopes(
                spot_meta_envelope=spot_meta_env,
                reserve_envelope=reserve_env,
                evaluation_time_utc=capture_dt,
            )
            liquidity_meta["borrow_rate_evidence"] = borrow_obs.to_dict()
            if borrow_obs.eligible_for_borrow_input and borrow_obs.borrow_apr_bps is not None:
                resolved_borrow_bps = borrow_obs.borrow_apr_bps
            else:
                resolved_borrow_bps = None
                warnings.append("borrow_rate_invalid_or_unverifiable")
        elif resolved_borrow_bps is None:
            warnings.append("borrow_apr_bps_unavailable_public_endpoint")

        obs = NormalizedMarketObservation(
            venue="hyperliquid",
            instrument=coin_upper,
            spot_symbol=None,  # Hyperliquid publishes oracle reference price, not spot orderbook
            perp_symbol=f"{coin_upper}-PERP",
            observation_day_utc=book_dt.date().isoformat(),
            spot_price=f"{oracle_px:.8f}",
            perp_price=f"{mark_px:.8f}",
            basis_bps=f"{basis_bps:.6f}",
            funding_rate_interval=f"{latest_funding:.10f}",
            funding_interval_hours=1,
            annualized_funding_bps=f"{annualized_funding_bps:.6f}",
            borrow_apr_bps=resolved_borrow_bps,
            bid_price=f"{bid_px:.8f}",
            ask_price=f"{ask_px:.8f}",
            spread_bps=f"{spread_bps:.6f}",
            l1_bid_qty=f"{bid_sz:.8f}",
            l1_ask_qty=f"{ask_sz:.8f}",
            public_liquidity_metadata=liquidity_meta,
            instrument_availability_status="AVAILABLE",
            causal_timestamps=timestamps.to_dict(),
            data_completeness=1.0,
            source_request_ids=[e.raw_source_id for e in envelopes],
            source_response_hashes={e.raw_source_id: e.raw_sha256 for e in envelopes},
            source_authenticity_status=SOURCE_AUTHENTICITY_UNVERIFIED_HTTP,
            warnings=warnings,
        )
        return obs, envelopes
