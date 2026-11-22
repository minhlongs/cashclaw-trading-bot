"""Causal market-timing enforcement for H3_BASIS_CARRY_V2 passive OOS observation.

Separates four non-interchangeable UTC timestamps:
1. market_event_time_utc       — exchange bar close or funding settlement timestamp
2. exchange_publication_time_utc — explicit venue publication time when available (None if unpublished)
3. local_capture_time_utc      — local reception timestamp (injected clock)
4. strategy_evaluation_time_utc — deterministic strategy evaluation timestamp (injected clock)

Rules:
- Daily candles must be strictly finalized (close_time_utc < local_capture_time_utc).
- Funding events after evaluation_time_utc are rejected as future funding leakage.
- Historical retrieval outside the live capture window is tagged RETROACTIVE_DIAGNOSTIC_ONLY
  and cannot advance the 90-day prospective eligible-observation clock.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Sequence

from verification_lab.oos.prospective_observation import PROSPECTIVE_START_UTC

EXPECTED_DAILY_CANDLE_SPAN_MS = 86_400_000 - 1  # 23:59:59.999Z - 00:00:00.000Z
DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS = 5.0
DEFAULT_MAX_QUOTE_STALENESS_SECONDS = 300.0
DEFAULT_MAX_LIVE_CAPTURE_LAG_HOURS = 24.0

VENUE_FUNDING_INTERVAL_HOURS: dict[str, int] = {
    "binance": 8,
    "hyperliquid": 1,
}


def ensure_utc(dt: datetime, label: str = "timestamp") -> datetime:
    """Require a timezone-aware datetime and normalize it to UTC."""
    if not isinstance(dt, datetime) or dt.tzinfo is None or dt.utcoffset() is None:
        raise ValueError(f"{label} must be a timezone-aware datetime")
    return dt.astimezone(timezone.utc)


def parse_utc_iso(value: str, label: str = "timestamp") -> datetime:
    """Parse an ISO-8601 UTC timestamp fail-closed."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty ISO-8601 string")
    dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    return ensure_utc(dt, label=label)


def ms_to_utc(epoch_ms: int | float, label: str = "epoch_ms") -> datetime:
    """Convert Unix epoch milliseconds to a timezone-aware UTC datetime."""
    if isinstance(epoch_ms, bool) or not isinstance(epoch_ms, (int, float)):
        raise ValueError(f"{label} must be numeric epoch milliseconds")
    if epoch_ms <= 0:
        raise ValueError(f"{label} must be positive epoch milliseconds: {epoch_ms!r}")
    return datetime.fromtimestamp(float(epoch_ms) / 1000.0, tz=timezone.utc)


def format_utc_iso(dt: datetime) -> str:
    """Format a UTC datetime in canonical ISO-8601 Z format."""
    utc_dt = ensure_utc(dt)
    return utc_dt.isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class CausalTimestamps:
    """Explicit separation of the four causal timestamps for an observation."""

    market_event_time_utc: str
    exchange_publication_time_utc: str | None
    local_capture_time_utc: str
    strategy_evaluation_time_utc: str

    def available_at_utc(self) -> str:
        """Conservative availability timestamp: max(market_event, publication) when both exist."""
        event_dt = parse_utc_iso(self.market_event_time_utc, "market_event_time_utc")
        if self.exchange_publication_time_utc is not None:
            pub_dt = parse_utc_iso(self.exchange_publication_time_utc, "exchange_publication_time_utc")
            return format_utc_iso(max(event_dt, pub_dt))
        return format_utc_iso(event_dt)

    def to_dict(self) -> dict[str, Any]:
        return {
            **asdict(self),
            "derived_available_at_utc": self.available_at_utc(),
        }


