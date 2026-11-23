"""Public read-only Hyperliquid USDC borrow-rate adapter for H3_BASIS_CARRY_V2.

Official documentation references:
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/portfolio-margin

Safety, economic, and provenance invariants:
- Public read-only HTTPS POST endpoints ONLY (allBorrowLendReserveStates + spotMeta).
- Zero exchange credentials, zero API keys, zero order-capable imports.
- Exact Decimal arithmetic throughout; binary floats are never used for rates or accounting.
- Never hardcodes historical rate (0.05) or assumes USDC token index == 0 without verifying spotMeta.
- Stores raw borrowYearlyRate separately from derived effective APY / nominal APR / hourly accrual.
- Never invents an exchange publication timestamp when the endpoint omits one.
- Distinguishes local integrity from external authentication (SOURCE_CAPTURED_LOCAL_UNAUTHENTICATED).
- Fail-closed on every schema, mapping, utilization, conversion, or causal timing anomaly.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Mapping

from verification_lab.oos.adapters import (
    DataQualityError,
    PublicReadOnlyHttpClient,
    RawCaptureEnvelope,
    SOURCE_AUTHENTICITY_UNVERIFIED_HTTP,
    _parse_json_bytes,
)
from verification_lab.oos.causal_timing import (
    DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS,
    DEFAULT_MAX_QUOTE_STALENESS_SECONDS,
    ensure_utc,
    format_utc_iso,
    parse_utc_iso,
)

HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info"
HYPERLIQUID_VENUE = "HYPERLIQUID"
TARGET_BORROW_ASSET = "USDC"

BORROW_RATE_SOURCE_PUBLIC_READ_ONLY = "VENUE_OBSERVED_PUBLIC_READ_ONLY"
BORROW_RATE_STATUS_INVALID = "BORROW_RATE_INVALID_OR_UNVERIFIABLE"
BORROW_RATE_SOURCE_MANUAL = "MANUAL_ASSUMPTION_NOT_VENUE_OBSERVED"

RATE_CONVENTION_DOCUMENTED_CONTINUOUS_APY = "HYPERLIQUID_PORTFOLIO_MARGIN_CONTINUOUS_APY"
RATE_CONVENTION_NOT_VERIFIED = "RATE_CONVENTION_NOT_VERIFIED"

CONVERSION_STATUS_VERIFIED = "VERIFIED_CONTINUOUS_APY_TO_NOMINAL_APR"
CONVERSION_STATUS_NOT_VERIFIED = "RATE_CONVENTION_NOT_VERIFIED"

CAUSAL_STATUS_LOCAL_BOUNDED_NO_PUB_TS = "LOCAL_CAPTURE_BOUNDED_NO_VENUE_PUB_TS"
CAUSAL_STATUS_BLOCKED_PROVENANCE = "BLOCKED_CAUSAL_PROVENANCE"
CAUSAL_STATUS_VIOLATION = "CAUSAL_VIOLATION"

# Documented Hyperliquid Portfolio Margin stablecoin borrow formula:
# borrow_apy = 0.05 + 4.75 * max(0, utilization - 0.8), compounded continuously, indexed hourly.
FORMULA_BASE_RATE = Decimal("0.05")
FORMULA_SLOPE = Decimal("4.75")
FORMULA_KINK_UTILIZATION = Decimal("0.8")
HOURS_PER_YEAR = Decimal("8760")
BPS_PER_UNIT = Decimal("10000")

DEFAULT_RATE_FORMULA_TOLERANCE = Decimal("0.0005")  # 5 bps
DEFAULT_UTILIZATION_RATIO_TOLERANCE = Decimal("0.001")  # 0.1% utilization
DEFAULT_BALANCE_RELATIVE_TOLERANCE = Decimal("0.01")  # 1% relative buffer vs totalSupplied
MAX_SANE_ANNUAL_RATE = Decimal("100")  # 10,000% APY upper sanity bound

REQUIRED_RESERVE_FIELDS: tuple[str, ...] = (
    "borrowYearlyRate",
    "supplyYearlyRate",
    "utilization",
    "totalSupplied",
    "totalBorrowed",
    "oraclePx",
    "ltv",
    "balance",
)


def _canonical_sha256(obj: Any) -> str:
    raw = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _parse_strict_decimal(val: Any, field: str) -> Decimal:
    """Parse an exact finite Decimal; reject bool, float NaN/Inf, None, or malformed strings."""
    if isinstance(val, bool) or val is None:
        raise DataQualityError(f"missing_or_invalid_decimal ({field}={val!r})")
    if isinstance(val, float):
        raise DataQualityError(f"binary_float_forbidden_for_rate_field ({field}={val!r})")
    if isinstance(val, str):
        stripped = val.strip()
        if not stripped:
            raise DataQualityError(f"empty_decimal_string ({field})")
        lower = stripped.lower()
        if lower in {"nan", "+nan", "-nan", "inf", "+inf", "-inf", "infinity", "+infinity", "-infinity"}:
            raise DataQualityError(f"non_finite_decimal ({field}={val!r})")
    try:
        dec = Decimal(str(val))
    except (InvalidOperation, ValueError) as exc:
        raise DataQualityError(f"malformed_decimal ({field}={val!r})") from exc
    if not dec.is_finite():
        raise DataQualityError(f"non_finite_decimal ({field}={val!r})")
    return dec


@dataclass(frozen=True)
class TokenResolution:
    symbol: str
    token_index: int
    token_id_hex: str | None
    sz_decimals: int | None
    wei_decimals: int | None
    is_canonical: bool | None
    spot_meta_sha256: str
    index_matches_historical_zero: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class UtilizationConsistencyCheck:
    consistent: bool
    observed_borrow_yearly_rate: str
    formula_implied_yearly_rate: str
    rate_difference: str
    reported_utilization: str
    computed_utilization: str | None
    utilization_difference: str | None
    total_supplied: str
    total_borrowed: str
    balance: str
    ltv: str
    oracle_px: str
    discrepancy_reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RateConversionResult:
    venue: str
    borrow_asset: str
    borrow_rate_raw: str
    raw_rate_field: str
    annualization_convention: str
    effective_apy: str | None
    nominal_apr: str | None
    nominal_apr_bps: str | None
    effective_apy_bps: str | None
    hourly_accrual_rate: str | None
    conversion_method: str
    conversion_evidence: str
    conversion_status: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class BorrowRateCausalTimestamps:
    market_rate_event_time_utc: str | None
    exchange_publication_time_utc: str | None
    http_response_date_utc: str | None
    local_request_time_utc: str
    local_capture_time_utc: str
    strategy_evaluation_time_utc: str
    causal_validity_status: str
    causal_reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class HyperliquidBorrowRateObservation:
    observation_id: str
    venue: str
    borrow_asset: str
    token_resolution: dict[str, Any]
    rate_conversion: dict[str, Any]
    utilization_check: dict[str, Any]
    causal_timestamps: dict[str, Any]
    borrow_apr_bps: str | None
    borrow_rate_source: str
    source_authenticity_status: str
    causal_validity_status: str
    eligible_for_borrow_input: bool
    failure_reasons: list[str]
    source_endpoint: str
    requested_query_types: list[str]
    raw_reserve_sha256: str
    raw_spot_meta_sha256: str
    normalized_sha256: str
    capital_economics_metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def resolve_usdc_token(
    spot_meta_payload: Any,
    *,
    spot_meta_sha256: str,
    target_symbol: str = TARGET_BORROW_ASSET,
) -> TokenResolution:
    """Resolve exact USDC token index and metadata from Hyperliquid spotMeta fail-closed."""
    if not isinstance(spot_meta_payload, Mapping):
        raise DataQualityError("malformed_spot_meta_not_object")
    tokens = spot_meta_payload.get("tokens")
    if not isinstance(tokens, list) or not tokens:
        raise DataQualityError("empty_or_missing_spot_meta_tokens")

    seen_indices: set[int] = set()
    matches: list[Mapping[str, Any]] = []
    for item in tokens:
        if not isinstance(item, Mapping):
            raise DataQualityError("malformed_spot_meta_token_entry")
        idx = item.get("index")
        if isinstance(idx, bool) or not isinstance(idx, int) or idx < 0:
            raise DataQualityError(f"invalid_spot_meta_token_index ({idx!r})")
        if idx in seen_indices:
            raise DataQualityError(f"duplicate_token_index_in_spot_meta ({idx})")
        seen_indices.add(idx)

        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            raise DataQualityError(f"invalid_spot_meta_token_name (index={idx})")
        if name == target_symbol:
            matches.append(item)

    if not matches:
        raise DataQualityError(f"missing_{target_symbol.lower()}_in_spot_meta")
    if len(matches) > 1:
        raise DataQualityError(
            f"ambiguous_duplicate_{target_symbol.lower()}_in_spot_meta (count={len(matches)})"
        )

    tok = matches[0]
    token_index = int(tok["index"])
    is_canonical = tok.get("isCanonical")
    if is_canonical is not None and not isinstance(is_canonical, bool):
        raise DataQualityError(f"invalid_spot_meta_is_canonical ({is_canonical!r})")
    if is_canonical is False:
        raise DataQualityError(f"non_canonical_{target_symbol.lower()}_token_metadata (index={token_index})")

    token_id_hex = tok.get("tokenId")
    if token_id_hex is not None and (not isinstance(token_id_hex, str) or not token_id_hex.strip()):
        raise DataQualityError(f"invalid_spot_meta_token_id ({token_id_hex!r})")

    sz_dec = tok.get("szDecimals")
    wei_dec = tok.get("weiDecimals")
    if sz_dec is not None and (isinstance(sz_dec, bool) or not isinstance(sz_dec, int) or sz_dec < 0):
        raise DataQualityError(f"invalid_spot_meta_sz_decimals ({sz_dec!r})")
    if wei_dec is not None and (isinstance(wei_dec, bool) or not isinstance(wei_dec, int) or wei_dec < 0):
        raise DataQualityError(f"invalid_spot_meta_wei_decimals ({wei_dec!r})")
    if sz_dec is not None and wei_dec is not None and sz_dec > wei_dec:
        raise DataQualityError(f"conflicting_spot_meta_decimals (sz={sz_dec} > wei={wei_dec})")

    return TokenResolution(
        symbol=target_symbol,
        token_index=token_index,
        token_id_hex=token_id_hex,
        sz_decimals=sz_dec,
        wei_decimals=wei_dec,
        is_canonical=is_canonical,
        spot_meta_sha256=spot_meta_sha256,
        index_matches_historical_zero=(token_index == 0),
    )


def extract_usdc_reserve_state(
    reserves_payload: Any,
    token_resolution: TokenResolution,
) -> dict[str, Decimal]:
    """Validate allBorrowLendReserveStates shape and extract exact Decimal fields for USDC."""
    if not isinstance(reserves_payload, list) or not reserves_payload:
        raise DataQualityError("empty_or_malformed_borrow_lend_reserves")

    seen_token_ids: set[int] = set()
    target_state: Mapping[str, Any] | None = None
    for entry in reserves_payload:
        if not isinstance(entry, list) or len(entry) != 2:
            raise DataQualityError("malformed_reserve_pair_entry")
        raw_token_id, state_obj = entry[0], entry[1]
        if isinstance(raw_token_id, bool) or not isinstance(raw_token_id, int) or raw_token_id < 0:
            raise DataQualityError(f"invalid_reserve_token_id ({raw_token_id!r})")
        if raw_token_id in seen_token_ids:
            raise DataQualityError(f"duplicate_token_id_in_reserves ({raw_token_id})")
        seen_token_ids.add(raw_token_id)

        if not isinstance(state_obj, Mapping):
            raise DataQualityError(f"malformed_reserve_state_object (token_id={raw_token_id})")
        if raw_token_id == token_resolution.token_index:
            target_state = state_obj

    if target_state is None:
        raise DataQualityError(
            f"missing_usdc_reserve_state (expected_token_index={token_resolution.token_index})"
        )

    parsed: dict[str, Decimal] = {}
    for field_name in REQUIRED_RESERVE_FIELDS:
        if field_name not in target_state:
            raise DataQualityError(f"missing_reserve_field ({field_name})")
        parsed[field_name] = _parse_strict_decimal(target_state[field_name], field_name)

    if parsed["borrowYearlyRate"] < Decimal("0"):
        raise DataQualityError(f"negative_borrow_yearly_rate ({parsed['borrowYearlyRate']})")
    if parsed["borrowYearlyRate"] > MAX_SANE_ANNUAL_RATE:
        raise DataQualityError(f"excessive_borrow_yearly_rate ({parsed['borrowYearlyRate']})")
    if parsed["supplyYearlyRate"] < Decimal("0"):
        raise DataQualityError(f"negative_supply_yearly_rate ({parsed['supplyYearlyRate']})")
    if parsed["utilization"] < Decimal("0") or parsed["utilization"] > Decimal("1"):
        raise DataQualityError(f"invalid_utilization_range ({parsed['utilization']})")
    if parsed["totalSupplied"] <= Decimal("0"):
        raise DataQualityError(f"zero_or_negative_total_supplied ({parsed['totalSupplied']})")
    if parsed["totalBorrowed"] < Decimal("0"):
        raise DataQualityError(f"negative_total_borrowed ({parsed['totalBorrowed']})")
    if parsed["totalBorrowed"] > parsed["totalSupplied"]:
        raise DataQualityError(
            f"total_borrowed_exceeds_total_supplied "
            f"(borrowed={parsed['totalBorrowed']} > supplied={parsed['totalSupplied']})"
        )
    if parsed["oraclePx"] <= Decimal("0"):
        raise DataQualityError(f"non_positive_reserve_oracle_px ({parsed['oraclePx']})")
    if parsed["ltv"] < Decimal("0") or parsed["ltv"] > Decimal("1"):
        raise DataQualityError(f"invalid_reserve_ltv ({parsed['ltv']})")
    if parsed["balance"] < Decimal("0"):
        raise DataQualityError(f"negative_reserve_balance ({parsed['balance']})")

    return parsed


def compute_documented_formula_rate(utilization: Decimal) -> Decimal:
    """Compute Hyperliquid documented stablecoin borrow APY: 0.05 + 4.75 * max(0, u - 0.8)."""
    excess = utilization - FORMULA_KINK_UTILIZATION
    if excess < Decimal("0"):
        excess = Decimal("0")
    return FORMULA_BASE_RATE + (FORMULA_SLOPE * excess)


def validate_utilization_consistency(
    reserve_decimals: Mapping[str, Decimal],
    *,
    rate_tolerance: Decimal = DEFAULT_RATE_FORMULA_TOLERANCE,
    utilization_tolerance: Decimal = DEFAULT_UTILIZATION_RATIO_TOLERANCE,
    balance_relative_tolerance: Decimal = DEFAULT_BALANCE_RELATIVE_TOLERANCE,
) -> UtilizationConsistencyCheck:
    """Cross-check observed borrowYearlyRate, reported utilization, and reserve balances using Decimal."""
    observed_rate = reserve_decimals["borrowYearlyRate"]
    reported_u = reserve_decimals["utilization"]
    total_supplied = reserve_decimals["totalSupplied"]
    total_borrowed = reserve_decimals["totalBorrowed"]
    balance = reserve_decimals["balance"]
    ltv = reserve_decimals["ltv"]
    oracle_px = reserve_decimals["oraclePx"]

    formula_rate = compute_documented_formula_rate(reported_u)
    rate_diff = abs(observed_rate - formula_rate)
    reasons: list[str] = []
    if rate_diff > rate_tolerance:
        reasons.append(
            f"formula_and_observed_rate_disagree "
            f"(observed={observed_rate}, formula={formula_rate}, diff={rate_diff} > tol={rate_tolerance})"
        )

    computed_u_str: str | None = None
    util_diff_str: str | None = None
    if total_supplied <= Decimal("0"):
        reasons.append(f"zero_or_negative_total_supplied ({total_supplied})")
    else:
        computed_u = total_borrowed / total_supplied
        util_diff = abs(reported_u - computed_u)
        computed_u_str = f"{computed_u:.10f}"
        util_diff_str = f"{util_diff:.10f}"
        if util_diff > utilization_tolerance:
            reasons.append(
                f"reported_and_computed_utilization_disagree "
                f"(reported={reported_u}, computed={computed_u:.10f}, diff={util_diff:.10f} > tol={utilization_tolerance})"
            )

        expected_available = total_supplied - total_borrowed
        balance_diff_ratio = abs(balance - expected_available) / total_supplied
        if balance_diff_ratio > balance_relative_tolerance:
            reasons.append(
                f"inconsistent_reserve_balance "
                f"(balance={balance}, expected_available={expected_available}, rel_diff={balance_diff_ratio:.6f} > tol={balance_relative_tolerance})"
            )

    return UtilizationConsistencyCheck(
        consistent=len(reasons) == 0,
        observed_borrow_yearly_rate=str(observed_rate),
        formula_implied_yearly_rate=f"{formula_rate:.10f}",
        rate_difference=f"{rate_diff:.10f}",
        reported_utilization=str(reported_u),
        computed_utilization=computed_u_str,
        utilization_difference=util_diff_str,
        total_supplied=str(total_supplied),
        total_borrowed=str(total_borrowed),
        balance=str(balance),
        ltv=str(ltv),
        oracle_px=str(oracle_px),
        discrepancy_reasons=reasons,
    )


def classify_and_convert_rate(
    borrow_rate_raw: Decimal,
    *,
    annualization_convention: str = RATE_CONVENTION_DOCUMENTED_CONTINUOUS_APY,
) -> RateConversionResult:
    """Convert raw borrowYearlyRate to nominal APR only when convention is explicitly verified.

    Never assumes an unsupported conversion: unknown conventions return RATE_CONVENTION_NOT_VERIFIED
    with nominal_apr = None so downstream evaluation fails closed.
    """
    if not borrow_rate_raw.is_finite() or borrow_rate_raw < Decimal("0"):
        raise DataQualityError(f"invalid_borrow_rate_for_conversion ({borrow_rate_raw})")

    if annualization_convention == RATE_CONVENTION_DOCUMENTED_CONTINUOUS_APY:
        effective_apy = borrow_rate_raw
        nominal_apr = (Decimal("1") + effective_apy).ln()
        hourly_accrual = nominal_apr / HOURS_PER_YEAR
        nominal_apr_bps = nominal_apr * BPS_PER_UNIT
        effective_apy_bps = effective_apy * BPS_PER_UNIT
        return RateConversionResult(
            venue=HYPERLIQUID_VENUE,
            borrow_asset=TARGET_BORROW_ASSET,
            borrow_rate_raw=str(borrow_rate_raw),
            raw_rate_field="borrowYearlyRate",
            annualization_convention=annualization_convention,
            effective_apy=f"{effective_apy:.10f}",
            nominal_apr=f"{nominal_apr:.10f}",
            nominal_apr_bps=f"{nominal_apr_bps:.6f}",
            effective_apy_bps=f"{effective_apy_bps:.6f}",
            hourly_accrual_rate=f"{hourly_accrual:.12f}",
            conversion_method="exact_decimal_ln_1_plus_effective_apy_continuous",
            conversion_evidence=(
                "Hyperliquid Portfolio Margin docs: stablecoin borrow rate is "
                "'0.05 + 4.75 * max(0, utilization - 0.8) APY' compounded continuously, indexed hourly."
            ),
            conversion_status=CONVERSION_STATUS_VERIFIED,
        )

    return RateConversionResult(
        venue=HYPERLIQUID_VENUE,
        borrow_asset=TARGET_BORROW_ASSET,
        borrow_rate_raw=str(borrow_rate_raw),
        raw_rate_field="borrowYearlyRate",
        annualization_convention=annualization_convention,
        effective_apy=None,
        nominal_apr=None,
        nominal_apr_bps=None,
        effective_apy_bps=None,
        hourly_accrual_rate=None,
        conversion_method="unsupported_or_unverified_convention",
        conversion_evidence="No verified documentation supporting rate conversion for this convention.",
        conversion_status=CONVERSION_STATUS_NOT_VERIFIED,
    )


def validate_borrow_rate_causal_timestamps(
    *,
    local_request_time_utc: datetime,
    local_capture_time_utc: datetime,
    strategy_evaluation_time_utc: datetime,
    http_response_date_utc: str | None = None,
    market_rate_event_time_utc: str | None = None,
    exchange_publication_time_utc: str | None = None,
    max_staleness_seconds: float = DEFAULT_MAX_QUOTE_STALENESS_SECONDS,
    max_future_skew_seconds: float = DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS,
    require_exchange_publication_timestamp: bool = False,
) -> BorrowRateCausalTimestamps:
    """Validate causal ordering and freshness without inventing missing venue publication timestamps."""
    req_dt = ensure_utc(local_request_time_utc, "local_request_time_utc")
    cap_dt = ensure_utc(local_capture_time_utc, "local_capture_time_utc")
    eval_dt = ensure_utc(strategy_evaluation_time_utc, "strategy_evaluation_time_utc")

    reasons: list[str] = []
    if cap_dt < req_dt:
        reasons.append(
            f"local_capture_before_request ({format_utc_iso(cap_dt)} < {format_utc_iso(req_dt)})"
        )
    if cap_dt > eval_dt:
        reasons.append(
            f"borrow_rate_captured_after_evaluation_time "
            f"(capture={format_utc_iso(cap_dt)} > eval={format_utc_iso(eval_dt)})"
        )
    capture_age_s = (eval_dt - cap_dt).total_seconds()
    if capture_age_s > max_staleness_seconds:
        reasons.append(
            f"stale_borrow_rate_observation (age={capture_age_s:.3f}s > max={max_staleness_seconds}s)"
        )

    parsed_http_date: str | None = None
    if http_response_date_utc is not None:
        try:
            http_dt = parse_utc_iso(http_response_date_utc, "http_response_date_utc")
            parsed_http_date = format_utc_iso(http_dt)
            # HTTP Date header has 1-second resolution; reject material clock skew or stale cache.
            ahead_s = (http_dt - cap_dt).total_seconds()
            if ahead_s > max_future_skew_seconds:
                reasons.append(
                    f"clock_skew_http_date_ahead_of_local ({ahead_s:.3f}s > {max_future_skew_seconds}s)"
                )
            behind_s = (req_dt - http_dt).total_seconds()
            if behind_s > max_staleness_seconds:
                reasons.append(
                    f"stale_http_response_date (age={behind_s:.3f}s > max={max_staleness_seconds}s)"
                )
            eval_http_age = (eval_dt - http_dt).total_seconds()
            if eval_http_age > max_staleness_seconds:
                reasons.append(
                    f"stale_http_date_at_evaluation (age={eval_http_age:.3f}s > max={max_staleness_seconds}s)"
                )
        except ValueError as exc:
            reasons.append(f"invalid_http_response_date_utc ({exc})")

    if reasons:
        status = CAUSAL_STATUS_VIOLATION
    elif exchange_publication_time_utc is None and require_exchange_publication_timestamp:
        status = CAUSAL_STATUS_BLOCKED_PROVENANCE
        reasons.append("missing_exchange_publication_timestamp_required_by_policy")
    elif exchange_publication_time_utc is None:
        status = CAUSAL_STATUS_LOCAL_BOUNDED_NO_PUB_TS
    else:
        try:
            pub_dt = parse_utc_iso(exchange_publication_time_utc, "exchange_publication_time_utc")
        except ValueError as exc:
            status = CAUSAL_STATUS_VIOLATION
            reasons.append(f"invalid_exchange_publication_time_utc ({exc})")
        else:
            if pub_dt > eval_dt:
                status = CAUSAL_STATUS_VIOLATION
                reasons.append("exchange_publication_after_evaluation_time")
            elif (pub_dt - cap_dt).total_seconds() > max_future_skew_seconds:
                status = CAUSAL_STATUS_VIOLATION
                reasons.append("exchange_publication_ahead_of_local_capture")
            elif (eval_dt - pub_dt).total_seconds() > max_staleness_seconds:
                status = CAUSAL_STATUS_VIOLATION
                reasons.append("stale_exchange_publication_timestamp")
            else:
                status = "EXCHANGE_PUBLISHED_CAUSAL_VALID"

    return BorrowRateCausalTimestamps(
        market_rate_event_time_utc=market_rate_event_time_utc,
        exchange_publication_time_utc=exchange_publication_time_utc,
        http_response_date_utc=parsed_http_date,
        local_request_time_utc=format_utc_iso(req_dt),
        local_capture_time_utc=format_utc_iso(cap_dt),
        strategy_evaluation_time_utc=format_utc_iso(eval_dt),
        causal_validity_status=status,
        causal_reasons=reasons,
    )


def build_borrow_rate_observation_from_envelopes(
    *,
    spot_meta_envelope: RawCaptureEnvelope,
    reserve_envelope: RawCaptureEnvelope,
    evaluation_time_utc: datetime,
    annualization_convention: str = RATE_CONVENTION_DOCUMENTED_CONTINUOUS_APY,
    max_staleness_seconds: float = DEFAULT_MAX_QUOTE_STALENESS_SECONDS,
    max_future_skew_seconds: float = DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS,
    require_exchange_publication_timestamp: bool = False,
) -> HyperliquidBorrowRateObservation:
    """Parse, validate, convert, and assemble normalized borrow-rate provenance from raw envelopes."""
    spot_meta_payload = _parse_json_bytes(spot_meta_envelope)
    reserves_payload = _parse_json_bytes(reserve_envelope)

    token_res = resolve_usdc_token(
        spot_meta_payload,
        spot_meta_sha256=spot_meta_envelope.raw_sha256,
    )
    reserve_decimals = extract_usdc_reserve_state(reserves_payload, token_res)
    util_check = validate_utilization_consistency(reserve_decimals)
    conversion = classify_and_convert_rate(
        reserve_decimals["borrowYearlyRate"],
        annualization_convention=annualization_convention,
    )

    req_dt = parse_utc_iso(
        reserve_envelope.requested_at_utc or reserve_envelope.captured_at_utc,
        "reserve_envelope.requested_at_utc",
    )
    cap_dt = parse_utc_iso(reserve_envelope.captured_at_utc, "reserve_envelope.captured_at_utc")
    causal = validate_borrow_rate_causal_timestamps(
        local_request_time_utc=req_dt,
        local_capture_time_utc=cap_dt,
        strategy_evaluation_time_utc=evaluation_time_utc,
        http_response_date_utc=reserve_envelope.http_date_utc,
        market_rate_event_time_utc=None,
        exchange_publication_time_utc=None,
        max_staleness_seconds=max_staleness_seconds,
        max_future_skew_seconds=max_future_skew_seconds,
        require_exchange_publication_timestamp=require_exchange_publication_timestamp,
    )

    failure_reasons: list[str] = []
    if not util_check.consistent:
        failure_reasons.extend(util_check.discrepancy_reasons)
    if conversion.conversion_status != CONVERSION_STATUS_VERIFIED or conversion.nominal_apr_bps is None:
        failure_reasons.append(f"rate_conversion_unverified ({conversion.conversion_status})")
    if causal.causal_validity_status in {CAUSAL_STATUS_VIOLATION, CAUSAL_STATUS_BLOCKED_PROVENANCE}:
        failure_reasons.extend(causal.causal_reasons)

    eligible = len(failure_reasons) == 0
    borrow_apr_bps = conversion.nominal_apr_bps if eligible else None
    borrow_source = BORROW_RATE_SOURCE_PUBLIC_READ_ONLY if eligible else BORROW_RATE_STATUS_INVALID

    capital_economics = {
        "venue_observed_borrow_apr_bps": borrow_apr_bps,
        "venue_observed_effective_apy_bps": conversion.effective_apy_bps,
        "frozen_v2_financing_hurdle_role": "CONSERVATIVE_VENUE_BORROW_HURDLE",
        "hypothetical_borrowed_principal_note": (
            "At 1.0x gross leverage with owned cash, actual venue loan principal may be 0; "
            "frozen V2 retains venue borrow APR as a conservative hurdle rather than cash opportunity cost."
        ),
        "cash_opportunity_cost_distinct_from_venue_borrow": True,
        "portfolio_margin_eligibility_caveats": [
            "Hyperliquid Portfolio Margin requires >$5M weighted volume or >$10k account value (<$25M cap).",
            "Collateral LTV is non-zero only for eligible collateral assets (e.g. HYPE, UBTC), not USDC itself (ltv=0).",
        ],
    }

    body_for_hash = {
        "venue": HYPERLIQUID_VENUE,
        "borrow_asset": TARGET_BORROW_ASSET,
        "token_resolution": token_res.to_dict(),
        "rate_conversion": conversion.to_dict(),
        "utilization_check": util_check.to_dict(),
        "causal_timestamps": causal.to_dict(),
        "borrow_apr_bps": borrow_apr_bps,
        "borrow_rate_source": borrow_source,
        "source_authenticity_status": SOURCE_AUTHENTICITY_UNVERIFIED_HTTP,
        "causal_validity_status": causal.causal_validity_status,
        "eligible_for_borrow_input": eligible,
        "failure_reasons": failure_reasons,
        "source_endpoint": HYPERLIQUID_INFO_URL,
        "requested_query_types": ["spotMeta", "allBorrowLendReserveStates"],
        "raw_reserve_sha256": reserve_envelope.raw_sha256,
        "raw_spot_meta_sha256": spot_meta_envelope.raw_sha256,
        "capital_economics_metadata": capital_economics,
    }
    norm_sha = _canonical_sha256(body_for_hash)
    obs_id = f"hl_usdc_borrow_{reserve_envelope.raw_sha256[:12]}_{spot_meta_envelope.raw_sha256[:8]}"

    return HyperliquidBorrowRateObservation(
        observation_id=obs_id,
        normalized_sha256=norm_sha,
        **body_for_hash,
    )


def verify_saved_raw_borrow_evidence(
    *,
    raw_spot_meta_bytes: bytes,
    raw_reserve_bytes: bytes,
    expected_spot_meta_sha256: str,
    expected_reserve_sha256: str,
    recorded_observation: Mapping[str, Any],
    numeric_tolerance: Decimal = Decimal("0.0001"),
) -> tuple[bool, list[str]]:
    """Independently verify saved raw HTTP bytes against a recorded borrow-rate observation."""
    errors: list[str] = []
    actual_meta_sha = hashlib.sha256(raw_spot_meta_bytes).hexdigest()
    actual_res_sha = hashlib.sha256(raw_reserve_bytes).hexdigest()
    if actual_meta_sha != expected_spot_meta_sha256:
        errors.append("saved_spot_meta_sha256_mismatch")
    if actual_res_sha != expected_reserve_sha256:
        errors.append("saved_reserve_sha256_mismatch")
    rec_meta_sha = recorded_observation.get("raw_spot_meta_sha256")
    if rec_meta_sha is not None and rec_meta_sha != actual_meta_sha:
        errors.append("recorded_spot_meta_sha256_mismatch")
    rec_res_sha = recorded_observation.get("raw_reserve_sha256")
    if rec_res_sha is not None and rec_res_sha != actual_res_sha:
        errors.append("recorded_reserve_sha256_mismatch")
    rec_norm_sha = recorded_observation.get("normalized_sha256")
    if isinstance(rec_norm_sha, str) and rec_norm_sha:
        body_without_sha = {
            k: v
            for k, v in recorded_observation.items()
            if k not in {"normalized_sha256", "observation_id"}
        }
        if _canonical_sha256(body_without_sha) != rec_norm_sha:
            errors.append("recorded_normalized_sha256_mismatch")
    if errors:
        return False, errors

    try:
        meta_payload = json.loads(raw_spot_meta_bytes.decode("utf-8"))
        res_payload = json.loads(raw_reserve_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return False, [f"corrupted_saved_raw_json ({exc})"]

    try:
        token_res = resolve_usdc_token(meta_payload, spot_meta_sha256=actual_meta_sha)
        reserve_dec = extract_usdc_reserve_state(res_payload, token_res)
    except DataQualityError as exc:
        return False, [f"saved_raw_validation_failed ({exc})"]

    recorded_tok = recorded_observation.get("token_resolution") or {}
    if recorded_tok.get("token_index") != token_res.token_index:
        errors.append(
            f"mismatched_saved_token_index "
            f"(recorded={recorded_tok.get('token_index')}, actual={token_res.token_index})"
        )

    recorded_conv = recorded_observation.get("rate_conversion") or {}
    convention = str(recorded_conv.get("annualization_convention", RATE_CONVENTION_NOT_VERIFIED))
    recomputed_conv = classify_and_convert_rate(
        reserve_dec["borrowYearlyRate"],
        annualization_convention=convention,
    )
    if str(recorded_conv.get("borrow_rate_raw")) != str(reserve_dec["borrowYearlyRate"]):
        errors.append("tampered_or_mismatched_borrow_rate_raw")

    is_recorded_eligible = recorded_observation.get("eligible_for_borrow_input") is True
    rec_bps = recorded_observation.get("borrow_apr_bps")
    if is_recorded_eligible and recomputed_conv.conversion_status != CONVERSION_STATUS_VERIFIED:
        errors.append("unverified_rate_convention_on_eligible_record")
    if is_recorded_eligible and rec_bps is None:
        errors.append("missing_borrow_apr_bps_on_eligible_record")

    if rec_bps is not None and recomputed_conv.nominal_apr_bps is not None:
        try:
            rec_bps_dec = _parse_strict_decimal(rec_bps, "recorded.borrow_apr_bps")
            recomputed_dec = _parse_strict_decimal(recomputed_conv.nominal_apr_bps, "recomputed.nominal_apr_bps")
        except DataQualityError as exc:
            errors.append(f"invalid_recorded_borrow_apr_bps ({exc})")
        else:
            diff = abs(rec_bps_dec - recomputed_dec)
            if diff > numeric_tolerance:
                errors.append(f"recomputed_borrow_apr_bps_mismatch (diff={diff})")
    elif (rec_bps is None) != (recomputed_conv.nominal_apr_bps is None):
        if is_recorded_eligible:
            errors.append("borrow_apr_bps_presence_mismatch_on_eligible_record")

    util_check = validate_utilization_consistency(reserve_dec)
    if is_recorded_eligible and not util_check.consistent:
        errors.append("saved_reserve_fails_utilization_consistency")

    return len(errors) == 0, errors


class HyperliquidBorrowRateAdapter:
    """Public read-only Hyperliquid USDC borrow-rate adapter using hardened HTTP client."""

    INFO_URL = HYPERLIQUID_INFO_URL

    def __init__(
        self,
        client: PublicReadOnlyHttpClient,
        *,
        clock_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        annualization_convention: str = RATE_CONVENTION_DOCUMENTED_CONTINUOUS_APY,
        max_staleness_seconds: float = DEFAULT_MAX_QUOTE_STALENESS_SECONDS,
        max_future_skew_seconds: float = DEFAULT_MAX_FUTURE_CLOCK_SKEW_SECONDS,
        require_exchange_publication_timestamp: bool = False,
    ) -> None:
        self._client = client
        self._clock_fn = clock_fn
        self._annualization_convention = annualization_convention
        self._max_staleness_seconds = max_staleness_seconds
        self._max_future_skew_seconds = max_future_skew_seconds
        self._require_exchange_publication_timestamp = require_exchange_publication_timestamp

    def fetch_spot_meta(self) -> RawCaptureEnvelope:
        return self._client.fetch(
            venue="hyperliquid",
            method="POST",
            url=self.INFO_URL,
            json_body={"type": "spotMeta"},
        )

    def fetch_reserve_states(self) -> RawCaptureEnvelope:
        return self._client.fetch(
            venue="hyperliquid",
            method="POST",
            url=self.INFO_URL,
            json_body={"type": "allBorrowLendReserveStates"},
        )

    def capture_usdc_borrow_rate(
        self,
        *,
        evaluation_time_utc: datetime | None = None,
    ) -> tuple[HyperliquidBorrowRateObservation, list[RawCaptureEnvelope]]:
        """Fetch spotMeta + allBorrowLendReserveStates and produce normalized provenance evidence."""
        spot_meta_env = self.fetch_spot_meta()
        reserve_env = self.fetch_reserve_states()
        eval_dt = (
            ensure_utc(evaluation_time_utc, "evaluation_time_utc")
            if evaluation_time_utc is not None
            else self._clock_fn().astimezone(timezone.utc)
        )
        obs = build_borrow_rate_observation_from_envelopes(
            spot_meta_envelope=spot_meta_env,
            reserve_envelope=reserve_env,
            evaluation_time_utc=eval_dt,
            annualization_convention=self._annualization_convention,
            max_staleness_seconds=self._max_staleness_seconds,
            max_future_skew_seconds=self._max_future_skew_seconds,
            require_exchange_publication_timestamp=self._require_exchange_publication_timestamp,
        )
        return obs, [spot_meta_env, reserve_env]
