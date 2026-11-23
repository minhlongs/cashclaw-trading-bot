"""40-scenario deterministic adversarial test suite for Hyperliquid public borrow-rate adapter.

Covers:
- Official Hyperliquid public read-only API contract (spotMeta + allBorrowLendReserveStates)
- Dynamic USDC token resolution & anti-substitution invariants
- Exact Decimal arithmetic, rate convention verification, & utilization formula consistency
- HTTP security & resilience (HTTPS-only, host/type allowlist, redirect SSRF, credential block, size cap, 429)
- Causal timing & provenance (no invented venue timestamps, no future leakage, no stale/retroactive reuse)
- Passive collector integration, Binance strict isolation, & zero cross-venue contamination
- Append-only evidence ledger crash safety, WAL recovery, tamper detection, & verify-only replay idempotency
- Zero order-capable imports & immutable anchor preservation
"""

from __future__ import annotations

import ast
import hashlib
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Mapping
from unittest.mock import patch

import pytest

from verification_lab.oos.adapters import (
    AdapterError,
    BinanceReadOnlyAdapter,
    DataQualityError,
    HttpResponseData,
    HyperliquidReadOnlyAdapter,
    NormalizedMarketObservation,
    PublicReadOnlyHttpClient,
    RateLimitExhaustedError,
    RawCaptureEnvelope,
    SOURCE_AUTHENTICITY_UNVERIFIED_HTTP,
    UnauthorizedEndpointError,
)
from verification_lab.oos.evidence_store import (
    AppendOnlyEvidenceStore,
    DuplicateRecordError,
    PartialWriteRecoveryError,
)
from verification_lab.oos.frozen_evaluator import (
    EXPECTED_FROZEN_SPEC_SHA256,
    EXPECTED_REGISTRATION_SHA256,
    load_verified_frozen_v2_spec,
)
from verification_lab.oos.hyperliquid_borrow_rate import (
    BORROW_RATE_SOURCE_PUBLIC_READ_ONLY,
    BORROW_RATE_STATUS_INVALID,
    CAUSAL_STATUS_BLOCKED_PROVENANCE,
    CAUSAL_STATUS_LOCAL_BOUNDED_NO_PUB_TS,
    CAUSAL_STATUS_VIOLATION,
    CONVERSION_STATUS_NOT_VERIFIED,
    CONVERSION_STATUS_VERIFIED,
    HYPERLIQUID_INFO_URL,
    HyperliquidBorrowRateAdapter,
    RATE_CONVENTION_DOCUMENTED_CONTINUOUS_APY,
    RATE_CONVENTION_NOT_VERIFIED,
    build_borrow_rate_observation_from_envelopes,
    classify_and_convert_rate,
    extract_usdc_reserve_state,
    resolve_usdc_token,
    validate_borrow_rate_causal_timestamps,
    validate_utilization_consistency,
    verify_saved_raw_borrow_evidence,
)
from verification_lab.oos.offline_replay import run_independent_offline_replay
from verification_lab.oos.pipeline import (
    BORROW_SOURCE_MANUAL_ASSUMPTION,
    BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    evaluate_store_prospective_clock,
    record_passive_observation,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRATION_PATH = REPO_ROOT / "artifacts" / "h3_basis_carry_v2_prospective_oos_registration.json"
ERRATUM_PATH = REPO_ROOT / "artifacts" / "h3_basis_carry_v2_evidence_erratum_v1.json"
CONTRACT_PATH = REPO_ROOT / "artifacts" / "h3_basis_carry_v2_prospective_observation_contract.json"

EXPECTED_ERRATUM_SHA256 = "9dd9def3271d756dca30bdfae044befb96059d7d94f10d97f0d527fb7a577a01"
EXPECTED_CONTRACT_SHA256 = "6c2e67d3ed0049a175a97c493a362272516b6b644fa0e1d0f04f4993bc2cfc21"


def _make_spot_meta(usdc_index: int = 0, extra_tokens: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    tokens: list[dict[str, Any]] = [
        {
            "name": "USDC",
            "szDecimals": 8,
            "weiDecimals": 8,
            "index": usdc_index,
            "tokenId": "0x00000000000000000000000000000001",
            "isCanonical": True,
        },
        {
            "name": "USDH",
            "szDecimals": 8,
            "weiDecimals": 8,
            "index": 360 if usdc_index != 360 else 361,
            "tokenId": "0x22222222222222222222222222222222",
            "isCanonical": True,
        },
    ]
    if extra_tokens:
        tokens.extend(extra_tokens)
    return {"tokens": tokens, "universe": []}


def _make_reserve_state(
    *,
    borrow_yearly_rate: str = "0.05",
    supply_yearly_rate: str = "0.0259134723",
    utilization: str = "0.5758549404",
    total_supplied: str = "620840038.8991656303",
    total_borrowed: str = "357513803.5693222284",
    balance: str = "263326361.4221327305",
    oracle_px: str = "1.0",
    ltv: str = "0.0",
) -> dict[str, Any]:
    return {
        "borrowYearlyRate": borrow_yearly_rate,
        "supplyYearlyRate": supply_yearly_rate,
        "balance": balance,
        "utilization": utilization,
        "oraclePx": oracle_px,
        "ltv": ltv,
        "totalSupplied": total_supplied,
        "totalBorrowed": total_borrowed,
    }


def _make_envelopes(
    spot_meta: Any,
    reserves: Any,
    *,
    req_iso: str = "2026-11-24T00:05:00Z",
    cap_iso: str = "2026-11-24T00:05:01Z",
    http_date_iso: str | None = "2026-11-24T00:05:01Z",
) -> tuple[RawCaptureEnvelope, RawCaptureEnvelope]:
    meta_bytes = json.dumps(spot_meta).encode("utf-8")
    res_bytes = json.dumps(reserves).encode("utf-8")
    meta_env = RawCaptureEnvelope(
        raw_source_id="hyperliquid:/info:meta",
        venue="hyperliquid",
        endpoint_url=HYPERLIQUID_INFO_URL,
        method="POST",
        request_params={"type": "spotMeta"},
        http_status=200,
        raw_bytes=meta_bytes,
        raw_sha256=hashlib.sha256(meta_bytes).hexdigest(),
        captured_at_utc=cap_iso,
        requested_at_utc=req_iso,
        http_date_utc=http_date_iso,
    )
    res_env = RawCaptureEnvelope(
        raw_source_id="hyperliquid:/info:reserves",
        venue="hyperliquid",
        endpoint_url=HYPERLIQUID_INFO_URL,
        method="POST",
        request_params={"type": "allBorrowLendReserveStates"},
        http_status=200,
        raw_bytes=res_bytes,
        raw_sha256=hashlib.sha256(res_bytes).hexdigest(),
        captured_at_utc=cap_iso,
        requested_at_utc=req_iso,
        http_date_utc=http_date_iso,
    )
    return meta_env, res_env


def _make_mock_hl_transport(
    *,
    spot_meta: Any,
    reserves: Any,
    eval_dt: datetime,
    http_date_hdr: str = "Tue, 24 Nov 2026 00:05:01 GMT",
):
    book_ms = int((eval_dt - timedelta(seconds=2)).timestamp() * 1000)
    funding_ms = int((eval_dt - timedelta(minutes=5)).timestamp() * 1000)

    def transport(
        method: str,
        url: str,
        params: Mapping[str, Any] | None,
        json_body: Mapping[str, Any] | None,
        headers: Mapping[str, str],
        timeout_s: float,
    ) -> HttpResponseData:
        qtype = (json_body or {}).get("type")
        hdrs = {"Date": http_date_hdr}
        if qtype == "spotMeta":
            return HttpResponseData(200, json.dumps(spot_meta).encode("utf-8"), hdrs)
        if qtype == "allBorrowLendReserveStates":
            return HttpResponseData(200, json.dumps(reserves).encode("utf-8"), hdrs)
        if qtype == "metaAndAssetCtxs":
            payload = [
                {"universe": [{"name": "BTC"}]},
                [{"oraclePx": "90000.00", "markPx": "90090.00", "openInterest": "1234", "dayNtlVlm": "999999"}],
            ]
            return HttpResponseData(200, json.dumps(payload).encode("utf-8"), hdrs)
        if qtype == "l2Book":
            payload = {
                "coin": "BTC",
                "time": book_ms,
                "levels": [[{"px": "90085.0", "sz": "2.5"}], [{"px": "90095.0", "sz": "2.5"}]],
            }
            return HttpResponseData(200, json.dumps(payload).encode("utf-8"), hdrs)
        if qtype == "fundingHistory":
            payload = [{"coin": "BTC", "time": funding_ms, "fundingRate": "0.00025"}]
            return HttpResponseData(200, json.dumps(payload).encode("utf-8"), hdrs)
        raise AssertionError(f"Unexpected query type: {qtype}")

    return transport


# --- Scenarios 1-7: Token resolution & dynamic mapping ---


def test_01_valid_hyperliquid_usdc_reserve_capture() -> None:
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    transport = _make_mock_hl_transport(
        spot_meta=_make_spot_meta(0),
        reserves=[[0, _make_reserve_state()]],
        eval_dt=eval_dt,
    )
    client = PublicReadOnlyHttpClient(transport=transport, clock_fn=lambda: eval_dt)
    adapter = HyperliquidBorrowRateAdapter(client, clock_fn=lambda: eval_dt)
    obs, envs = adapter.capture_usdc_borrow_rate(evaluation_time_utc=eval_dt)

    assert len(envs) == 2
    assert obs.eligible_for_borrow_input is True
    assert obs.borrow_rate_source == BORROW_RATE_SOURCE_PUBLIC_READ_ONLY
    assert obs.source_authenticity_status == SOURCE_AUTHENTICITY_UNVERIFIED_HTTP
    assert obs.causal_validity_status == CAUSAL_STATUS_LOCAL_BOUNDED_NO_PUB_TS
    assert obs.rate_conversion["borrow_rate_raw"] == "0.05"
    assert obs.rate_conversion["conversion_status"] == CONVERSION_STATUS_VERIFIED
    expected_bps = (Decimal("1.05").ln()) * Decimal("10000")
    assert abs(Decimal(obs.borrow_apr_bps) - expected_bps) < Decimal("0.00001")


def test_02_dynamic_usdc_token_resolution_nonzero_index() -> None:
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    meta_env, res_env = _make_envelopes(
        _make_spot_meta(usdc_index=7),
        [[0, _make_reserve_state(borrow_yearly_rate="0.99")], [7, _make_reserve_state(borrow_yearly_rate="0.05")]],
    )
    obs = build_borrow_rate_observation_from_envelopes(
        spot_meta_envelope=meta_env,
        reserve_envelope=res_env,
        evaluation_time_utc=eval_dt,
    )
    assert obs.eligible_for_borrow_input is True
    assert obs.token_resolution["token_index"] == 7
    assert obs.token_resolution["index_matches_historical_zero"] is False
    assert obs.rate_conversion["borrow_rate_raw"] == "0.05"


def test_03_missing_usdc_in_spot_meta_fails_closed() -> None:
    payload = {"tokens": [{"name": "USDH", "index": 0, "szDecimals": 8, "weiDecimals": 8}]}
    with pytest.raises(DataQualityError, match="missing_usdc_in_spot_meta"):
        resolve_usdc_token(payload, spot_meta_sha256="a" * 64)


def test_04_duplicate_usdc_in_spot_meta_fails_closed() -> None:
    payload = _make_spot_meta(
        0,
        extra_tokens=[{"name": "USDC", "index": 99, "szDecimals": 8, "weiDecimals": 8, "isCanonical": True}],
    )
    with pytest.raises(DataQualityError, match="ambiguous_duplicate_usdc_in_spot_meta"):
        resolve_usdc_token(payload, spot_meta_sha256="a" * 64)


def test_05_stablecoin_substitution_usdh_usdt_rejected() -> None:
    payload = {
        "tokens": [
            {"name": "USDT", "index": 0, "szDecimals": 8, "weiDecimals": 8, "isCanonical": True},
            {"name": "USDH", "index": 1, "szDecimals": 8, "weiDecimals": 8, "isCanonical": True},
        ]
    }
    with pytest.raises(DataQualityError, match="missing_usdc_in_spot_meta"):
        resolve_usdc_token(payload, spot_meta_sha256="a" * 64)


def test_06_duplicate_token_index_in_spot_meta_rejected() -> None:
    payload = {
        "tokens": [
            {"name": "USDC", "index": 0, "szDecimals": 8, "weiDecimals": 8},
            {"name": "USDH", "index": 0, "szDecimals": 8, "weiDecimals": 8},
        ]
    }
    with pytest.raises(DataQualityError, match="duplicate_token_index_in_spot_meta"):
        resolve_usdc_token(payload, spot_meta_sha256="a" * 64)


def test_07_non_canonical_or_conflicting_decimals_rejected() -> None:
    bad_canon = {"tokens": [{"name": "USDC", "index": 0, "isCanonical": False}]}
    with pytest.raises(DataQualityError, match="non_canonical_usdc_token_metadata"):
        resolve_usdc_token(bad_canon, spot_meta_sha256="a" * 64)

    bad_dec = {"tokens": [{"name": "USDC", "index": 0, "szDecimals": 10, "weiDecimals": 8}]}
    with pytest.raises(DataQualityError, match="conflicting_spot_meta_decimals"):
        resolve_usdc_token(bad_dec, spot_meta_sha256="a" * 64)


# --- Scenarios 8-15: Reserve schema & numeric validation ---


def test_08_empty_reserve_array_rejected() -> None:
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    with pytest.raises(DataQualityError, match="empty_or_malformed_borrow_lend_reserves"):
        extract_usdc_reserve_state([], tok)


def test_09_malformed_reserve_pair_rejected() -> None:
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    with pytest.raises(DataQualityError, match="malformed_reserve_pair_entry"):
        extract_usdc_reserve_state([[0]], tok)


def test_10_duplicate_token_id_in_reserves_rejected() -> None:
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    with pytest.raises(DataQualityError, match="duplicate_token_id_in_reserves"):
        extract_usdc_reserve_state([[0, _make_reserve_state()], [0, _make_reserve_state()]], tok)


def test_11_missing_usdc_reserve_state_rejected() -> None:
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    with pytest.raises(DataQualityError, match="missing_usdc_reserve_state"):
        extract_usdc_reserve_state([[360, _make_reserve_state()]], tok)


def test_12_missing_required_reserve_field_rejected() -> None:
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    st = _make_reserve_state()
    del st["borrowYearlyRate"]
    with pytest.raises(DataQualityError, match="missing_reserve_field"):
        extract_usdc_reserve_state([[0, st]], tok)


@pytest.mark.parametrize("bad_val", ["NaN", "Infinity", "-Infinity", "", None, True, 0.05])
def test_13_non_finite_and_binary_float_values_rejected(bad_val: Any) -> None:
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    st = _make_reserve_state(borrow_yearly_rate=bad_val)
    with pytest.raises(DataQualityError):
        extract_usdc_reserve_state([[0, st]], tok)


def test_14_negative_and_excessive_borrow_rate_rejected() -> None:
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    with pytest.raises(DataQualityError, match="negative_borrow_yearly_rate"):
        extract_usdc_reserve_state([[0, _make_reserve_state(borrow_yearly_rate="-0.01")]], tok)
    with pytest.raises(DataQualityError, match="excessive_borrow_yearly_rate"):
        extract_usdc_reserve_state([[0, _make_reserve_state(borrow_yearly_rate="100.1")]], tok)


def test_15_invalid_utilization_supply_borrow_oracle_ltv_rejected() -> None:
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    with pytest.raises(DataQualityError, match="invalid_utilization_range"):
        extract_usdc_reserve_state([[0, _make_reserve_state(utilization="1.05")]], tok)
    with pytest.raises(DataQualityError, match="zero_or_negative_total_supplied"):
        extract_usdc_reserve_state([[0, _make_reserve_state(total_supplied="0")]], tok)
    with pytest.raises(DataQualityError, match="total_borrowed_exceeds_total_supplied"):
        extract_usdc_reserve_state(
            [[0, _make_reserve_state(total_supplied="100", total_borrowed="101")]], tok
        )
    with pytest.raises(DataQualityError, match="non_positive_reserve_oracle_px"):
        extract_usdc_reserve_state([[0, _make_reserve_state(oracle_px="0")]], tok)
    with pytest.raises(DataQualityError, match="invalid_reserve_ltv"):
        extract_usdc_reserve_state([[0, _make_reserve_state(ltv="1.2")]], tok)


# --- Scenarios 16-22: Utilization consistency, rate conversion, & capital economics ---


def test_16_formula_and_observed_rate_mismatch_fails_closed() -> None:
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    # At u=0.90, documented formula = 0.05 + 4.75 * 0.10 = 0.525, but observed is 0.05
    st = _make_reserve_state(
        borrow_yearly_rate="0.05",
        utilization="0.90",
        total_supplied="1000000",
        total_borrowed="900000",
        balance="100000",
    )
    meta_env, res_env = _make_envelopes(_make_spot_meta(0), [[0, st]])
    obs = build_borrow_rate_observation_from_envelopes(
        spot_meta_envelope=meta_env,
        reserve_envelope=res_env,
        evaluation_time_utc=eval_dt,
    )
    assert obs.eligible_for_borrow_input is False
    assert obs.borrow_apr_bps is None
    assert obs.borrow_rate_source == BORROW_RATE_STATUS_INVALID
    assert any("formula_and_observed_rate_disagree" in r for r in obs.failure_reasons)


def test_17_above_kink_utilization_formula_exact_match() -> None:
    st = _make_reserve_state(
        borrow_yearly_rate="0.525",
        utilization="0.90",
        total_supplied="1000000",
        total_borrowed="900000",
        balance="100000",
    )
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    dec = extract_usdc_reserve_state([[0, st]], tok)
    check = validate_utilization_consistency(dec)
    assert check.consistent is True
    conv = classify_and_convert_rate(dec["borrowYearlyRate"])
    assert conv.conversion_status == CONVERSION_STATUS_VERIFIED
    assert abs(Decimal(conv.nominal_apr) - Decimal("1.525").ln()) < Decimal("1e-9")


def test_18_reported_vs_computed_utilization_mismatch_fails_closed() -> None:
    st = _make_reserve_state(
        utilization="0.50",
        total_supplied="1000000",
        total_borrowed="700000",
        balance="300000",
    )
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    dec = extract_usdc_reserve_state([[0, st]], tok)
    check = validate_utilization_consistency(dec)
    assert check.consistent is False
    assert any("reported_and_computed_utilization_disagree" in r for r in check.discrepancy_reasons)


def test_19_reserve_balance_inconsistency_fails_closed() -> None:
    st = _make_reserve_state(
        utilization="0.50",
        total_supplied="1000000",
        total_borrowed="500000",
        balance="200000",  # should be ~500000
    )
    tok = resolve_usdc_token(_make_spot_meta(0), spot_meta_sha256="a" * 64)
    dec = extract_usdc_reserve_state([[0, st]], tok)
    check = validate_utilization_consistency(dec)
    assert check.consistent is False
    assert any("inconsistent_reserve_balance" in r for r in check.discrepancy_reasons)


def test_20_exact_decimal_precision_zero_float_drift() -> None:
    conv = classify_and_convert_rate(Decimal("0.05"))
    assert conv.borrow_rate_raw == "0.05"
    assert conv.effective_apy == "0.0500000000"
    assert conv.effective_apy_bps == "500.000000"
    expected_apr = Decimal("1.05").ln()
    assert abs(Decimal(conv.nominal_apr) - expected_apr) < Decimal("1e-10")
    assert abs(Decimal(conv.hourly_accrual_rate) - (expected_apr / Decimal("8760"))) < Decimal("1e-12")


def test_21_unverified_rate_convention_fails_closed() -> None:
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    meta_env, res_env = _make_envelopes(_make_spot_meta(0), [[0, _make_reserve_state()]])
    obs = build_borrow_rate_observation_from_envelopes(
        spot_meta_envelope=meta_env,
        reserve_envelope=res_env,
        evaluation_time_utc=eval_dt,
        annualization_convention="UNKNOWN_CONVENTION",
    )
    assert obs.rate_conversion["conversion_status"] == CONVERSION_STATUS_NOT_VERIFIED
    assert obs.rate_conversion["nominal_apr"] is None
    assert obs.borrow_apr_bps is None
    assert obs.eligible_for_borrow_input is False
    assert obs.borrow_rate_source == BORROW_RATE_STATUS_INVALID


def test_22_capital_economics_separation_metadata_preserved() -> None:
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    meta_env, res_env = _make_envelopes(_make_spot_meta(0), [[0, _make_reserve_state()]])
    obs = build_borrow_rate_observation_from_envelopes(
        spot_meta_envelope=meta_env,
        reserve_envelope=res_env,
        evaluation_time_utc=eval_dt,
    )
    econ = obs.capital_economics_metadata
    assert econ["cash_opportunity_cost_distinct_from_venue_borrow"] is True
    assert econ["frozen_v2_financing_hurdle_role"] == "CONSERVATIVE_VENUE_BORROW_HURDLE"
    assert len(econ["portfolio_margin_eligibility_caveats"]) >= 2


# --- Scenarios 23-29: HTTP security & resilience ---


def test_23_http_non_https_rejected() -> None:
    client = PublicReadOnlyHttpClient(transport=lambda *a: HttpResponseData(200, b"{}", {}))
    with pytest.raises(UnauthorizedEndpointError, match="non_https_endpoint_forbidden"):
        client.fetch(
            venue="hyperliquid",
            method="POST",
            url="http://api.hyperliquid.xyz/info",
            json_body={"type": "allBorrowLendReserveStates"},
        )


def test_24_http_dns_host_substitution_rejected() -> None:
    client = PublicReadOnlyHttpClient(transport=lambda *a: HttpResponseData(200, b"{}", {}))
    with pytest.raises(UnauthorizedEndpointError, match="endpoint_not_in_public_read_only_allowlist"):
        client.fetch(
            venue="hyperliquid",
            method="POST",
            url="https://evil.hyperliquid.xyz/info",
            json_body={"type": "allBorrowLendReserveStates"},
        )


def test_25_http_redirect_ssrf_rejected() -> None:
    client = PublicReadOnlyHttpClient(
        transport=lambda *a: HttpResponseData(302, b"", {"Location": "https://169.254.169.254/latest/meta-data"})
    )
    with pytest.raises(UnauthorizedEndpointError, match="http_redirect_rejected"):
        client.fetch(
            venue="hyperliquid",
            method="POST",
            url=HYPERLIQUID_INFO_URL,
            json_body={"type": "allBorrowLendReserveStates"},
        )


def test_26_http_non_allowlisted_post_type_rejected() -> None:
    client = PublicReadOnlyHttpClient(transport=lambda *a: HttpResponseData(200, b"{}", {}))
    for forbidden_type in ("order", "cancel", "clearinghouseState", "exchange"):
        with pytest.raises(UnauthorizedEndpointError, match="hyperliquid_post_type_not_read_only_allowlisted"):
            client.fetch(
                venue="hyperliquid",
                method="POST",
                url=HYPERLIQUID_INFO_URL,
                json_body={"type": forbidden_type},
            )


def test_27_http_credential_headers_rejected() -> None:
    client = PublicReadOnlyHttpClient(transport=lambda *a: HttpResponseData(200, b"{}", {}))
    for hdr in ("Authorization", "X-API-KEY", "X-MBX-APIKEY", "Cookie", "X-HL-Signature"):
        with pytest.raises(UnauthorizedEndpointError, match="credential_header_forbidden"):
            client.fetch(
                venue="hyperliquid",
                method="POST",
                url=HYPERLIQUID_INFO_URL,
                json_body={"type": "spotMeta"},
                headers={hdr: "secret-token"},
            )


def test_28_http_oversized_response_rejected() -> None:
    client = PublicReadOnlyHttpClient(
        transport=lambda *a: HttpResponseData(200, b"x" * 2048, {}),
        max_response_bytes=1024,
    )
    with pytest.raises(DataQualityError, match="oversized_response_body"):
        client.fetch(
            venue="hyperliquid",
            method="POST",
            url=HYPERLIQUID_INFO_URL,
            json_body={"type": "spotMeta"},
        )


def test_29_http_429_retry_after_and_5xx_fail_closed() -> None:
    sleeps: list[float] = []
    calls = {"n": 0}

    def flakey_429(*args: Any) -> HttpResponseData:
        calls["n"] += 1
        if calls["n"] == 1:
            return HttpResponseData(429, b"rate limited", {"Retry-After": "1.5"})
        return HttpResponseData(200, b'{"tokens":[]}', {})

    client = PublicReadOnlyHttpClient(transport=flakey_429, sleep_fn=sleeps.append, max_retries=2)
    env = client.fetch(
        venue="hyperliquid",
        method="POST",
        url=HYPERLIQUID_INFO_URL,
        json_body={"type": "spotMeta"},
    )
    assert env.http_status == 200
    assert sleeps == [1.5]

    exhausted = PublicReadOnlyHttpClient(
        transport=lambda *a: HttpResponseData(429, b"", {"Retry-After": "0.1"}),
        sleep_fn=lambda _: None,
        max_retries=1,
    )
    with pytest.raises(RateLimitExhaustedError):
        exhausted.fetch(
            venue="hyperliquid",
            method="POST",
            url=HYPERLIQUID_INFO_URL,
            json_body={"type": "spotMeta"},
        )

    err_client = PublicReadOnlyHttpClient(
        transport=lambda *a: HttpResponseData(503, b"unavailable", {}),
        sleep_fn=lambda _: None,
        max_retries=1,
    )
    with pytest.raises(AdapterError, match="exchange_http_5xx"):
        err_client.fetch(
            venue="hyperliquid",
            method="POST",
            url=HYPERLIQUID_INFO_URL,
            json_body={"type": "spotMeta"},
        )


# --- Scenarios 30-33: Causal timestamps & provenance ---


def test_30_missing_venue_publication_timestamp_never_invented_and_blocked_when_required() -> None:
    t_req = datetime(2026, 11, 24, 0, 5, 0, tzinfo=timezone.utc)
    t_cap = datetime(2026, 11, 24, 0, 5, 1, tzinfo=timezone.utc)
    t_eval = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)

    ts_default = validate_borrow_rate_causal_timestamps(
        local_request_time_utc=t_req,
        local_capture_time_utc=t_cap,
        strategy_evaluation_time_utc=t_eval,
        http_response_date_utc="2026-11-24T00:05:01Z",
    )
    assert ts_default.exchange_publication_time_utc is None
    assert ts_default.market_rate_event_time_utc is None
    assert ts_default.causal_validity_status == CAUSAL_STATUS_LOCAL_BOUNDED_NO_PUB_TS

    ts_strict = validate_borrow_rate_causal_timestamps(
        local_request_time_utc=t_req,
        local_capture_time_utc=t_cap,
        strategy_evaluation_time_utc=t_eval,
        http_response_date_utc="2026-11-24T00:05:01Z",
        require_exchange_publication_timestamp=True,
    )
    assert ts_strict.causal_validity_status == CAUSAL_STATUS_BLOCKED_PROVENANCE


def test_31_future_borrow_rate_after_evaluation_rejected() -> None:
    t_req = datetime(2026, 11, 24, 0, 5, 10, tzinfo=timezone.utc)
    t_cap = datetime(2026, 11, 24, 0, 5, 11, tzinfo=timezone.utc)
    t_eval = datetime(2026, 11, 24, 0, 5, 0, tzinfo=timezone.utc)
    ts = validate_borrow_rate_causal_timestamps(
        local_request_time_utc=t_req,
        local_capture_time_utc=t_cap,
        strategy_evaluation_time_utc=t_eval,
    )
    assert ts.causal_validity_status == CAUSAL_STATUS_VIOLATION
    assert any("borrow_rate_captured_after_evaluation_time" in r for r in ts.causal_reasons)


def test_32_stale_borrow_rate_and_stale_http_date_rejected() -> None:
    t_req = datetime(2026, 11, 24, 0, 0, 0, tzinfo=timezone.utc)
    t_cap = datetime(2026, 11, 24, 0, 0, 1, tzinfo=timezone.utc)
    t_eval = datetime(2026, 11, 24, 0, 15, 0, tzinfo=timezone.utc)  # 900s > 300s
    ts = validate_borrow_rate_causal_timestamps(
        local_request_time_utc=t_req,
        local_capture_time_utc=t_cap,
        strategy_evaluation_time_utc=t_eval,
        http_response_date_utc="2026-11-24T00:00:01Z",
    )
    assert ts.causal_validity_status == CAUSAL_STATUS_VIOLATION
    assert any("stale_borrow_rate_observation" in r for r in ts.causal_reasons)


def test_33_http_date_clock_skew_ahead_of_local_rejected() -> None:
    t_req = datetime(2026, 11, 24, 0, 5, 0, tzinfo=timezone.utc)
    t_cap = datetime(2026, 11, 24, 0, 5, 1, tzinfo=timezone.utc)
    t_eval = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    ts = validate_borrow_rate_causal_timestamps(
        local_request_time_utc=t_req,
        local_capture_time_utc=t_cap,
        strategy_evaluation_time_utc=t_eval,
        http_response_date_utc="2026-11-24T00:05:30Z",  # 29s ahead > 5s skew
    )
    assert ts.causal_validity_status == CAUSAL_STATUS_VIOLATION
    assert any("clock_skew_http_date_ahead_of_local" in r for r in ts.causal_reasons)


# --- Scenarios 34-36: Passive collector integration & Binance strict isolation ---


def test_34_pipeline_integration_hyperliquid_eligible_and_replay_verified(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    store = AppendOnlyEvidenceStore(tmp_path / "oos_store")
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)

    transport = _make_mock_hl_transport(
        spot_meta=_make_spot_meta(0),
        reserves=[[0, _make_reserve_state()]],
        eval_dt=eval_dt,
    )
    client = PublicReadOnlyHttpClient(transport=transport, clock_fn=lambda: eval_dt)
    hl = HyperliquidReadOnlyAdapter(client, clock_fn=lambda: eval_dt)
    obs, envelopes = hl.capture_market_observation(
        coin="BTC",
        funding_start_time_ms=int((eval_dt - timedelta(hours=24)).timestamp() * 1000),
        funding_end_time_ms=int(eval_dt.timestamp() * 1000),
        fetch_public_borrow_rate=True,
    )
    assert len(envelopes) == 5  # metaAndAssetCtxs, l2Book, fundingHistory, spotMeta, allBorrowLendReserveStates
    assert obs.borrow_apr_bps is not None

    history_30d = ["2190.0"] * 30
    rec = record_passive_observation(
        store=store,
        params=params,
        observation=obs,
        annualized_funding_bps_history=history_30d,
        raw_envelopes=envelopes,
        evaluation_time_utc=eval_dt,
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    )
    assert rec.eligibility_status == "ELIGIBLE"

    replay = run_independent_offline_replay(store=store, params=params)
    assert replay.passive_data_replay_verified is True
    assert replay.execution_parity_verified is False

    summary = evaluate_store_prospective_clock(store=store, params=params, as_of_utc=eval_dt)
    assert summary.eligible_observation_days == 1
    assert summary.completed_executed_paper_trades == 0
    assert summary.paper_forward_allowed is False
    assert summary.live_order_authority is False
    assert summary.g13_status == "UNTOUCHED"
    assert summary.g15_status == "HARD-LOCKED"


def test_35_invalid_and_manual_and_forged_borrow_rates_rejected(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)

    # (a) Invalid borrow rate (formula mismatch) fails closed and does not advance clock
    store_a = AppendOnlyEvidenceStore(tmp_path / "store_invalid")
    bad_reserve = _make_reserve_state(
        borrow_yearly_rate="0.05",
        utilization="0.90",
        total_supplied="1000000",
        total_borrowed="900000",
        balance="100000",
    )
    client_a = PublicReadOnlyHttpClient(
        transport=_make_mock_hl_transport(
            spot_meta=_make_spot_meta(0), reserves=[[0, bad_reserve]], eval_dt=eval_dt
        ),
        clock_fn=lambda: eval_dt,
    )
    obs_a, envs_a = HyperliquidReadOnlyAdapter(client_a, clock_fn=lambda: eval_dt).capture_market_observation(
        coin="BTC",
        funding_start_time_ms=int((eval_dt - timedelta(hours=24)).timestamp() * 1000),
        fetch_public_borrow_rate=True,
    )
    assert obs_a.borrow_apr_bps is None
    rec_a = record_passive_observation(
        store=store_a,
        params=params,
        observation=obs_a,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=envs_a,
        evaluation_time_utc=eval_dt,
        borrow_apr_source=BORROW_RATE_STATUS_INVALID,
    )
    assert rec_a.eligibility_status == "REJECTED"
    assert BORROW_RATE_STATUS_INVALID in rec_a.rejection_reasons
    assert evaluate_store_prospective_clock(store=store_a, params=params, as_of_utc=eval_dt).eligible_observation_days == 0
    # Independent replay MUST verify cleanly on legitimately rejected utilization-mismatch records (no store poisoning)
    replay_a = run_independent_offline_replay(store=store_a, params=params)
    assert replay_a.passive_data_replay_verified is True

    # (b) Manual rate assumption is rejected; forged VENUE_OBSERVED_PUBLIC_READ_ONLY without evidence is rejected
    store_b = AppendOnlyEvidenceStore(tmp_path / "store_manual")
    client_b = PublicReadOnlyHttpClient(
        transport=_make_mock_hl_transport(
            spot_meta=_make_spot_meta(0), reserves=[[0, _make_reserve_state()]], eval_dt=eval_dt
        ),
        clock_fn=lambda: eval_dt,
    )
    obs_b, envs_b = HyperliquidReadOnlyAdapter(client_b, clock_fn=lambda: eval_dt).capture_market_observation(
        coin="BTC",
        funding_start_time_ms=int((eval_dt - timedelta(hours=24)).timestamp() * 1000),
        borrow_apr_bps=Decimal("500.0"),
        fetch_public_borrow_rate=False,
    )
    rec_manual = record_passive_observation(
        store=store_b,
        params=params,
        observation=obs_b,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=envs_b,
        evaluation_time_utc=eval_dt,
        borrow_apr_source=BORROW_SOURCE_MANUAL_ASSUMPTION,
    )
    assert rec_manual.eligibility_status == "REJECTED"

    store_c = AppendOnlyEvidenceStore(tmp_path / "store_forged")
    rec_forged = record_passive_observation(
        store=store_c,
        params=params,
        observation=obs_b,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=envs_b,
        evaluation_time_utc=eval_dt,
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    )
    assert rec_forged.eligibility_status == "REJECTED"
    assert "unverified_rate_falsely_labeled_venue_observed_public_read_only" in rec_forged.rejection_reasons


def test_36_binance_isolation_and_zero_cross_venue_substitution(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)

    # Binance observation missing venue borrow APR fails closed with INELIGIBLE_MISSING_VENUE_BORROW_APR
    binance_obs_missing = NormalizedMarketObservation(
        venue="binance",
        instrument="BTC",
        spot_symbol="BTCUSDT",
        perp_symbol="BTCUSDT",
        observation_day_utc="2026-11-23",
        spot_price="90000.00000000",
        perp_price="90090.00000000",
        basis_bps="10.000000",
        funding_rate_interval="0.0002000000",
        funding_interval_hours=8,
        annualized_funding_bps="2190.000000",
        borrow_apr_bps=None,
        bid_price="90085.0",
        ask_price="90095.0",
        spread_bps="1.11",
        l1_bid_qty="1.0",
        l1_ask_qty="1.0",
        public_liquidity_metadata={},
        instrument_availability_status="AVAILABLE",
        causal_timestamps={
            "market_event_time_utc": "2026-11-24T00:00:00Z",
            "exchange_publication_time_utc": "2026-11-24T00:00:00Z",
            "local_capture_time_utc": "2026-11-24T00:05:00Z",
            "strategy_evaluation_time_utc": "2026-11-24T00:05:02Z",
        },
        data_completeness=1.0,
        source_request_ids=["binance:klines:abc"],
        source_response_hashes={"binance:klines:abc": "a" * 64},
        source_authenticity_status=SOURCE_AUTHENTICITY_UNVERIFIED_HTTP,
        warnings=["borrow_apr_bps_unavailable_public_endpoint"],
    )
    store_b1 = AppendOnlyEvidenceStore(tmp_path / "binance_missing")
    rec_b1 = record_passive_observation(
        store=store_b1,
        params=params,
        observation=binance_obs_missing,
        annualized_funding_bps_history=["2190.0"] * 30,
        evaluation_time_utc=eval_dt,
    )
    assert rec_b1.eligibility_status == "REJECTED"
    assert "INELIGIBLE_MISSING_VENUE_BORROW_APR" in rec_b1.rejection_reasons

    # Cross-venue substitution: passing Hyperliquid borrow rate observation to Binance MUST fail closed
    meta_env, res_env = _make_envelopes(_make_spot_meta(0), [[0, _make_reserve_state()]])
    hl_borrow = build_borrow_rate_observation_from_envelopes(
        spot_meta_envelope=meta_env,
        reserve_envelope=res_env,
        evaluation_time_utc=eval_dt,
    )
    binance_obs_injected = NormalizedMarketObservation(
        **{**binance_obs_missing.to_dict(), "borrow_apr_bps": hl_borrow.borrow_apr_bps}
    )
    store_b2 = AppendOnlyEvidenceStore(tmp_path / "binance_cross")
    rec_b2 = record_passive_observation(
        store=store_b2,
        params=params,
        observation=binance_obs_injected,
        annualized_funding_bps_history=["2190.0"] * 30,
        evaluation_time_utc=eval_dt,
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
        borrow_rate_observation=hl_borrow,
    )
    assert rec_b2.eligibility_status == "REJECTED"
    assert any("cross_venue_borrow_rate_contamination_forbidden" in r for r in rec_b2.rejection_reasons)


# --- Scenarios 37-39: Tamper detection, verify-only idempotency, crash safety, & retroactive block ---


def test_37_verify_only_idempotency_and_tampered_historical_rate_detection(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    store = AppendOnlyEvidenceStore(tmp_path / "tamper_store")
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    meta_env, res_env = _make_envelopes(_make_spot_meta(0), [[0, _make_reserve_state()]])
    hl_borrow = build_borrow_rate_observation_from_envelopes(
        spot_meta_envelope=meta_env,
        reserve_envelope=res_env,
        evaluation_time_utc=eval_dt,
    )
    ok, errs = verify_saved_raw_borrow_evidence(
        raw_spot_meta_bytes=meta_env.raw_bytes,
        raw_reserve_bytes=res_env.raw_bytes,
        expected_spot_meta_sha256=meta_env.raw_sha256,
        expected_reserve_sha256=res_env.raw_sha256,
        recorded_observation=hl_borrow.to_dict(),
    )
    assert ok is True and errs == []

    # Tamper historical reserve rate bytes
    tampered_res = json.dumps([[0, _make_reserve_state(borrow_yearly_rate="0.01")]]).encode("utf-8")
    ok_t, errs_t = verify_saved_raw_borrow_evidence(
        raw_spot_meta_bytes=meta_env.raw_bytes,
        raw_reserve_bytes=tampered_res,
        expected_spot_meta_sha256=meta_env.raw_sha256,
        expected_reserve_sha256=res_env.raw_sha256,
        recorded_observation=hl_borrow.to_dict(),
    )
    assert ok_t is False
    assert "saved_reserve_sha256_mismatch" in errs_t

    # Mismatched token metadata (re-hashed, different index) caught at both hash and token-index layers
    tampered_meta = json.dumps(_make_spot_meta(usdc_index=9)).encode("utf-8")
    tampered_res_9 = json.dumps([[9, _make_reserve_state()]]).encode("utf-8")
    ok_m, errs_m = verify_saved_raw_borrow_evidence(
        raw_spot_meta_bytes=tampered_meta,
        raw_reserve_bytes=tampered_res_9,
        expected_spot_meta_sha256=hashlib.sha256(tampered_meta).hexdigest(),
        expected_reserve_sha256=hashlib.sha256(tampered_res_9).hexdigest(),
        recorded_observation=hl_borrow.to_dict(),
    )
    assert ok_m is False
    assert "recorded_spot_meta_sha256_mismatch" in errs_m

    rehashed_missing_norm = {
        **hl_borrow.to_dict(),
        "raw_spot_meta_sha256": hashlib.sha256(tampered_meta).hexdigest(),
        "raw_reserve_sha256": hashlib.sha256(tampered_res_9).hexdigest(),
        "normalized_sha256": "",
    }
    ok_m1, errs_m1 = verify_saved_raw_borrow_evidence(
        raw_spot_meta_bytes=tampered_meta,
        raw_reserve_bytes=tampered_res_9,
        expected_spot_meta_sha256=hashlib.sha256(tampered_meta).hexdigest(),
        expected_reserve_sha256=hashlib.sha256(tampered_res_9).hexdigest(),
        recorded_observation=rehashed_missing_norm,
    )
    assert ok_m1 is False
    assert "missing_or_invalid_recorded_normalized_sha256" in errs_m1

    body_for_rehash = {
        k: v
        for k, v in rehashed_missing_norm.items()
        if k not in {"normalized_sha256", "observation_id"}
    }
    rehashed_rec = {
        **rehashed_missing_norm,
        "normalized_sha256": hashlib.sha256(
            json.dumps(body_for_rehash, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        ).hexdigest(),
    }
    ok_m2, errs_m2 = verify_saved_raw_borrow_evidence(
        raw_spot_meta_bytes=tampered_meta,
        raw_reserve_bytes=tampered_res_9,
        expected_spot_meta_sha256=hashlib.sha256(tampered_meta).hexdigest(),
        expected_reserve_sha256=hashlib.sha256(tampered_res_9).hexdigest(),
        recorded_observation=rehashed_rec,
    )
    assert ok_m2 is False
    assert any("mismatched_saved_token_index" in e for e in errs_m2)

    # Verify-only replay does not mutate timestamps or ledger bytes
    transport = _make_mock_hl_transport(
        spot_meta=_make_spot_meta(0), reserves=[[0, _make_reserve_state()]], eval_dt=eval_dt
    )
    client = PublicReadOnlyHttpClient(transport=transport, clock_fn=lambda: eval_dt)
    obs, envs = HyperliquidReadOnlyAdapter(client, clock_fn=lambda: eval_dt).capture_market_observation(
        coin="BTC",
        funding_start_time_ms=int((eval_dt - timedelta(hours=24)).timestamp() * 1000),
        fetch_public_borrow_rate=True,
    )
    record_passive_observation(
        store=store,
        params=params,
        observation=obs,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=envs,
        evaluation_time_utc=eval_dt,
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    )
    ledger_before = store.ledger_path.read_bytes()
    rep1 = run_independent_offline_replay(store=store, params=params)
    rep2 = run_independent_offline_replay(store=store, params=params)
    assert rep1.passive_data_replay_verified is True
    assert rep1.to_dict() == rep2.to_dict()
    assert store.ledger_path.read_bytes() == ledger_before


def test_38_crash_safety_wal_duplicate_conflict_chain_and_disk_failure(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    store = AppendOnlyEvidenceStore(tmp_path / "crash_store")
    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    transport = _make_mock_hl_transport(
        spot_meta=_make_spot_meta(0), reserves=[[0, _make_reserve_state()]], eval_dt=eval_dt
    )
    client = PublicReadOnlyHttpClient(transport=transport, clock_fn=lambda: eval_dt)
    obs, envs = HyperliquidReadOnlyAdapter(client, clock_fn=lambda: eval_dt).capture_market_observation(
        coin="BTC",
        funding_start_time_ms=int((eval_dt - timedelta(hours=24)).timestamp() * 1000),
        fetch_public_borrow_rate=True,
    )

    # (a) Interrupted uncommitted WAL recovery
    store.store_dir.mkdir(parents=True, exist_ok=True)
    store.wal_path.write_text('{"record_id":"orphan_rec","raw_relpath":"raw/2026-11-24/orphan.bin"}', encoding="utf-8")
    (store.raw_dir / "2026-11-24").mkdir(parents=True, exist_ok=True)
    orphan_file = store.raw_dir / "2026-11-24" / "orphan.bin"
    orphan_file.write_bytes(b"partial")
    rec_info = store.recover_if_needed()
    assert rec_info["wal_found"] is True
    assert not orphan_file.exists()
    assert not store.wal_path.exists()

    # (b) Local disk failure during atomic write leaves ledger untouched (0 eligible days)
    with patch("verification_lab.oos.evidence_store._atomic_write_bytes", side_effect=OSError("disk_full")):
        with pytest.raises(OSError, match="disk_full"):
            record_passive_observation(
                store=store,
                params=params,
                observation=obs,
                annualized_funding_bps_history=["2190.0"] * 30,
                raw_envelopes=envs,
                evaluation_time_utc=eval_dt,
                borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
            )
    assert evaluate_store_prospective_clock(store=store, params=params, as_of_utc=eval_dt).eligible_observation_days == 0

    # (c) Normal append succeeds, then duplicate record rejected
    record_passive_observation(
        store=store,
        params=params,
        observation=obs,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=envs,
        evaluation_time_utc=eval_dt,
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    )
    with pytest.raises(DuplicateRecordError):
        record_passive_observation(
            store=store,
            params=params,
            observation=obs,
            annualized_funding_bps_history=["2190.0"] * 30,
            raw_envelopes=envs,
            evaluation_time_utc=eval_dt,
            borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
        )

    # (d) Corrupted hash-chain / truncated ledger line fails closed
    with open(store.ledger_path, "ab") as handle:
        handle.write(b'{"truncated":true')
    chain = store.verify_chain()
    assert chain.intact is False
    assert evaluate_store_prospective_clock(store=store, params=params, as_of_utc=eval_dt).eligible_observation_days == 0


def test_39_retroactive_day_qualification_blocked(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    store = AppendOnlyEvidenceStore(tmp_path / "retro_store")
    # Observation day is 2026-11-23, but captured/evaluated 48h later -> retroactively reconstructed
    late_eval = datetime(2026, 11, 25, 12, 0, 0, tzinfo=timezone.utc)
    meta_env, res_env = _make_envelopes(
        _make_spot_meta(0),
        [[0, _make_reserve_state()]],
        req_iso="2026-11-25T11:59:58Z",
        cap_iso="2026-11-25T11:59:59Z",
        http_date_iso="2026-11-25T11:59:59Z",
    )
    hl_borrow = build_borrow_rate_observation_from_envelopes(
        spot_meta_envelope=meta_env,
        reserve_envelope=res_env,
        evaluation_time_utc=late_eval,
    )
    retro_obs = NormalizedMarketObservation(
        venue="hyperliquid",
        instrument="BTC",
        spot_symbol=None,
        perp_symbol="BTC-PERP",
        observation_day_utc="2026-11-23",
        spot_price="90000.0",
        perp_price="90090.0",
        basis_bps="10.0",
        funding_rate_interval="0.00025",
        funding_interval_hours=1,
        annualized_funding_bps="2190.0",
        borrow_apr_bps=hl_borrow.borrow_apr_bps,
        bid_price="90085.0",
        ask_price="90095.0",
        spread_bps="1.11",
        l1_bid_qty="2.0",
        l1_ask_qty="2.0",
        public_liquidity_metadata={"borrow_rate_evidence": hl_borrow.to_dict()},
        instrument_availability_status="AVAILABLE",
        causal_timestamps={
            "market_event_time_utc": "2026-11-23T23:59:00Z",
            "exchange_publication_time_utc": "2026-11-23T23:59:00Z",
            "local_capture_time_utc": "2026-11-25T11:59:59Z",
            "strategy_evaluation_time_utc": "2026-11-25T12:00:00Z",
        },
        data_completeness=1.0,
        source_request_ids=["hl:retro"],
        source_response_hashes={"hl:retro": "b" * 64},
        source_authenticity_status=SOURCE_AUTHENTICITY_UNVERIFIED_HTTP,
        warnings=[],
    )
    rec = record_passive_observation(
        store=store,
        params=params,
        observation=retro_obs,
        annualized_funding_bps_history=["2190.0"] * 30,
        evaluation_time_utc=late_eval,
        retroactively_reconstructed=True,
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
        borrow_rate_observation=hl_borrow,
    )
    assert rec.eligibility_status == "REJECTED"
    assert evaluate_store_prospective_clock(store=store, params=params, as_of_utc=late_eval).eligible_observation_days == 0


# --- Scenario 40: Zero order-capable imports & immutable anchor integrity ---


def test_40_zero_order_capable_imports_and_immutable_anchors() -> None:
    forbidden_modules = {"ccxt", "hyperliquid", "binance", "web3", "eth_account", "eth_keys"}
    oos_dir = REPO_ROOT / "verification_lab" / "src" / "verification_lab" / "oos"
    for py_file in oos_dir.glob("*.py"):
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    top = alias.name.split(".")[0].lower()
                    assert top not in forbidden_modules, f"Forbidden import {alias.name} in {py_file.name}"
            elif isinstance(node, ast.ImportFrom) and node.module:
                top = node.module.split(".")[0].lower()
                assert top not in forbidden_modules, f"Forbidden import {node.module} in {py_file.name}"

    assert hashlib.sha256(REGISTRATION_PATH.read_bytes()).hexdigest() == EXPECTED_REGISTRATION_SHA256
    assert hashlib.sha256(ERRATUM_PATH.read_bytes()).hexdigest() == EXPECTED_ERRATUM_SHA256
    assert hashlib.sha256(CONTRACT_PATH.read_bytes()).hexdigest() == EXPECTED_CONTRACT_SHA256
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    assert params.frozen_spec_sha256 == EXPECTED_FROZEN_SPEC_SHA256


# --- Additional regression tests for advancing clock, pipeline staleness, raw envelope enforcement, & CLI Decimal ---


def test_41_advancing_wall_clock_capture_succeeds_without_causal_violation(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    store = AppendOnlyEvidenceStore(tmp_path / "advancing_clock_store")
    base_dt = datetime(2026, 11, 24, 0, 5, 0, tzinfo=timezone.utc)
    ticks = {"n": 0}

    def advancing_clock() -> datetime:
        ticks["n"] += 1
        return base_dt + timedelta(milliseconds=100 * ticks["n"])

    transport = _make_mock_hl_transport(
        spot_meta=_make_spot_meta(0),
        reserves=[[0, _make_reserve_state()]],
        eval_dt=base_dt + timedelta(seconds=1),
        http_date_hdr="Tue, 24 Nov 2026 00:05:00 GMT",
    )
    client = PublicReadOnlyHttpClient(transport=transport, clock_fn=advancing_clock)
    hl = HyperliquidReadOnlyAdapter(client, clock_fn=advancing_clock)
    obs, envs = hl.capture_market_observation(
        coin="BTC",
        funding_start_time_ms=int((base_dt - timedelta(hours=24)).timestamp() * 1000),
        funding_end_time_ms=int(base_dt.timestamp() * 1000),
        fetch_public_borrow_rate=True,
    )
    assert obs.borrow_apr_bps is not None
    ev = obs.public_liquidity_metadata["borrow_rate_evidence"]
    assert ev["eligible_for_borrow_input"] is True
    assert ev["causal_validity_status"] == CAUSAL_STATUS_LOCAL_BOUNDED_NO_PUB_TS

    eval_dt = advancing_clock()
    rec = record_passive_observation(
        store=store,
        params=params,
        observation=obs,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=envs,
        evaluation_time_utc=eval_dt,
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    )
    assert rec.eligibility_status == "ELIGIBLE"
    assert run_independent_offline_replay(store=store, params=params).passive_data_replay_verified is True


def test_42_pipeline_rechecks_borrow_staleness_and_requires_raw_envelopes(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    t0 = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    transport = _make_mock_hl_transport(
        spot_meta=_make_spot_meta(0),
        reserves=[[0, _make_reserve_state()]],
        eval_dt=t0,
    )
    client = PublicReadOnlyHttpClient(transport=transport, clock_fn=lambda: t0)
    obs, envs = HyperliquidReadOnlyAdapter(client, clock_fn=lambda: t0).capture_market_observation(
        coin="BTC",
        funding_start_time_ms=int((t0 - timedelta(hours=24)).timestamp() * 1000),
        fetch_public_borrow_rate=True,
    )

    # (a) Passing observation to pipeline 2 hours after capture MUST fail borrow-rate staleness recheck
    store_stale = AppendOnlyEvidenceStore(tmp_path / "stale_pipeline")
    rec_stale = record_passive_observation(
        store=store_stale,
        params=params,
        observation=obs,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=envs,
        evaluation_time_utc=t0 + timedelta(hours=2),
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    )
    assert rec_stale.eligibility_status == "REJECTED"
    assert any("borrow_rate_causal_recheck_failed" in r for r in rec_stale.rejection_reasons)

    # (b) Missing raw_envelopes with VENUE_OBSERVED_PUBLIC_READ_ONLY MUST fail closed
    store_no_env = AppendOnlyEvidenceStore(tmp_path / "no_env_pipeline")
    rec_no_env = record_passive_observation(
        store=store_no_env,
        params=params,
        observation=obs,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=None,
        evaluation_time_utc=t0,
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    )
    assert rec_no_env.eligibility_status == "REJECTED"
    assert "missing_raw_borrow_envelopes_for_venue_observed_public_read_only" in rec_no_env.rejection_reasons


def test_43_verify_saved_evidence_tampered_fields_and_cli_decimal_validation() -> None:
    import argparse
    import importlib.util

    eval_dt = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)
    meta_env, res_env = _make_envelopes(_make_spot_meta(0), [[0, _make_reserve_state()]])
    hl_borrow = build_borrow_rate_observation_from_envelopes(
        spot_meta_envelope=meta_env,
        reserve_envelope=res_env,
        evaluation_time_utc=eval_dt,
    )
    tampered_dict = dict(hl_borrow.to_dict())
    tampered_dict["borrow_apr_bps"] = "not-a-number"
    ok, errs = verify_saved_raw_borrow_evidence(
        raw_spot_meta_bytes=meta_env.raw_bytes,
        raw_reserve_bytes=res_env.raw_bytes,
        expected_spot_meta_sha256=meta_env.raw_sha256,
        expected_reserve_sha256=res_env.raw_sha256,
        recorded_observation=tampered_dict,
    )
    assert ok is False
    assert "recorded_normalized_sha256_mismatch" in errs

    cli_path = REPO_ROOT / "verification_lab" / "scripts" / "collect_h3_v2_passive_oos.py"
    spec = importlib.util.spec_from_file_location("collect_h3_v2_passive_oos", cli_path)
    assert spec and spec.loader
    cli_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cli_mod)

    assert cli_mod._parse_non_negative_decimal_arg("487.901642") == Decimal("487.901642")
    for bad in ("nan", "inf", "-inf", "-1.5", "abc"):
        with pytest.raises(argparse.ArgumentTypeError):
            cli_mod._parse_non_negative_decimal_arg(bad)


def test_44_offline_replay_tolerance_parity_with_borrow_adapter(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REGISTRATION_PATH)
    t0 = datetime(2026, 11, 24, 0, 5, 2, tzinfo=timezone.utc)

    # Case 1: utilization diff = 0.0005 (between 0.0001 and 0.001) must be accepted by BOTH
    # the borrow-rate adapter AND independent offline replay (never poisoning store replay).
    state_u = _make_reserve_state(
        utilization="0.5763549404",  # +0.0005 above totalBorrowed/totalSupplied (~0.5758549404)
    )
    transport_u = _make_mock_hl_transport(
        spot_meta=_make_spot_meta(0),
        reserves=[[0, state_u]],
        eval_dt=t0,
    )
    client_u = PublicReadOnlyHttpClient(transport=transport_u, clock_fn=lambda: t0)
    adapter_u = HyperliquidReadOnlyAdapter(client_u, clock_fn=lambda: t0)
    obs_u, envs_u = adapter_u.capture_market_observation(
        coin="BTC",
        funding_start_time_ms=int((t0 - timedelta(hours=24)).timestamp() * 1000),
        funding_end_time_ms=int(t0.timestamp() * 1000),
        fetch_public_borrow_rate=True,
    )
    assert obs_u.borrow_apr_bps is not None
    store_u = AppendOnlyEvidenceStore(tmp_path / "store_u_parity")
    rec_u = record_passive_observation(
        store=store_u,
        params=params,
        observation=obs_u,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=envs_u,
        evaluation_time_utc=t0,
        borrow_apr_source=BORROW_SOURCE_VENUE_OBSERVED_PUBLIC,
    )
    assert rec_u.eligibility_status == "ELIGIBLE"
    rep_u = run_independent_offline_replay(store=store_u, params=params)
    assert rep_u.passive_data_replay_verified is True

    # Case 2: balance relative diff = 0.015 (between 0.01 and 0.02) must be rejected by BOTH
    # the borrow-rate adapter AND independent offline replay.
    # totalSupplied ~ 620840038.9, totalBorrowed ~ 357513803.6 -> expected bal ~ 263326235.3
    # 1.5% of totalSupplied ~ 9312600.6 -> shifted bal = 254013634.7
    state_b = _make_reserve_state(balance="254013634.7000000000")
    transport_b = _make_mock_hl_transport(
        spot_meta=_make_spot_meta(0),
        reserves=[[0, state_b]],
        eval_dt=t0,
    )
    client_b = PublicReadOnlyHttpClient(transport=transport_b, clock_fn=lambda: t0)
    adapter_b = HyperliquidReadOnlyAdapter(client_b, clock_fn=lambda: t0)
    obs_b, envs_b = adapter_b.capture_market_observation(
        coin="BTC",
        funding_start_time_ms=int((t0 - timedelta(hours=24)).timestamp() * 1000),
        funding_end_time_ms=int(t0.timestamp() * 1000),
        fetch_public_borrow_rate=True,
    )
    assert obs_b.borrow_apr_bps is None
    store_b = AppendOnlyEvidenceStore(tmp_path / "store_b_parity")
    rec_b = record_passive_observation(
        store=store_b,
        params=params,
        observation=obs_b,
        annualized_funding_bps_history=["2190.0"] * 30,
        raw_envelopes=envs_b,
        evaluation_time_utc=t0,
        borrow_apr_source="BORROW_RATE_INVALID_OR_UNVERIFIABLE",
    )
    assert rec_b.eligibility_status == "REJECTED"
    rep_b = run_independent_offline_replay(store=store_b, params=params)
    assert rep_b.passive_data_replay_verified is True


