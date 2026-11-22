"""Passive prospective OOS observation contract and fail-closed daily validator.

Enforces safe passive market observation from 2026-11-23T00:00:00Z onward while keeping:
- paper_forward_allowed = False
- live_order_authority = False
- G13 untouched and G15 hard-locked
- zero simulated trade execution represented as real fills
- zero retroactive reconstruction of missing days
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Sequence

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
PROSPECTIVE_START_UTC = datetime(2026, 11, 23, 0, 0, 0, tzinfo=timezone.utc)
REQUIRED_ELIGIBLE_OBSERVATION_DAYS = 90
MIN_COMPLETED_ROUND_TRIPS = 15


class MissingDataStatus(str, Enum):
    COMPLETE = "COMPLETE"
    PARTIAL_GAP = "PARTIAL_GAP"
    MISSING_DAY = "MISSING_DAY"
    RETROACTIVELY_RECONSTRUCTED = "RETROACTIVELY_RECONSTRUCTED"


@dataclass(frozen=True)
class DailyObservationRecord:
    utc_observation_timestamp: str
    available_at_utc: str
    raw_source_uri_or_id: str
    source_hash: str
    data_completeness: float
    frozen_spec_sha256: str
    signal_emitted_from_frozen_spec: dict[str, Any]
    theoretical_exposure_under_explicit_assumptions: dict[str, Any]
    funding_and_basis_observations: dict[str, Any]
    missing_data_status: str
    independent_offline_replay_check: bool
    simulated_fills_represented_as_real: bool = False
    retroactively_reconstructed: bool = False


@dataclass(frozen=True)
class ObservationValidationResult:
    eligible_for_90d_clock: bool
    no_use_before_available_time_valid: bool
    rejection_reasons: list[str]
    observation_day_utc: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _parse_utc_iso(ts: str) -> datetime:
    normalized = ts.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        raise ValueError(f"Timestamp must be timezone-aware UTC: {ts!r}")
    return dt.astimezone(timezone.utc)


def validate_daily_observation(
    record: DailyObservationRecord,
    *,
    expected_frozen_spec_sha256: str,
    prospective_start_utc: datetime = PROSPECTIVE_START_UTC,
) -> ObservationValidationResult:
    """Validate one daily passive observation record fail-closed."""
    reasons: list[str] = []
    obs_dt: datetime | None = None
    avail_dt: datetime | None = None

    try:
        obs_dt = _parse_utc_iso(record.utc_observation_timestamp)
    except ValueError as exc:
        reasons.append(f"invalid_utc_observation_timestamp: {exc}")

    try:
        avail_dt = _parse_utc_iso(record.available_at_utc)
    except ValueError as exc:
        reasons.append(f"invalid_available_at_utc: {exc}")

    no_lookahead_ok = False
    if obs_dt is not None and avail_dt is not None:
        if obs_dt < prospective_start_utc:
            reasons.append(
                f"observation_before_prospective_start ({obs_dt.isoformat()} < {prospective_start_utc.isoformat()})"
            )
        if obs_dt < avail_dt:
            reasons.append(
                f"use_before_available_time_violation ({obs_dt.isoformat()} < {avail_dt.isoformat()})"
            )
        else:
            no_lookahead_ok = True

    if not record.raw_source_uri_or_id.strip():
        reasons.append("missing_raw_source_uri_or_id")

    if not SHA256_RE.match(record.source_hash):
        reasons.append("invalid_source_hash_format")

    if not SHA256_RE.match(expected_frozen_spec_sha256):
        reasons.append("invalid_expected_frozen_spec_sha256_format")
    elif record.frozen_spec_sha256 != expected_frozen_spec_sha256:
        reasons.append("frozen_spec_sha256_mismatch")

    if isinstance(record.data_completeness, bool) or not isinstance(
        record.data_completeness, (int, float)
    ):
        reasons.append("data_completeness_invalid_type")
    elif not (0.0 <= record.data_completeness <= 1.0):
        reasons.append("data_completeness_out_of_range")
    elif record.data_completeness < 1.0:
        reasons.append("incomplete_daily_data")

    if not isinstance(record.signal_emitted_from_frozen_spec, dict) or not record.signal_emitted_from_frozen_spec:
        reasons.append("missing_signal_emitted_from_frozen_spec")

    if (
        not isinstance(record.theoretical_exposure_under_explicit_assumptions, dict)
        or not record.theoretical_exposure_under_explicit_assumptions
    ):
        reasons.append("missing_theoretical_exposure_under_explicit_assumptions")

    if (
        not isinstance(record.funding_and_basis_observations, dict)
        or not record.funding_and_basis_observations
    ):
        reasons.append("missing_funding_and_basis_observations")

    if record.simulated_fills_represented_as_real:
        reasons.append("simulated_fills_represented_as_real_forbidden")

    if record.retroactively_reconstructed or (
        record.missing_data_status == MissingDataStatus.RETROACTIVELY_RECONSTRUCTED.value
    ):
        reasons.append("retroactive_reconstruction_forbidden")

    if record.missing_data_status != MissingDataStatus.COMPLETE.value:
        reasons.append(f"missing_data_status_not_complete ({record.missing_data_status})")

    if not record.independent_offline_replay_check:
        reasons.append("independent_offline_replay_check_failed")

    eligible = len(reasons) == 0
    obs_day = obs_dt.date().isoformat() if obs_dt is not None else None
    return ObservationValidationResult(
        eligible_for_90d_clock=eligible,
        no_use_before_available_time_valid=no_lookahead_ok,
        rejection_reasons=reasons,
        observation_day_utc=obs_day,
    )


def evaluate_prospective_window_progress(
    records: Sequence[DailyObservationRecord],
    *,
    expected_frozen_spec_sha256: str,
    completed_round_trips: int = 0,
    prospective_start_utc: datetime = PROSPECTIVE_START_UTC,
) -> dict[str, Any]:
    """Count unique eligible real observation days toward the 90-day prospective clock.

    Fail-closed on same-day conflicts: if any record for a UTC day fails validation
    (e.g., partial gap, retroactive reconstruction, simulated fill, or lookahead),
    that UTC day is excluded from ``eligible_real_observation_days``.
    """
    if isinstance(completed_round_trips, bool) or not isinstance(completed_round_trips, int) or completed_round_trips < 0:
        raise ValueError("completed_round_trips must be a non-negative integer.")

    eligible_days: set[str] = set()
    rejected_days: set[str] = set()
    rejected: list[dict[str, Any]] = []

    for idx, rec in enumerate(records):
        res = validate_daily_observation(
            rec,
            expected_frozen_spec_sha256=expected_frozen_spec_sha256,
            prospective_start_utc=prospective_start_utc,
        )
        if res.eligible_for_90d_clock and res.observation_day_utc is not None:
            eligible_days.add(res.observation_day_utc)
        else:
            if res.observation_day_utc is not None:
                rejected_days.add(res.observation_day_utc)
            rejected.append({"index": idx, **res.to_dict()})

    conflicted_days = sorted(eligible_days & rejected_days)
    net_eligible_days = eligible_days - rejected_days
    n_eligible = len(net_eligible_days)
    clock_complete = n_eligible >= REQUIRED_ELIGIBLE_OBSERVATION_DAYS
    min_trades_reached = completed_round_trips >= MIN_COMPLETED_ROUND_TRIPS
    return {
        "eligible_real_observation_days": n_eligible,
        "conflicted_days_excluded": conflicted_days,
        "required_eligible_observation_days": REQUIRED_ELIGIBLE_OBSERVATION_DAYS,
        "clock_complete": clock_complete,
        "completed_round_trips": completed_round_trips,
        "min_completed_round_trips": MIN_COMPLETED_ROUND_TRIPS,
        "min_round_trips_reached": min_trades_reached,
        "rejected_records_count": len(rejected),
        "rejected_records": rejected,
        "alpha_claim_sufficiency_disclosure": (
            "Completing the minimum 15 round-trip trades over 90 eligible observation days "
            "is a minimum operational gate only and is statistically INSUFFICIENT to support "
            "a general claim of long-term profitable alpha without further out-of-sample "
            "statistical validation and multiple-testing adjustment."
        ),
    }


def build_prospective_observation_contract(
    *,
    original_registration_sha256: str,
    original_frozen_spec_sha256: str,
    erratum_sha256: str,
    commit_sha: str,
    generated_utc: str,
) -> dict[str, Any]:
    """Build the machine-readable passive prospective observation contract artifact."""
    return {
        "contract_version": "1.0.0",
        "strategy_id": "H3_BASIS_CARRY_V2",
        "generated_utc": generated_utc,
        "git_anchor_commit": commit_sha,
        "references": {
            "original_registration_artifact": "artifacts/h3_basis_carry_v2_prospective_oos_registration.json",
            "original_registration_sha256": original_registration_sha256,
            "original_frozen_spec_sha256": original_frozen_spec_sha256,
            "evidence_erratum_artifact": "artifacts/h3_basis_carry_v2_evidence_erratum_v1.json",
            "evidence_erratum_sha256": erratum_sha256,
        },
        "execution_authority_guards": {
            "paper_forward_allowed": False,
            "live_order_authority": False,
            "g13_isolation": "UNTOUCHED",
            "g15_hard_lock": "HARD_LOCKED",
            "h3_maker_quarantine": "PRESERVED",
            "mode": "PASSIVE_MARKET_DATA_OBSERVATION_ONLY",
        },
        "prospective_window": {
            "start_utc": "2026-11-23T00:00:00Z",
            "clock_rule": "COUNT_ELIGIBLE_REAL_OBSERVATIONS_ONLY",
            "required_eligible_observation_days": REQUIRED_ELIGIBLE_OBSERVATION_DAYS,
            "min_completed_round_trips": MIN_COMPLETED_ROUND_TRIPS,
            "retroactive_missing_day_reconstruction_allowed": False,
            "simulated_fills_represented_as_real_allowed": False,
            "statistical_sufficiency_warning": (
                "The 15 completed round-trip minimum is insufficient for a general claim of "
                "long-term profitable alpha without further statistical validation."
            ),
        },
        "daily_evidence_requirements": [
            "utc_observation_timestamp",
            "raw_source_uri_or_id",
            "source_hash",
            "data_completeness",
            "signal_emitted_from_frozen_spec",
            "theoretical_exposure_under_explicit_assumptions",
            "funding_and_basis_observations",
            "missing_data_status",
            "independent_offline_replay_check",
            "no_use_before_available_time_validation",
        ],
        "validator_module": "verification_lab.oos.prospective_observation",
    }