@dataclass(frozen=True)
class CausalTimingCheck:
    valid: bool
    reasons: list[str]
    observation_day_utc: str | None
    available_at_utc: str | None
    capture_classification: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def validate_daily_candle_finalization(
    *,
    open_time_ms: int,
    close_time_ms: int,
    local_capture_time_utc: datetime,
    max_future_skew_seconds: float = DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS,
) -> tuple[bool, list[str], str | None, datetime | None]:
    """Validate that a 1d UTC candle is complete and finalized before local capture."""
    reasons: list[str] = []
    capture_dt = ensure_utc(local_capture_time_utc, "local_capture_time_utc")

    try:
        open_dt = ms_to_utc(open_time_ms, "open_time_ms")
        close_dt = ms_to_utc(close_time_ms, "close_time_ms")
    except ValueError as exc:
        return False, [f"invalid_candle_timestamps: {exc}"], None, None

    if (open_dt.hour, open_dt.minute, open_dt.second, open_dt.microsecond) != (0, 0, 0, 0):
        reasons.append(f"daily_candle_open_not_utc_midnight ({format_utc_iso(open_dt)})")

    span_ms = int(close_time_ms) - int(open_time_ms)
    if span_ms != EXPECTED_DAILY_CANDLE_SPAN_MS:
        reasons.append(
            f"daily_candle_incomplete_span_ms (expected={EXPECTED_DAILY_CANDLE_SPAN_MS}, actual={span_ms})"
        )

    # A daily candle is finalized only after its close millisecond has strictly passed.
    finalized_available_dt = close_dt + timedelta(milliseconds=1)
    if capture_dt < finalized_available_dt:
        reasons.append(
            f"unfinished_daily_candle_used_before_close "
            f"(capture={format_utc_iso(capture_dt)} < available={format_utc_iso(finalized_available_dt)})"
        )

    if open_dt > capture_dt + timedelta(seconds=max_future_skew_seconds):
        reasons.append(
            f"clock_skew_future_candle_open ({format_utc_iso(open_dt)} > {format_utc_iso(capture_dt)})"
        )

    return len(reasons) == 0, reasons, open_dt.date().isoformat(), finalized_available_dt


def validate_causal_funding_events(
    *,
    venue: str,
    funding_times_ms: Sequence[int],
    evaluation_time_utc: datetime,
    expected_interval_hours: int | None = None,
) -> tuple[bool, list[str]]:
    """Fail-closed validation of funding settlement timestamps against evaluation time."""
    reasons: list[str] = []
    eval_dt = ensure_utc(evaluation_time_utc, "evaluation_time_utc")
    interval_hours = (
        expected_interval_hours
        if expected_interval_hours is not None
        else VENUE_FUNDING_INTERVAL_HOURS.get(venue.lower())
    )

    if not funding_times_ms:
        return False, ["empty_funding_events"]

    seen: set[int] = set()
    parsed_dts: list[datetime] = []
    for raw_ms in funding_times_ms:
        try:
            dt = ms_to_utc(raw_ms, "funding_time_ms")
        except ValueError as exc:
            reasons.append(f"invalid_funding_timestamp: {exc}")
            continue

        if int(raw_ms) in seen:
            reasons.append(f"duplicate_funding_event_timestamp ({raw_ms})")
        seen.add(int(raw_ms))

        if dt > eval_dt:
            reasons.append(
                f"future_funding_leakage ({format_utc_iso(dt)} > eval={format_utc_iso(eval_dt)})"
            )

        if interval_hours is not None:
            # Exchange settlement timestamps may carry millisecond jitter (e.g., Hyperliquid +33ms),
            # so allow up to 60 seconds after the nominal hour boundary, never before.
            minute_offset_s = dt.minute * 60 + dt.second + dt.microsecond / 1_000_000.0
            if (dt.hour % interval_hours != 0) or minute_offset_s > 60.0:
                reasons.append(
                    f"funding_settlement_misaligned_for_{venue} "
                    f"(expected_every_{interval_hours}h, got={format_utc_iso(dt)})"
                )
        parsed_dts.append(dt)

    if len(parsed_dts) >= 2:
        sorted_dts = sorted(parsed_dts)
        if parsed_dts != sorted_dts:
            reasons.append("funding_events_out_of_order")
        if interval_hours is not None:
            expected_delta_s = interval_hours * 3600.0
            for prev_dt, cur_dt in zip(sorted_dts, sorted_dts[1:]):
                delta_s = (cur_dt - prev_dt).total_seconds()
                if abs(delta_s - expected_delta_s) > 120.0:
                    reasons.append(
                        f"funding_interval_gap_or_mismatch "
                        f"(expected={expected_delta_s:.0f}s, actual={delta_s:.1f}s)"
                    )

    return len(reasons) == 0, reasons


def validate_quote_freshness(
    *,
    exchange_event_time_utc: datetime | None,
    local_capture_time_utc: datetime,
    max_future_skew_seconds: float = DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS,
    max_staleness_seconds: float = DEFAULT_MAX_QUOTE_STALENESS_SECONDS,
) -> tuple[bool, list[str], float | None]:
    """Validate quote timestamp against clock skew and staleness bounds."""
    capture_dt = ensure_utc(local_capture_time_utc, "local_capture_time_utc")
    if exchange_event_time_utc is None:
        return False, ["missing_exchange_event_timestamp"], None

    event_dt = ensure_utc(exchange_event_time_utc, "exchange_event_time_utc")
    age_seconds = (capture_dt - event_dt).total_seconds()
    reasons: list[str] = []
    if age_seconds < -max_future_skew_seconds:
        reasons.append(
            f"clock_skew_exchange_ahead_of_local ({age_seconds:.3f}s < -{max_future_skew_seconds}s)"
        )
    if age_seconds > max_staleness_seconds:
        reasons.append(
            f"stale_exchange_event_timestamp (age={age_seconds:.3f}s > max={max_staleness_seconds}s)"
        )
    return len(reasons) == 0, reasons, age_seconds


