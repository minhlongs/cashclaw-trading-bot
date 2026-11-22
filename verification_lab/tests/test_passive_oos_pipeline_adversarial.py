"""Adversarial 24-scenario matrix, offline replay, G6 diagnostics, and synthetic 90-day tests.

All prospective-date tests use dependency-injected UTC timestamps and isolated tmp_path
directories. The system clock is never modified.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from verification_lab.oos.adapters import NormalizedMarketObservation
from verification_lab.oos.causal_timing import (
    CausalTimestamps,
    format_utc_iso,
    validate_causal_funding_events,
    validate_daily_candle_finalization,
)
from verification_lab.oos.evidence_store import AppendOnlyEvidenceStore, canonical_json_bytes
from verification_lab.oos.frozen_evaluator import (
    EXPOSURE_LABEL_THEORETICAL_ONLY,
    EXPECTED_FROZEN_SPEC_SHA256,
    EXPECTED_REGISTRATION_SHA256,
    FrozenSpecVerificationError,
    SIGNAL_NOT_EVALUABLE,
    evaluate_frozen_v2_signal,
    load_verified_frozen_v2_spec,
    validate_theoretical_exposure_shape,
)
from verification_lab.oos.microstructure_diagnostics import (
    G6_PARITY_STATUS,
    compute_g6_microstructure_diagnostics,
)
from verification_lab.oos.offline_replay import run_independent_offline_replay
from verification_lab.oos.pipeline import (
    build_g6_diagnostics_from_store,
    evaluate_store_prospective_clock,
    record_passive_observation,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
REG_PATH = REPO_ROOT / "artifacts" / "h3_basis_carry_v2_prospective_oos_registration.json"


def _utc(y: int, m: int, d: int, h: int = 0, mi: int = 0, s: int = 0) -> datetime:
    return datetime(y, m, d, h, mi, s, tzinfo=timezone.utc)


def _make_obs(
    *,
    obs_day: str,
    event_dt: datetime,
    capture_dt: datetime,
    spot: str = "90000.00000000",
    perp: str = "90090.00000000",
    funding_ann_bps: str = "1200.000000",
    borrow_apr_bps: str | None = "500.000000",
    venue: str = "binance",
    instrument: str = "BTC",
    data_completeness: float = 1.0,
) -> NormalizedMarketObservation:
    ts = CausalTimestamps(
        market_event_time_utc=format_utc_iso(event_dt),
        exchange_publication_time_utc=format_utc_iso(event_dt),
        local_capture_time_utc=format_utc_iso(capture_dt),
        strategy_evaluation_time_utc=format_utc_iso(capture_dt),
    )
    return NormalizedMarketObservation(
        venue=venue,
        instrument=instrument,
        spot_symbol=f"{instrument}USDT",
        perp_symbol=f"{instrument}USDT",
        observation_day_utc=obs_day,
        spot_price=spot,
        perp_price=perp,
        basis_bps="10.000000",
        funding_rate_interval="0.0001095890",
        funding_interval_hours=8,
        annualized_funding_bps=funding_ann_bps,
        borrow_apr_bps=borrow_apr_bps,
        bid_price="90089.00000000",
        ask_price="90091.00000000",
        spread_bps="0.222000",
        l1_bid_qty="3.50000000",
        l1_ask_qty="4.00000000",
        public_liquidity_metadata={"quote_age_seconds": 1.25},
        instrument_availability_status="AVAILABLE",
        causal_timestamps=ts.to_dict(),
        data_completeness=data_completeness,
        source_request_ids=[f"{venue}:/api/v3/klines:{obs_day}"],
        source_response_hashes={f"{venue}:/api/v3/klines:{obs_day}": "a" * 64},
        source_authenticity_status="SOURCE_CAPTURED_LOCAL_UNAUTHENTICATED",
        warnings=[],
    )


def test_frozen_spec_anchor_and_tamper_rejection(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REG_PATH)
    assert params.registration_sha256 == EXPECTED_REGISTRATION_SHA256
    assert params.frozen_spec_sha256 == EXPECTED_FROZEN_SPEC_SHA256
    assert params.lookback_days == 30
    assert params.entry_annual_bps == Decimal("800.0")
    assert params.exit_annual_bps == Decimal("150.0")
    assert params.min_funding_minus_borrow_spread_bps == Decimal("200.0")

    bad_reg = tmp_path / "tampered_reg.json"
    bad_reg.write_text(REG_PATH.read_text(encoding="utf-8").replace("800.0", "750.0"), encoding="utf-8")
    with pytest.raises(FrozenSpecVerificationError, match="registration_sha256_mismatch"):
        load_verified_frozen_v2_spec(bad_reg)


def test_adversarial_pre_start_exact_start_incomplete_candle_and_future_funding(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REG_PATH)
    hist_30 = ["1200.0"] * 30

    # 1. Observation before prospective start (2026-11-22) -> rejected
    store_pre = AppendOnlyEvidenceStore(tmp_path / "pre")
    obs_pre = _make_obs(
        obs_day="2026-11-22",
        event_dt=_utc(2026, 11, 22, 23, 59, 59),
        capture_dt=_utc(2026, 11, 22, 23, 59, 59),
    )
    rec_pre = record_passive_observation(
        store=store_pre,
        params=params,
        observation=obs_pre,
        annualized_funding_bps_history=hist_30,
        raw_envelopes_metadata=[],
        evaluation_time_utc=_utc(2026, 11, 22, 23, 59, 59),
    )
    assert rec_pre.eligibility_status == "REJECTED"
    assert any("before_prospective_start" in r for r in rec_pre.rejection_reasons)

    # 2. Observation exactly at prospective start with only actually available data -> eligible
    store_exact = AppendOnlyEvidenceStore(tmp_path / "exact")
    start_dt = _utc(2026, 11, 23, 0, 0, 0)
    obs_exact = _make_obs(obs_day="2026-11-23", event_dt=start_dt, capture_dt=start_dt)
    rec_exact = record_passive_observation(
        store=store_exact,
        params=params,
        observation=obs_exact,
        annualized_funding_bps_history=hist_30,
        raw_envelopes_metadata=[],
        evaluation_time_utc=start_dt,
    )
    assert rec_exact.eligibility_status == "ELIGIBLE"
    summary_exact = evaluate_store_prospective_clock(store=store_exact, params=params, as_of_utc=start_dt)
    assert summary_exact.eligible_observation_days == 1
    assert summary_exact.passive_data_replay_verified is True
    assert summary_exact.execution_parity_verified is False

    # 3. Incomplete first-day candle (Nov 23 daily candle queried at Nov 23 12:00 UTC) -> rejected
    nov23_open = int(_utc(2026, 11, 23, 0, 0, 0).timestamp() * 1000)
    nov23_close = int(_utc(2026, 11, 24, 0, 0, 0).timestamp() * 1000) - 1
    ok_candle, reasons_candle, _, _ = validate_daily_candle_finalization(
        open_time_ms=nov23_open,
        close_time_ms=nov23_close,
        local_capture_time_utc=_utc(2026, 11, 23, 12, 0, 0),
    )
    assert ok_candle is False
    assert any("unfinished_daily_candle_used_before_close" in r for r in reasons_candle)

    # 4. Future funding leakage & funding settlement misalignment -> rejected
    ok_future, reasons_future = validate_causal_funding_events(
        venue="binance",
        funding_times_ms=[int(_utc(2026, 11, 23, 16, 0, 0).timestamp() * 1000)],
        evaluation_time_utc=_utc(2026, 11, 23, 12, 0, 0),
    )
    assert ok_future is False
    assert any("future_funding_leakage" in r for r in reasons_future)

    ok_misaligned, reasons_mis = validate_causal_funding_events(
        venue="binance",
        funding_times_ms=[int(_utc(2026, 11, 23, 3, 15, 0).timestamp() * 1000)],
        evaluation_time_utc=_utc(2026, 11, 23, 12, 0, 0),
    )
    assert ok_misaligned is False
    assert any("funding_settlement_misaligned" in r for r in reasons_mis)


def test_adversarial_conflict_retroactive_fake_fill_missing_borrow_and_replay_mismatch(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REG_PATH)
    hist_30 = ["1200.0"] * 30

    # 8. Same-day conflicting observation -> entire UTC day excluded fail-closed
    store_conflict = AppendOnlyEvidenceStore(tmp_path / "conflict")
    ev = _utc(2026, 11, 24, 0, 0, 0)
    cap = _utc(2026, 11, 24, 0, 5, 0)
    good_obs = _make_obs(obs_day="2026-11-23", event_dt=ev, capture_dt=cap)
    bad_obs = _make_obs(obs_day="2026-11-23", event_dt=ev, capture_dt=cap, data_completeness=0.5)
    record_passive_observation(
        store=store_conflict,
        params=params,
        observation=good_obs,
        annualized_funding_bps_history=hist_30,
        raw_envelopes_metadata=[],
        evaluation_time_utc=cap,
    )
    record_passive_observation(
        store=store_conflict,
        params=params,
        observation=bad_obs,
        annualized_funding_bps_history=hist_30,
        raw_envelopes_metadata=[],
        evaluation_time_utc=cap,
    )
    clock_conflict = evaluate_store_prospective_clock(store=store_conflict, params=params, as_of_utc=cap)
    assert clock_conflict.eligible_observation_days == 0
    assert "2026-11-23" in clock_conflict.conflicted_days_excluded

    # 9. Retroactive reconstruction attempt (captured 72h late) -> rejected AND does not advance clock
    store_retro = AppendOnlyEvidenceStore(tmp_path / "retro")
    retro_obs = _make_obs(obs_day="2026-11-23", event_dt=ev, capture_dt=ev + timedelta(hours=72))
    rec_retro = record_passive_observation(
        store=store_retro,
        params=params,
        observation=retro_obs,
        annualized_funding_bps_history=hist_30,
        raw_envelopes_metadata=[],
        evaluation_time_utc=ev + timedelta(hours=72),
    )
    assert rec_retro.eligibility_status == "REJECTED"
    assert any("retroactive" in r for r in rec_retro.rejection_reasons)
    clock_retro = evaluate_store_prospective_clock(
        store=store_retro, params=params, as_of_utc=ev + timedelta(hours=72)
    )
    assert clock_retro.eligible_observation_days == 0
    assert clock_retro.rejected_observation_days == 1

    # 18 & 19. Malformed theoretical exposure & simulated fill falsely labeled real
    assert len(validate_theoretical_exposure_shape({"exposure_label": "REAL", "executed": True})) >= 2
    store_fake_fill = AppendOnlyEvidenceStore(tmp_path / "fake_fill")
    rec_fake = record_passive_observation(
        store=store_fake_fill,
        params=params,
        observation=good_obs,
        annualized_funding_bps_history=hist_30,
        raw_envelopes_metadata=[],
        evaluation_time_utc=cap,
        simulated_fills_represented_as_real=True,
    )
    assert rec_fake.eligibility_status == "REJECTED"
    assert any("simulated_fills_represented_as_real_forbidden" in r for r in rec_fake.rejection_reasons)

    # 20. Unavailable borrow rate -> SIGNAL_NOT_EVALUABLE_MISSING_DATA (no default substitution)
    sig_no_borrow = evaluate_frozen_v2_signal(
        params=params,
        spot_price="90000",
        perp_price="90100",
        annualized_funding_bps_history=hist_30,
        borrow_apr_bps=None,
    )
    assert sig_no_borrow.evaluable is False
    assert sig_no_borrow.signal_state == SIGNAL_NOT_EVALUABLE
    assert sig_no_borrow.exposure_label == EXPOSURE_LABEL_THEORETICAL_ONLY
    assert "borrow_apr_bps" in sig_no_borrow.missing_variables
    assert sig_no_borrow.order_intent_created is False

    # 17. Offline replay mismatch detection (tamper recorded signal while re-hashing ledger)
    store_replay = AppendOnlyEvidenceStore(tmp_path / "replay")
    rec_ok = record_passive_observation(
        store=store_replay,
        params=params,
        observation=good_obs,
        annualized_funding_bps_history=hist_30,
        raw_envelopes_metadata=[],
        evaluation_time_utc=cap,
    )
    assert run_independent_offline_replay(store=store_replay, params=params).passive_data_replay_verified is True

    # Corrupt raw file bytes to induce replay mismatch
    raw_file = store_replay.store_dir / rec_ok.raw_relpath
    raw_doc = json.loads(raw_file.read_text(encoding="utf-8"))
    raw_doc["spot_price"] = "95000.00000000"
    raw_file.write_bytes(canonical_json_bytes(raw_doc))
    replay_fail = run_independent_offline_replay(store=store_replay, params=params)
    assert replay_fail.passive_data_replay_verified is False
    assert replay_fail.execution_parity_verified is False


def test_synthetic_90_day_sequence_never_counts_as_real_or_grants_g5_g13_pass(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REG_PATH)
    store = AppendOnlyEvidenceStore(tmp_path / "synth90")
    hist_30 = ["1200.0"] * 30
    in_pos = False

    for day_offset in range(90):
        obs_date = _utc(2026, 11, 23, 0, 0, 0) + timedelta(days=day_offset)
        avail_dt = obs_date + timedelta(days=1)
        cap_dt = avail_dt + timedelta(minutes=5)
        ann_funding = "1200.000000" if day_offset % 10 < 5 else "100.000000"
        hist_30 = hist_30[1:] + [ann_funding]

        obs = _make_obs(
            obs_day=obs_date.date().isoformat(),
            event_dt=avail_dt,
            capture_dt=cap_dt,
            funding_ann_bps=ann_funding,
            borrow_apr_bps="500.000000",
        )
        rec = record_passive_observation(
            store=store,
            params=params,
            observation=obs,
            annualized_funding_bps_history=hist_30,
            raw_envelopes_metadata=[],
            evaluation_time_utc=cap_dt,
            prior_theoretical_in_position=in_pos,
            synthetic_fixture=True,
        )
        sig_state = rec.normalized_observation["signal_output"]["signal_state"]
        in_pos = sig_state in ("THEORETICAL_ENTRY_LONG_SPOT_SHORT_PERP", "THEORETICAL_HOLD_LONG_SPOT_SHORT_PERP")

    as_of = _utc(2026, 11, 23, 0, 0, 0) + timedelta(days=91)
    summary = evaluate_store_prospective_clock(store=store, params=params, as_of_utc=as_of)

    # Synthetic 90-day sequence must NEVER advance real eligible days or grant G5/G13 pass
    assert summary.synthetic_fixture_days_excluded == 90
    assert summary.eligible_observation_days == 0
    assert summary.clock_complete is False
    assert summary.real_g5_or_g13_pass_granted is False
    assert summary.completed_executed_paper_trades == 0
    assert summary.paper_forward_allowed is False
    assert summary.live_order_authority is False
    assert summary.g13_status == "UNTOUCHED"
    assert summary.g15_status == "HARD-LOCKED"
    assert summary.h3_maker_status == "QUARANTINED"
    assert summary.g6_execution_parity_status == G6_PARITY_STATUS
    assert summary.passive_data_replay_verified is True
    assert summary.execution_parity_verified is False

    # G6 microstructure diagnostics exclude synthetic records by default and preserve parity lock
    diag_real_only = build_g6_diagnostics_from_store(store)
    assert diag_real_only["sample_count"] == 0
    assert diag_real_only["excluded_synthetic_records"] == 90

    diag = build_g6_diagnostics_from_store(store, include_synthetic=True, include_rejected=True)
    assert diag["g6_execution_parity_status"] == G6_PARITY_STATUS
    assert diag["l1_establishes_fifo_queue_position"] is False
    assert diag["l1_equivalent_to_l2_order_by_order"] is False
    assert diag["sample_adequacy_status"] == "INSUFFICIENT_SAMPLE_N90"
    assert diag["observed_trading_cost_bounds_bps"]["market_impact_and_queue_slippage_upper_bound_bps"] is None


def test_pre_window_nov22_candle_rejected_and_multi_venue_replay_isolated(tmp_path: Path) -> None:
    params = load_verified_frozen_v2_spec(REG_PATH)
    hist_30 = ["1200.0"] * 30

    # Pre-window 2026-11-22 daily candle finalized at 2026-11-23T00:00:00Z must NOT count as eligible
    store_nov22 = AppendOnlyEvidenceStore(tmp_path / "nov22")
    nov22_avail = _utc(2026, 11, 23, 0, 0, 0)
    nov22_cap = _utc(2026, 11, 23, 0, 5, 0)
    obs_nov22 = _make_obs(obs_day="2026-11-22", event_dt=nov22_avail, capture_dt=nov22_cap)
    rec_nov22 = record_passive_observation(
        store=store_nov22,
        params=params,
        observation=obs_nov22,
        annualized_funding_bps_history=hist_30,
        evaluation_time_utc=nov22_cap,
    )
    assert rec_nov22.eligibility_status == "REJECTED"
    assert any("observation_day_before_prospective_start" in r for r in rec_nov22.rejection_reasons)
    clock_nov22 = evaluate_store_prospective_clock(store=store_nov22, params=params, as_of_utc=nov22_cap)
    assert clock_nov22.eligible_observation_days == 0

    # Multi-venue store: Hyperliquid BTC at 00:05:00Z enters position, then Binance BTC at 00:05:10Z
    # with available_at_utc=00:00:00Z must replay independently without monotonic or state collision.
    store_mv = AppendOnlyEvidenceStore(tmp_path / "multi_venue")
    hl_obs = _make_obs(
        obs_day="2026-11-24",
        event_dt=_utc(2026, 11, 24, 0, 4, 59),
        capture_dt=_utc(2026, 11, 24, 0, 5, 0),
        venue="hyperliquid",
        instrument="BTC",
    )
    bn_obs = _make_obs(
        obs_day="2026-11-23",
        event_dt=_utc(2026, 11, 24, 0, 0, 0),
        capture_dt=_utc(2026, 11, 24, 0, 5, 10),
        venue="binance",
        instrument="BTC",
    )
    record_passive_observation(
        store=store_mv,
        params=params,
        observation=hl_obs,
        annualized_funding_bps_history=hist_30,
        evaluation_time_utc=_utc(2026, 11, 24, 0, 5, 0),
    )
    record_passive_observation(
        store=store_mv,
        params=params,
        observation=bn_obs,
        annualized_funding_bps_history=hist_30,
        evaluation_time_utc=_utc(2026, 11, 24, 0, 5, 10),
    )
    mv_replay = run_independent_offline_replay(store=store_mv, params=params)
    assert mv_replay.passive_data_replay_verified is True
    assert mv_replay.matched_records == 2
    assert mv_replay.execution_parity_verified is False

    # Manual borrow APR assumption is explicitly tagged and rejected from real 90d clock
    from verification_lab.oos.pipeline import BORROW_SOURCE_MANUAL_ASSUMPTION

    store_manual = AppendOnlyEvidenceStore(tmp_path / "manual_borrow")
    rec_manual = record_passive_observation(
        store=store_manual,
        params=params,
        observation=bn_obs,
        annualized_funding_bps_history=hist_30,
        evaluation_time_utc=_utc(2026, 11, 24, 0, 5, 10),
        borrow_apr_source=BORROW_SOURCE_MANUAL_ASSUMPTION,
    )
    assert rec_manual.eligibility_status == "REJECTED"
    assert any("non_venue_borrow_apr_source" in r for r in rec_manual.rejection_reasons)
    clock_manual = evaluate_store_prospective_clock(
        store=store_manual, params=params, as_of_utc=_utc(2026, 11, 24, 0, 5, 10)
    )
    assert clock_manual.eligible_observation_days == 0

