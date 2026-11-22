"""Tests for the passive prospective OOS observation contract and daily validator."""

from __future__ import annotations

import json
from pathlib import Path

from verification_lab.oos.prospective_observation import (
    DailyObservationRecord,
    MissingDataStatus,
    evaluate_prospective_window_progress,
    validate_daily_observation,
)
from verification_lab.provenance.parquet_attestation import compute_file_sha256

REPO = Path(__file__).resolve().parents[2]
SPEC_SHA = "187e1974069bc1d70950b475804b670a8510a413411652c2c71b1e370b22ee53"
REG_SHA = "c089527416420ac11dfea01a2ad7ca0b18a167ad13bb775575af5b1ef70d0012"


def _valid_record(day: int = 23) -> DailyObservationRecord:
    return DailyObservationRecord(
        utc_observation_timestamp=f"2026-11-{day:02d}T00:05:00Z",
        available_at_utc=f"2026-11-{day:02d}T00:00:00Z",
        raw_source_uri_or_id="binance://public/funding/2026-11-23",
        source_hash="a" * 64,
        data_completeness=1.0,
        frozen_spec_sha256=SPEC_SHA,
        signal_emitted_from_frozen_spec={"action": "FLAT", "funding_annual_bps": 450.0},
        theoretical_exposure_under_explicit_assumptions={"gross_leverage": 0.0, "assumptions": "passive_only"},
        funding_and_basis_observations={"funding_8h": 0.0001, "basis_bps": 4.2},
        missing_data_status=MissingDataStatus.COMPLETE.value,
        independent_offline_replay_check=True,
    )


def test_valid_daily_observation_accepted_for_90d_clock() -> None:
    res = validate_daily_observation(_valid_record(23), expected_frozen_spec_sha256=SPEC_SHA)
    assert res.eligible_for_90d_clock is True
    assert res.no_use_before_available_time_valid is True
    assert res.rejection_reasons == []


def test_lookahead_and_pre_window_and_retroactive_and_simulated_fills_rejected() -> None:
    # 1. Use-before-available-time lookahead
    lookahead = DailyObservationRecord(
        **{**_valid_record(23).__dict__, "utc_observation_timestamp": "2026-11-23T00:00:00Z", "available_at_utc": "2026-11-23T00:05:00Z"}
    )
    r1 = validate_daily_observation(lookahead, expected_frozen_spec_sha256=SPEC_SHA)
    assert r1.eligible_for_90d_clock is False
    assert r1.no_use_before_available_time_valid is False

    # 2. Pre-window observation (before 2026-11-23T00:00:00Z)
    pre = DailyObservationRecord(
        **{**_valid_record(22).__dict__, "utc_observation_timestamp": "2026-11-22T23:59:59Z", "available_at_utc": "2026-11-22T23:00:00Z"}
    )
    r2 = validate_daily_observation(pre, expected_frozen_spec_sha256=SPEC_SHA)
    assert r2.eligible_for_90d_clock is False

    # 3. Retroactive reconstruction of missing day
    retro = DailyObservationRecord(
        **{**_valid_record(24).__dict__, "retroactively_reconstructed": True}
    )
    r3 = validate_daily_observation(retro, expected_frozen_spec_sha256=SPEC_SHA)
    assert r3.eligible_for_90d_clock is False
    assert "retroactive_reconstruction_forbidden" in r3.rejection_reasons

    # 4. Simulated fills represented as real fills
    sim_fill = DailyObservationRecord(
        **{**_valid_record(25).__dict__, "simulated_fills_represented_as_real": True}
    )
    r4 = validate_daily_observation(sim_fill, expected_frozen_spec_sha256=SPEC_SHA)
    assert r4.eligible_for_90d_clock is False
    assert "simulated_fills_represented_as_real_forbidden" in r4.rejection_reasons


def test_90d_clock_counts_only_eligible_real_days_and_discloses_15_trade_insufficiency() -> None:
    recs = [
        _valid_record(23),
        _valid_record(24),
        DailyObservationRecord(**{**_valid_record(25).__dict__, "missing_data_status": MissingDataStatus.MISSING_DAY.value}),
    ]
    progress = evaluate_prospective_window_progress(
        recs, expected_frozen_spec_sha256=SPEC_SHA, completed_round_trips=15
    )
    assert progress["eligible_real_observation_days"] == 2
    assert progress["rejected_records_count"] == 1
    assert progress["clock_complete"] is False
    assert "INSUFFICIENT" in progress["alpha_claim_sufficiency_disclosure"]


def test_same_day_conflicting_records_fail_closed_for_90d_clock() -> None:
    """If a UTC day has both a valid record and a rejected record, exclude that day."""
    valid_day23 = _valid_record(23)
    poisoned_day23 = DailyObservationRecord(
        **{**_valid_record(23).__dict__, "missing_data_status": MissingDataStatus.PARTIAL_GAP.value}
    )
    valid_day24 = _valid_record(24)

    progress = evaluate_prospective_window_progress(
        [valid_day23, poisoned_day23, valid_day24],
        expected_frozen_spec_sha256=SPEC_SHA,
    )
    assert progress["eligible_real_observation_days"] == 1
    assert progress["conflicted_days_excluded"] == ["2026-11-23"]
    assert progress["rejected_records_count"] == 1


def test_boolean_data_completeness_and_invalid_spec_hash_rejected() -> None:
    bool_rec = DailyObservationRecord(
        **{**_valid_record(23).__dict__, "data_completeness": True}  # type: ignore[arg-type]
    )
    res = validate_daily_observation(bool_rec, expected_frozen_spec_sha256=SPEC_SHA)
    assert res.eligible_for_90d_clock is False
    assert "data_completeness_invalid_type" in res.rejection_reasons

    bad_expected = validate_daily_observation(_valid_record(23), expected_frozen_spec_sha256="not-a-sha")
    assert bad_expected.eligible_for_90d_clock is False
    assert "invalid_expected_frozen_spec_sha256_format" in bad_expected.rejection_reasons


def test_committed_erratum_and_observation_contract_cross_link_immutable_registration() -> None:
    reg_path = REPO / "artifacts" / "h3_basis_carry_v2_prospective_oos_registration.json"
    err_path = REPO / "artifacts" / "h3_basis_carry_v2_evidence_erratum_v1.json"
    con_path = REPO / "artifacts" / "h3_basis_carry_v2_prospective_observation_contract.json"

    assert compute_file_sha256(reg_path) == REG_SHA

    err = json.loads(err_path.read_text(encoding="utf-8"))
    con = json.loads(con_path.read_text(encoding="utf-8"))

    assert err["original_registration_reference"]["exact_sha256"] == REG_SHA
    assert err["original_registration_reference"]["original_frozen_spec_sha256"] == SPEC_SHA
    assert err["safety_invariants"]["paper_forward_allowed"] is False
    assert err["safety_invariants"]["live_order_authority"] is False
    assert err["execution_cost_realism"]["g6_full_execution_parity_status"] == "G6_FULL_EXECUTION_PARITY_NOT_VERIFIED"

    assert con["references"]["original_registration_sha256"] == REG_SHA
    assert con["references"]["original_frozen_spec_sha256"] == SPEC_SHA
    assert con["references"]["evidence_erratum_sha256"] == compute_file_sha256(err_path)
    assert con["execution_authority_guards"]["paper_forward_allowed"] is False
    assert con["execution_authority_guards"]["live_order_authority"] is False
    assert len(con["daily_evidence_requirements"]) == 10
