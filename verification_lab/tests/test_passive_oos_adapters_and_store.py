"""Tests for read-only public data adapters and crash-safe append-only evidence store."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from verification_lab.oos.adapters import (
    AdapterError,
    BinanceReadOnlyAdapter,
    DataQualityError,
    HttpResponseData,
    HyperliquidReadOnlyAdapter,
    PublicReadOnlyHttpClient,
    RateLimitExhaustedError,
    UnauthorizedEndpointError,
)
from verification_lab.oos.evidence_store import (
    AppendOnlyEvidenceStore,
    DuplicateRecordError,
    EvidenceStoreError,
    LOCAL_INTEGRITY_FAILED,
    LOCAL_INTEGRITY_INTACT,
    PartialWriteRecoveryError,
    SOURCE_AUTHENTICITY_LOCAL_CAPTURE,
)


def _utc(year: int, month: int, day: int, hour: int = 0, minute: int = 0, second: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _binance_valid_transport(now_dt: datetime, *, symbol: str = "BTCUSDT") -> Any:
    prev_open = _utc(2026, 11, 23, 0, 0, 0)
    prev_close_ms = _ms(_utc(2026, 11, 24, 0, 0, 0)) - 1
    cur_open = _utc(2026, 11, 24, 0, 0, 0)
    cur_close_ms = _ms(_utc(2026, 11, 25, 0, 0, 0)) - 1

    spot_klines = [
        [_ms(prev_open), "90000.0", "91000.0", "89500.0", "90500.0", "1000", prev_close_ms, "90500000", 10, "500", "45000000", "0"],
        [_ms(cur_open), "90500.0", "90800.0", "90400.0", "90600.0", "10", cur_close_ms, "906000", 1, "5", "453000", "0"],
    ]
    perp_klines = [
        [_ms(prev_open), "90010.0", "91020.0", "89510.0", "90590.5", "2000", prev_close_ms, "181000000", 20, "1000", "90500000", "0"],
        [_ms(cur_open), "90590.5", "90810.0", "90410.0", "90650.0", "20", cur_close_ms, "1813000", 2, "10", "906500", "0"],
    ]
    funding = [
        {"symbol": symbol, "fundingTime": _ms(_utc(2026, 11, 23, 8, 0, 0)), "fundingRate": "0.00010000"},
        {"symbol": symbol, "fundingTime": _ms(_utc(2026, 11, 23, 16, 0, 0)), "fundingRate": "0.00011000"},
        {"symbol": symbol, "fundingTime": _ms(_utc(2026, 11, 24, 0, 0, 0)), "fundingRate": "0.00012000"},
    ]
    book = {
        "symbol": symbol,
        "bidPrice": "90589.00",
        "bidQty": "2.500",
        "askPrice": "90591.00",
        "askQty": "3.100",
        "time": _ms(now_dt - timedelta(seconds=2)),
    }

    def transport(method: str, url: str, params: Any, json_body: Any, headers: Any, timeout_s: float) -> HttpResponseData:
        if "/api/v3/klines" in url:
            return HttpResponseData(200, json.dumps(spot_klines).encode(), {})
        if "/fapi/v1/klines" in url:
            return HttpResponseData(200, json.dumps(perp_klines).encode(), {})
        if "/fapi/v1/fundingRate" in url:
            return HttpResponseData(200, json.dumps(funding).encode(), {})
        if "/fapi/v1/ticker/bookTicker" in url:
            return HttpResponseData(200, json.dumps(book).encode(), {})
        raise AssertionError(f"Unexpected URL: {url}")

    return transport


def _hyperliquid_valid_transport(now_dt: datetime, *, coin: str = "BTC") -> Any:
    meta_ctxs = [
        {"universe": [{"name": coin, "szDecimals": 5}]},
        [{"oraclePx": "90500.0", "markPx": "90545.25", "openInterest": "1234.5", "dayNtlVlm": "50000000.0"}],
    ]
    l2_book = {
        "coin": coin,
        "time": _ms(now_dt - timedelta(seconds=1)),
        "levels": [[{"px": "90544.0", "sz": "4.2", "n": 3}], [{"px": "90546.0", "sz": "3.8", "n": 2}]],
    }
    funding = [
        {"coin": coin, "fundingRate": "0.000015", "time": _ms(_utc(2026, 11, 23, 22, 0, 0)) + 20},
        {"coin": coin, "fundingRate": "0.000016", "time": _ms(_utc(2026, 11, 23, 23, 0, 0)) + 30},
        {"coin": coin, "fundingRate": "0.000017", "time": _ms(_utc(2026, 11, 24, 0, 0, 0)) + 15},
    ]

    def transport(method: str, url: str, params: Any, json_body: Any, headers: Any, timeout_s: float) -> HttpResponseData:
        req_type = (json_body or {}).get("type")
        if req_type == "metaAndAssetCtxs":
            return HttpResponseData(200, json.dumps(meta_ctxs).encode(), {})
        if req_type == "l2Book":
            return HttpResponseData(200, json.dumps(l2_book).encode(), {})
        if req_type == "fundingHistory":
            return HttpResponseData(200, json.dumps(funding).encode(), {})
        raise AssertionError(f"Unexpected Hyperliquid info type: {req_type}")

    return transport


def test_binance_and_hyperliquid_happy_path_read_only() -> None:
    now_dt = _utc(2026, 11, 24, 0, 5, 0)
    b_client = PublicReadOnlyHttpClient(transport=_binance_valid_transport(now_dt), clock_fn=lambda: now_dt, sleep_fn=lambda _: None)
    b_obs, b_envs = BinanceReadOnlyAdapter(b_client, clock_fn=lambda: now_dt).capture_daily_observation(
        instrument="BTC", spot_symbol="BTCUSDT", perp_symbol="BTCUSDT", borrow_apr_bps=Decimal("500")
    )
    assert b_obs.venue == "binance"
    assert b_obs.observation_day_utc == "2026-11-23"
    assert len(b_envs) == 4
    assert b_obs.source_authenticity_status == SOURCE_AUTHENTICITY_LOCAL_CAPTURE

    hl_client = PublicReadOnlyHttpClient(transport=_hyperliquid_valid_transport(now_dt), clock_fn=lambda: now_dt, sleep_fn=lambda _: None)
    hl_obs, hl_envs = HyperliquidReadOnlyAdapter(hl_client, clock_fn=lambda: now_dt).capture_market_observation(
        coin="BTC", funding_start_time_ms=_ms(_utc(2026, 11, 23, 0, 0, 0))
    )
    assert hl_obs.venue == "hyperliquid"
    assert hl_obs.funding_interval_hours == 1
    assert hl_obs.borrow_apr_bps is None  # Unavailable stays explicitly None
    assert len(hl_envs) == 3


def test_unauthorized_endpoints_and_credential_headers_blocked() -> None:
    client = PublicReadOnlyHttpClient(sleep_fn=lambda _: None)
    with pytest.raises(UnauthorizedEndpointError):
        client.fetch(venue="binance", method="POST", url="https://api.binance.com/api/v3/order")
    with pytest.raises(UnauthorizedEndpointError):
        client.fetch(venue="binance", method="DELETE", url="https://fapi.binance.com/fapi/v1/order")
    with pytest.raises(UnauthorizedEndpointError):
        client.fetch(venue="hyperliquid", method="POST", url="https://api.hyperliquid.xyz/exchange", json_body={"type": "order"})
    with pytest.raises(UnauthorizedEndpointError):
        client.fetch(venue="hyperliquid", method="POST", url="https://api.hyperliquid.xyz/info", json_body={"type": "clearinghouseState"})
    with pytest.raises(UnauthorizedEndpointError):
        client.fetch(
            venue="binance",
            method="GET",
            url="https://api.binance.com/api/v3/klines",
            headers={"X-MBX-APIKEY": "secret"},
        )
    with pytest.raises(UnauthorizedEndpointError):
        client.fetch(venue="binance", method="GET", url="http://api.binance.com/api/v3/klines")


def test_adapter_http_timeout_and_429_rate_limit_bounded_retries() -> None:
    sleeps: list[float] = []

    def timeout_transport(*_a: Any) -> HttpResponseData:
        raise TimeoutError("simulated timeout")

    client = PublicReadOnlyHttpClient(
        transport=timeout_transport, sleep_fn=sleeps.append, max_retries=2, base_backoff_s=0.1
    )
    with pytest.raises(AdapterError, match="http_timeout_or_network_error"):
        client.fetch(venue="binance", method="GET", url="https://api.binance.com/api/v3/klines")
    assert sleeps == [0.1, 0.2]

    sleeps_429: list[float] = []
    calls = {"n": 0}

    def rate_limit_transport(*_a: Any) -> HttpResponseData:
        calls["n"] += 1
        return HttpResponseData(429, b'{"msg":"too many requests"}', {"retry-after": "1"})

    client_429 = PublicReadOnlyHttpClient(
        transport=rate_limit_transport, sleep_fn=sleeps_429.append, max_retries=2, base_backoff_s=0.1
    )
    with pytest.raises(RateLimitExhaustedError):
        client_429.fetch(venue="binance", method="GET", url="https://api.binance.com/api/v3/klines")
    assert calls["n"] == 3
    assert sleeps_429 == [1.0, 1.0]


def test_adapter_reliability_edge_cases() -> None:
    now_dt = _utc(2026, 11, 24, 0, 5, 0)

    # 1. Empty response
    empty_client = PublicReadOnlyHttpClient(
        transport=lambda *_a: HttpResponseData(200, b"", {}), clock_fn=lambda: now_dt, sleep_fn=lambda _: None
    )
    with pytest.raises(DataQualityError, match="empty_response_body"):
        empty_client.fetch(venue="binance", method="GET", url="https://api.binance.com/api/v3/klines")

    # 2. Malformed JSON & Exchange API error
    bad_json_client = PublicReadOnlyHttpClient(
        transport=lambda *_a: HttpResponseData(200, b"{not-json", {}), clock_fn=lambda: now_dt, sleep_fn=lambda _: None
    )
    with pytest.raises(DataQualityError, match="malformed_json_response"):
        BinanceReadOnlyAdapter(bad_json_client, clock_fn=lambda: now_dt).capture_daily_observation(
            instrument="BTC", spot_symbol="BTCUSDT", perp_symbol="BTCUSDT"
        )

    api_err_client = PublicReadOnlyHttpClient(
        transport=lambda *_a: HttpResponseData(200, b'{"code":-1121,"msg":"Invalid symbol."}', {}),
        clock_fn=lambda: now_dt,
        sleep_fn=lambda _: None,
    )
    with pytest.raises(DataQualityError, match="exchange_api_error"):
        BinanceReadOnlyAdapter(api_err_client, clock_fn=lambda: now_dt).capture_daily_observation(
            instrument="BTC", spot_symbol="BTCUSDT", perp_symbol="BTCUSDT"
        )

    # 3. Inconsistent spot/perp pair (including prefix-collision symbol like BTCSTUSDT)
    base_client = PublicReadOnlyHttpClient(
        transport=_binance_valid_transport(now_dt), clock_fn=lambda: now_dt, sleep_fn=lambda _: None
    )
    with pytest.raises(DataQualityError, match="inconsistent_spot_perp_pair"):
        BinanceReadOnlyAdapter(base_client, clock_fn=lambda: now_dt).capture_daily_observation(
            instrument="BTC", spot_symbol="BTCUSDT", perp_symbol="ETHUSDT"
        )
    with pytest.raises(DataQualityError, match="inconsistent_spot_perp_pair"):
        BinanceReadOnlyAdapter(base_client, clock_fn=lambda: now_dt).capture_daily_observation(
            instrument="BTC", spot_symbol="BTCSTUSDT", perp_symbol="BTCUSDT"
        )

    # 4. Symbol mapping mismatch in response
    mismatch_client = PublicReadOnlyHttpClient(
        transport=_binance_valid_transport(now_dt, symbol="ETHUSDT"), clock_fn=lambda: now_dt, sleep_fn=lambda _: None
    )
    with pytest.raises(DataQualityError, match="symbol_mapping_mismatch"):
        BinanceReadOnlyAdapter(mismatch_client, clock_fn=lambda: now_dt).capture_daily_observation(
            instrument="BTC", spot_symbol="BTCUSDT", perp_symbol="BTCUSDT"
        )

    # 5. Missing instrument on Hyperliquid
    hl_client = PublicReadOnlyHttpClient(
        transport=_hyperliquid_valid_transport(now_dt, coin="ETH"), clock_fn=lambda: now_dt, sleep_fn=lambda _: None
    )
    with pytest.raises(DataQualityError, match="missing_market_instrument"):
        HyperliquidReadOnlyAdapter(hl_client, clock_fn=lambda: now_dt).capture_market_observation(
            coin="BTC", funding_start_time_ms=_ms(_utc(2026, 11, 23, 0, 0, 0))
        )

    # 6. Stale event timestamp & clock skew on L1 quote
    stale_now = _utc(2026, 11, 24, 1, 0, 0)  # book is > 300s stale
    stale_transport = _binance_valid_transport(_utc(2026, 11, 24, 0, 5, 0))
    stale_client = PublicReadOnlyHttpClient(transport=stale_transport, clock_fn=lambda: stale_now, sleep_fn=lambda _: None)
    with pytest.raises(DataQualityError, match="stale_exchange_event_timestamp"):
        BinanceReadOnlyAdapter(stale_client, clock_fn=lambda: stale_now).capture_daily_observation(
            instrument="BTC", spot_symbol="BTCUSDT", perp_symbol="BTCUSDT"
        )

    skew_transport = _binance_valid_transport(now_dt + timedelta(seconds=60))  # exchange ahead by 58s
    skew_client = PublicReadOnlyHttpClient(transport=skew_transport, clock_fn=lambda: now_dt, sleep_fn=lambda _: None)
    with pytest.raises(DataQualityError, match="clock_skew_exchange_ahead_of_local"):
        BinanceReadOnlyAdapter(skew_client, clock_fn=lambda: now_dt).capture_daily_observation(
            instrument="BTC", spot_symbol="BTCUSDT", perp_symbol="BTCUSDT"
        )


def test_evidence_store_hash_chain_tamper_reorder_duplicate_and_wal_recovery(tmp_path: Path) -> None:
    store = AppendOnlyEvidenceStore(tmp_path / "evidence")
    spec_sha = "187e1974069bc1d70950b475804b670a8510a413411652c2c71b1e370b22ee53"

    r1 = store.append_record(
        record_id="rec_1",
        strategy_id="H3_BASIS_CARRY_V2",
        observation_day_utc="2026-11-23",
        captured_at_utc="2026-11-24T00:05:00Z",
        available_at_utc="2026-11-24T00:00:00Z",
        venue="binance",
        instrument="BTC",
        raw_source_id="binance:/api/v3/klines:1",
        raw_bytes=b'{"day":1}',
        normalized_observation={"day": 1},
        frozen_spec_sha256=spec_sha,
        eligibility_status="ELIGIBLE",
        rejection_reasons=[],
    )
    r2 = store.append_record(
        record_id="rec_2",
        strategy_id="H3_BASIS_CARRY_V2",
        observation_day_utc="2026-11-24",
        captured_at_utc="2026-11-25T00:05:00Z",
        available_at_utc="2026-11-25T00:00:00Z",
        venue="binance",
        instrument="BTC",
        raw_source_id="binance:/api/v3/klines:2",
        raw_bytes=b'{"day":2}',
        normalized_observation={"day": 2},
        frozen_spec_sha256=spec_sha,
        eligibility_status="ELIGIBLE",
        rejection_reasons=[],
    )
    assert r2.previous_record_sha256 == r1.record_sha256

    # Idempotent verify-only rerun
    v1 = store.verify_chain()
    v2 = store.verify_chain()
    assert v1.intact is True and v2 == v1
    assert v1.local_integrity_status == LOCAL_INTEGRITY_INTACT
    assert v1.source_authenticity_status == SOURCE_AUTHENTICITY_LOCAL_CAPTURE

    # Duplicate accepted day rejected
    with pytest.raises(DuplicateRecordError, match="duplicate_accepted_day"):
        store.append_record(
            record_id="rec_1_dup",
            strategy_id="H3_BASIS_CARRY_V2",
            observation_day_utc="2026-11-23",
            captured_at_utc="2026-11-24T01:00:00Z",
            available_at_utc="2026-11-24T00:00:00Z",
            venue="binance",
            instrument="BTC",
            raw_source_id="binance:/api/v3/klines:1b",
            raw_bytes=b'{"day":1,"v":2}',
            normalized_observation={"day": 1},
            frozen_spec_sha256=spec_sha,
            eligibility_status="ELIGIBLE",
            rejection_reasons=[],
        )

    # Empty raw bytes rejected
    with pytest.raises(EvidenceStoreError, match="missing_or_empty_raw_bytes"):
        store.append_record(
            record_id="rec_empty",
            strategy_id="H3_BASIS_CARRY_V2",
            observation_day_utc="2026-11-25",
            captured_at_utc="2026-11-26T00:05:00Z",
            available_at_utc="2026-11-26T00:00:00Z",
            venue="binance",
            instrument="BTC",
            raw_source_id="binance:/api/v3/klines:empty",
            raw_bytes=b"",
            normalized_observation={"day": 3},
            frozen_spec_sha256=spec_sha,
            eligibility_status="ELIGIBLE",
            rejection_reasons=[],
        )

    # Partial-write WAL crash recovery without advancing ledger
    store.wal_path.write_text('{"record_id":"partial_crash"', encoding="utf-8")
    assert store.verify_chain().intact is False
    with pytest.raises(PartialWriteRecoveryError):
        store.append_record(
            record_id="rec_3",
            strategy_id="H3_BASIS_CARRY_V2",
            observation_day_utc="2026-11-25",
            captured_at_utc="2026-11-26T00:05:00Z",
            available_at_utc="2026-11-26T00:00:00Z",
            venue="binance",
            instrument="BTC",
            raw_source_id="binance:3",
            raw_bytes=b'{"day":3}',
            normalized_observation={"day": 3},
            frozen_spec_sha256=spec_sha,
            eligibility_status="ELIGIBLE",
            rejection_reasons=[],
        )
    recov = store.recover_if_needed()
    assert recov["wal_found"] is True
    assert store.verify_chain().intact is True
    assert store.verify_chain().record_count == 2

    # Reordered chain fails closed
    lines = store.ledger_path.read_text(encoding="utf-8").splitlines()
    store.ledger_path.write_text("\n".join(reversed(lines)) + "\n", encoding="utf-8")
    reordered = store.verify_chain()
    assert reordered.intact is False
    assert reordered.local_integrity_status == LOCAL_INTEGRITY_FAILED
    assert any("chain_link_mismatch" in e for e in reordered.errors)

    # Restore order then tamper with historical record
    store.ledger_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tampered_0 = json.loads(lines[0])
    tampered_0["instrument"] = "ETH"
    store.ledger_path.write_text(json.dumps(tampered_0) + "\n" + lines[1] + "\n", encoding="utf-8")
    tampered_report = store.verify_chain()
    assert tampered_report.intact is False
    assert any("record_sha256_tamper" in e for e in tampered_report.errors)

    # Path traversal in raw_relpath rejected by verify_chain
    traversal_rec = json.loads(lines[0])
    traversal_rec["raw_relpath"] = "../../etc/passwd"
    store.ledger_path.write_text(json.dumps(traversal_rec) + "\n", encoding="utf-8")
    trav_report = store.verify_chain()
    assert trav_report.intact is False
    assert any("raw_relpath_traversal_or_invalid" in e for e in trav_report.errors)

    # Uncommitted WAL with orphan raw file: recover_if_needed cleans orphan so identical retry succeeds
    orphan_store = AppendOnlyEvidenceStore(tmp_path / "orphan_recovery")
    orphan_raw = orphan_store.raw_dir / "2026-11-23" / "rec_retry.bin"
    orphan_raw.parent.mkdir(parents=True, exist_ok=True)
    orphan_raw.write_bytes(b'{"day":99}')
    orphan_store.wal_path.write_text(
        json.dumps({"record_id": "rec_retry", "raw_relpath": "raw/2026-11-23/rec_retry.bin"}),
        encoding="utf-8",
    )
    orphan_recov = orphan_store.recover_if_needed()
    assert orphan_recov["wal_found"] is True
    assert not orphan_raw.exists()
    retried = orphan_store.append_record(
        record_id="rec_retry",
        strategy_id="H3_BASIS_CARRY_V2",
        observation_day_utc="2026-11-23",
        captured_at_utc="2026-11-24T00:05:00Z",
        available_at_utc="2026-11-24T00:00:00Z",
        venue="binance",
        instrument="BTC",
        raw_source_id="binance:retry",
        raw_bytes=b'{"day":99}',
        normalized_observation={"day": 99},
        frozen_spec_sha256=spec_sha,
        eligibility_status="ELIGIBLE",
        rejection_reasons=[],
    )
    assert retried.record_id == "rec_retry"
    assert orphan_store.verify_chain().intact is True


def test_binance_afternoon_capture_excludes_post_candle_funding_and_raw_venue_replay_verifies_bytes(
    tmp_path: Path,
) -> None:
    from verification_lab.oos.frozen_evaluator import load_verified_frozen_v2_spec
    from verification_lab.oos.offline_replay import run_independent_offline_replay
    from verification_lab.oos.pipeline import record_passive_observation

    reg_path = Path(__file__).resolve().parents[2] / "artifacts" / "h3_basis_carry_v2_prospective_oos_registration.json"
    params = load_verified_frozen_v2_spec(reg_path)

    # Capture at 17:00 UTC on Nov 24; funding feed includes 00:00, 08:00, and 16:00 UTC settlements.
    # Adapter must select the 00:00 UTC funding (<= finalized Nov 23 candle close + 1ms), NOT 16:00 UTC.
    now_dt = _utc(2026, 11, 24, 17, 0, 0)
    base_transport = _binance_valid_transport(now_dt)

    def afternoon_transport(method: str, url: str, q: Any, body: Any, headers: Any, timeout_s: float) -> HttpResponseData:
        if "/fapi/v1/fundingRate" in url:
            rows = [
                {"symbol": "BTCUSDT", "fundingTime": _ms(_utc(2026, 11, 23, 16, 0, 0)), "fundingRate": "0.00010000"},
                {"symbol": "BTCUSDT", "fundingTime": _ms(_utc(2026, 11, 24, 0, 0, 0)), "fundingRate": "0.00012000"},
                {"symbol": "BTCUSDT", "fundingTime": _ms(_utc(2026, 11, 24, 8, 0, 0)), "fundingRate": "0.00099000"},
                {"symbol": "BTCUSDT", "fundingTime": _ms(_utc(2026, 11, 24, 16, 0, 0)), "fundingRate": "0.00099000"},
            ]
            return HttpResponseData(200, json.dumps(rows).encode(), {})
        return base_transport(method, url, q, body, headers, timeout_s)

    client = PublicReadOnlyHttpClient(transport=afternoon_transport, clock_fn=lambda: now_dt, sleep_fn=lambda _: None)
    obs, envelopes = BinanceReadOnlyAdapter(client, clock_fn=lambda: now_dt).capture_daily_observation(
        instrument="BTC", spot_symbol="BTCUSDT", perp_symbol="BTCUSDT", borrow_apr_bps=Decimal("500")
    )
    assert obs.funding_rate_interval == "0.0001200000"

    store = AppendOnlyEvidenceStore(tmp_path / "raw_venue")
    rec = record_passive_observation(
        store=store,
        params=params,
        observation=obs,
        annualized_funding_bps_history=[obs.annualized_funding_bps] * 30,
        raw_envelopes=envelopes,
        evaluation_time_utc=now_dt,
    )
    assert len(rec.raw_venue_files) == 4
    assert store.verify_chain().intact is True
    replay_ok = run_independent_offline_replay(store=store, params=params)
    assert replay_ok.passive_data_replay_verified is True
    assert replay_ok.matched_records == 1