def validate_causal_observation_window(
    *,
    timestamps: CausalTimestamps,
    observation_day_utc: str,
    prospective_start_utc: datetime = PROSPECTIVE_START_UTC,
    max_live_capture_lag_hours: float = DEFAULT_MAX_LIVE_CAPTURE_LAG_HOURS,
    max_future_skew_seconds: float = DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS,
) -> CausalTimingCheck:
    """Enforce full causal ordering and distinguish live prospective capture from retroactive retrieval."""
    reasons: list[str] = []
    try:
        event_dt = parse_utc_iso(timestamps.market_event_time_utc, "market_event_time_utc")
        pub_dt = (
            parse_utc_iso(timestamps.exchange_publication_time_utc, "exchange_publication_time_utc")
            if timestamps.exchange_publication_time_utc is not None
            else None
        )
        capture_dt = parse_utc_iso(timestamps.local_capture_time_utc, "local_capture_time_utc")
        eval_dt = parse_utc_iso(timestamps.strategy_evaluation_time_utc, "strategy_evaluation_time_utc")
    except ValueError as exc:
        return CausalTimingCheck(
            valid=False,
            reasons=[f"invalid_causal_timestamp: {exc}"],
            observation_day_utc=None,
            available_at_utc=None,
            capture_classification="INVALID_TIMESTAMPS",
        )

    avail_dt = max(event_dt, pub_dt) if pub_dt is not None else event_dt
    prospective_start = ensure_utc(prospective_start_utc, "prospective_start_utc")

    # 1. Causal ordering: market event <= publication <= available <= capture <= evaluation
    if pub_dt is not None and pub_dt < event_dt:
        reasons.append("exchange_publication_before_market_event")

    if capture_dt + timedelta(seconds=max_future_skew_seconds) < avail_dt:
        reasons.append(
            f"capture_before_data_available "
            f"(capture={format_utc_iso(capture_dt)} < available={format_utc_iso(avail_dt)})"
        )

    if eval_dt < avail_dt:
        reasons.append(
            f"evaluation_before_data_available "
            f"(eval={format_utc_iso(eval_dt)} < available={format_utc_iso(avail_dt)})"
        )

    if eval_dt < capture_dt:
        reasons.append(
            f"evaluation_before_local_capture "
            f"(eval={format_utc_iso(eval_dt)} < capture={format_utc_iso(capture_dt)})"
        )

    # 2. Prospective OOS start restriction (both timestamps and canonical observation day)
    try:
        obs_day_date = date.fromisoformat(observation_day_utc)
    except ValueError:
        reasons.append(f"invalid_observation_day_utc ({observation_day_utc!r})")
        obs_day_date = None

    if obs_day_date is not None:
        if obs_day_date < prospective_start.date():
            reasons.append(
                f"observation_day_before_prospective_start "
                f"({observation_day_utc} < {prospective_start.date().isoformat()})"
            )
        day_diff = (avail_dt.date() - obs_day_date).days
        # Valid availability date is either the same UTC day (intraday snapshot) or
        # the next UTC day at candle close + 1ms (finalized 1d UTC candle).
        if day_diff < 0 or day_diff > 1:
            reasons.append(
                f"observation_day_available_time_mismatch "
                f"(obs_day={observation_day_utc}, available={format_utc_iso(avail_dt)})"
            )

    if event_dt < prospective_start or capture_dt < prospective_start or eval_dt < prospective_start:
        reasons.append(
            f"observation_before_prospective_start ({format_utc_iso(prospective_start)})"
        )

    # 3. Distinguish genuine live prospective capture from late historical reconstruction
    capture_lag_hours = (capture_dt - avail_dt).total_seconds() / 3600.0
    if capture_lag_hours > max_live_capture_lag_hours:
        capture_classification = "RETROACTIVE_DIAGNOSTIC_ONLY"
        reasons.append(
            f"retroactive_capture_lag_exceeded "
            f"(lag_hours={capture_lag_hours:.2f} > max={max_live_capture_lag_hours:.2f})"
        )
    else:
        capture_classification = "LIVE_PROSPECTIVE_CAPTURE"

    return CausalTimingCheck(
        valid=len(reasons) == 0,
        reasons=reasons,
        observation_day_utc=observation_day_utc,
        available_at_utc=format_utc_iso(avail_dt),
        capture_classification=capture_classification,
    )
