"""Integrated passive prospective OOS pipeline for H3_BASIS_CARRY_V2.

Connects:
- Causal timing enforcement (causal_timing.py)
- Append-only hash-chained local evidence store (evidence_store.py)
- Read-only frozen V2 signal evaluator (frozen_evaluator.py)
- Existing fail-closed OOS validator (prospective_observation.py)
- Independent offline replay engine (offline_replay.py)
- Separate G6 microstructure diagnostics (microstructure_diagnostics.py)

Hard authority invariants:
- Completed executed V2 paper trades MUST remain 0.
- Synthetic fixture sequences NEVER count toward real prospective eligible days.
- G13 remains UNTOUCHED and G15 remains HARD-LOCKED.
"""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from verification_lab.oos.adapters import NormalizedMarketObservation, RawCaptureEnvelope
from verification_lab.oos.causal_timing import (
    CausalTimestamps,
    format_utc_iso,
    validate_causal_observation_window,
)
from verification_lab.oos.evidence_store import (
    AppendOnlyEvidenceStore,
    HISTORICAL_PARQUET_PROVENANCE,
    LOCAL_INTEGRITY_FAILED,
    LOCAL_INTEGRITY_INTACT,
    LedgerRecord,
    NORMALIZED_NOT_REPRODUCED,
    NORMALIZED_REPRODUCIBLE,
    SOURCE_AUTHENTICITY_LOCAL_CAPTURE,
    canonical_json_bytes,
)
from verification_lab.oos.frozen_evaluator import (
    FrozenV2Parameters,
    evaluate_frozen_v2_signal,
    validate_theoretical_exposure_shape,
)
from verification_lab.oos.microstructure_diagnostics import (
    G6_PARITY_STATUS,
    compute_g6_microstructure_diagnostics,
)
from verification_lab.oos.offline_replay import run_independent_offline_replay
from verification_lab.oos.prospective_observation import (
    DailyObservationRecord,
    MissingDataStatus,
    PROSPECTIVE_START_UTC,
    REQUIRED_ELIGIBLE_OBSERVATION_DAYS,
    evaluate_prospective_window_progress,
    validate_daily_observation,
)

TRANSITION_STATES: frozenset[str] = frozenset(
    {
        "THEORETICAL_ENTRY_LONG_SPOT_SHORT_PERP",
        "THEORETICAL_EXIT",
    }
)
BORROW_SOURCE_VENUE_OBSERVED = "VENUE_OBSERVED"
BORROW_SOURCE_MANUAL_ASSUMPTION = "MANUAL_ASSUMPTION_NOT_VENUE_OBSERVED"


@dataclass(frozen=True)
class ProspectiveClockSummary:
    strategy_id: str
    frozen_spec_sha256: str
    as_of_utc: str
    prospective_start_utc: str
    calendar_days_elapsed: int
    actual_captured_observation_days: int
    eligible_observation_days: int
    required_eligible_observation_days: int
    rejected_observation_days: int
    missing_days: int
    conflicted_days_excluded: list[str]
    synthetic_fixture_days_excluded: int
    completed_executed_paper_trades: int
    theoretical_entry_exit_signal_transitions: int
    clock_complete: bool
    real_g5_or_g13_pass_granted: bool
    paper_forward_allowed: bool
    live_order_authority: bool
    g6_execution_parity_status: str
    g13_status: str
    g15_status: str
    h3_maker_status: str
    provenance_flags: dict[str, Any]
    chain_intact: bool
    passive_data_replay_verified: bool
    execution_parity_verified: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def record_passive_observation(
    *,
    store: AppendOnlyEvidenceStore,
    params: FrozenV2Parameters,
    observation: NormalizedMarketObservation,
    annualized_funding_bps_history: Sequence[Any],
    raw_envelopes_metadata: Sequence[Mapping[str, Any]] = (),
    evaluation_time_utc: datetime,
    prospective_start_utc: datetime = PROSPECTIVE_START_UTC,
    prior_theoretical_in_position: bool = False,
    synthetic_fixture: bool = False,
    retroactively_reconstructed: bool = False,
    simulated_fills_represented_as_real: bool = False,
    missing_data_status: str = MissingDataStatus.COMPLETE.value,
    raw_envelopes: Sequence[RawCaptureEnvelope] | None = None,
    annualized_funding_bps_by_day: Sequence[tuple[str, Any]] | None = None,
    borrow_apr_source: str = BORROW_SOURCE_VENUE_OBSERVED,
) -> LedgerRecord:
    """Evaluate a captured observation read-only, validate fail-closed, and append to ledger."""
    eval_iso = format_utc_iso(evaluation_time_utc)
    obs_ts = observation.causal_timestamps
    timestamps = CausalTimestamps(
        market_event_time_utc=str(obs_ts["market_event_time_utc"]),
        exchange_publication_time_utc=obs_ts.get("exchange_publication_time_utc"),
        local_capture_time_utc=str(obs_ts["local_capture_time_utc"]),
        strategy_evaluation_time_utc=eval_iso,
    )

    causal_check = validate_causal_observation_window(
        timestamps=timestamps,
        observation_day_utc=observation.observation_day_utc,
        prospective_start_utc=prospective_start_utc,
    )

    signal = evaluate_frozen_v2_signal(
        params=params,
        spot_price=observation.spot_price,
        perp_price=observation.perp_price,
        annualized_funding_bps_history=annualized_funding_bps_history,
        borrow_apr_bps=observation.borrow_apr_bps,
        prior_theoretical_in_position=prior_theoretical_in_position,
    )

    effective_retroactive = bool(retroactively_reconstructed) or (
        causal_check.capture_classification == "RETROACTIVE_DIAGNOSTIC_ONLY"
    )
    effective_missing_status = (
        MissingDataStatus.RETROACTIVELY_RECONSTRUCTED.value
        if effective_retroactive
        else missing_data_status
    )

    envelope_meta = (
        [e.metadata_dict() for e in raw_envelopes]
        if raw_envelopes
        else list(raw_envelopes_metadata)
    )
    raw_venue_tuples = (
        [(e.raw_source_id, e.endpoint_url, e.raw_bytes) for e in raw_envelopes]
        if raw_envelopes
        else None
    )

    # Preserve canonical raw bundle alongside verbatim venue HTTP response files so
    # independent offline replay can verify raw venue bytes AND signal arithmetic.
    raw_bundle: dict[str, Any] = {
        "venue": observation.venue,
        "instrument": observation.instrument,
        "observation_day_utc": observation.observation_day_utc,
        "spot_price": observation.spot_price,
        "perp_price": observation.perp_price,
        "basis_bps": observation.basis_bps,
        "borrow_apr_bps": observation.borrow_apr_bps,
        "borrow_apr_source": borrow_apr_source,
        "annualized_funding_bps": observation.annualized_funding_bps,
        "annualized_funding_bps_history": [str(x) for x in annualized_funding_bps_history],
        "data_completeness": observation.data_completeness,
        "missing_data_status": effective_missing_status,
        "source_envelopes": envelope_meta,
        "causal_timestamps": timestamps.to_dict(),
    }
    if annualized_funding_bps_by_day is not None:
        raw_bundle["annualized_funding_bps_by_day"] = [
            [str(day), str(val)] for day, val in annualized_funding_bps_by_day
        ]
    raw_bytes = canonical_json_bytes(raw_bundle)

    normalized_payload = {
        "market_observation": observation.to_dict(),
        "causal_timestamps": timestamps.to_dict(),
        "causal_timing_check": causal_check.to_dict(),
        "signal_output": signal.to_dict(),
        "borrow_apr_source": borrow_apr_source,
        "missing_data_status": effective_missing_status,
        "retroactively_reconstructed": effective_retroactive,
        "simulated_fills_represented_as_real": bool(simulated_fills_represented_as_real),
    }

    rejection_reasons: list[str] = []
    if not causal_check.valid:
        rejection_reasons.extend(causal_check.reasons)

    exposure_errors = validate_theoretical_exposure_shape(signal.theoretical_two_leg_exposure)
    rejection_reasons.extend(exposure_errors)

    if not signal.evaluable:
        rejection_reasons.append("signal_not_evaluable_missing_data")

    if annualized_funding_bps_by_day is not None:
        seen_days = [str(day) for day, _ in annualized_funding_bps_by_day]
        if len(seen_days) != len(set(seen_days)):
            rejection_reasons.append("duplicate_utc_days_in_lookback_history")

    if borrow_apr_source != BORROW_SOURCE_VENUE_OBSERVED and not synthetic_fixture:
        rejection_reasons.append(f"non_venue_borrow_apr_source ({borrow_apr_source})")

    if synthetic_fixture:
        rejection_reasons.append("synthetic_fixture_excluded_from_real_prospective_clock")

    # Delegate core contract validation to existing prospective_observation.py validator.
    raw_sha = hashlib.sha256(raw_bytes).hexdigest()
    avail_iso = causal_check.available_at_utc or timestamps.available_at_utc()
    contract_record = DailyObservationRecord(
        utc_observation_timestamp=eval_iso,
        available_at_utc=avail_iso,
        raw_source_uri_or_id=observation.source_request_ids[0] if observation.source_request_ids else "",
        source_hash=raw_sha,
        data_completeness=observation.data_completeness,
        frozen_spec_sha256=params.frozen_spec_sha256,
        signal_emitted_from_frozen_spec=signal.to_dict(),
        theoretical_exposure_under_explicit_assumptions=signal.theoretical_two_leg_exposure,
        funding_and_basis_observations={
            "venue": observation.venue,
            "instrument": observation.instrument,
            "basis_bps": observation.basis_bps,
            "annualized_funding_bps": observation.annualized_funding_bps,
            "borrow_apr_bps": observation.borrow_apr_bps,
        },
        missing_data_status=effective_missing_status,
        independent_offline_replay_check=True,  # Verified independently after append via run_independent_offline_replay
        simulated_fills_represented_as_real=simulated_fills_represented_as_real,
        retroactively_reconstructed=effective_retroactive,
    )
    contract_result = validate_daily_observation(
        contract_record,
        expected_frozen_spec_sha256=params.frozen_spec_sha256,
        prospective_start_utc=prospective_start_utc,
    )
    for reason in contract_result.rejection_reasons:
        if reason not in rejection_reasons:
            rejection_reasons.append(reason)

    eligibility_status = "ELIGIBLE" if len(rejection_reasons) == 0 else "REJECTED"
    record_id = f"{observation.observation_day_utc}_{observation.venue}_{observation.instrument}_{raw_sha[:12]}"

    return store.append_record(
        record_id=record_id,
        strategy_id=params.strategy_id,
        observation_day_utc=observation.observation_day_utc,
        captured_at_utc=timestamps.local_capture_time_utc,
        available_at_utc=avail_iso,
        venue=observation.venue,
        instrument=observation.instrument,
        raw_source_id=contract_record.raw_source_uri_or_id,
        raw_bytes=raw_bytes,
        normalized_observation=normalized_payload,
        frozen_spec_sha256=params.frozen_spec_sha256,
        eligibility_status=eligibility_status,
        rejection_reasons=rejection_reasons,
        offline_replay_result=None,
        source_authenticity_status=SOURCE_AUTHENTICITY_LOCAL_CAPTURE,
        reproducibility_status=NORMALIZED_REPRODUCIBLE if signal.evaluable else NORMALIZED_NOT_REPRODUCED,
        synthetic_fixture=synthetic_fixture,
        raw_venue_envelopes=raw_venue_tuples,
    )


def evaluate_store_prospective_clock(
    *,
    store: AppendOnlyEvidenceStore,
    params: FrozenV2Parameters,
    as_of_utc: datetime,
    prospective_start_utc: datetime = PROSPECTIVE_START_UTC,
) -> ProspectiveClockSummary:
    """Compute fail-closed 90-day prospective clock metrics integrating chain + replay + contract validator."""
    chain_report = store.verify_chain()
    replay_report = run_independent_offline_replay(store=store, params=params)
    replay_by_id = {c["record_id"]: c for c in replay_report.comparisons}

    as_of = as_of_utc.astimezone(timezone.utc)
    start_dt = prospective_start_utc.astimezone(timezone.utc)
    calendar_days_elapsed = max(0, (as_of.date() - start_dt.date()).days)
    start_day_iso = start_dt.date().isoformat()
    as_of_day_iso = as_of.date().isoformat()

    records = store.list_records() if chain_report.intact else []
    real_contract_records: list[DailyObservationRecord] = []
    captured_real_days: set[str] = set()
    synthetic_days: set[str] = set()
    eligible_obs_days: set[str] = set()
    rejected_obs_days: set[str] = set()
    theoretical_transitions = 0

    for rec in records:
        obs_day = str(rec.get("observation_day_utc", ""))
        norm = rec.get("normalized_observation", {})
        sig = norm.get("signal_output", {})

        if rec.get("synthetic_fixture", False):
            if obs_day:
                synthetic_days.add(obs_day)
            continue

        if sig.get("signal_state") in TRANSITION_STATES:
            theoretical_transitions += 1

        if obs_day:
            captured_real_days.add(obs_day)

        replay_entry = replay_by_id.get(str(rec.get("record_id", "")), {})
        replay_ok = bool(replay_entry.get("matched", False)) and chain_report.intact
        mkt = norm.get("market_observation", {})
        exp = sig.get("theoretical_two_leg_exposure", {})
        exp_valid = len(validate_theoretical_exposure_shape(exp)) == 0
        causal_ts = norm.get("causal_timestamps") or mkt.get("causal_timestamps") or {}
        eval_ts = str(causal_ts.get("strategy_evaluation_time_utc") or rec.get("captured_at_utc", ""))
        causal_check = norm.get("causal_timing_check") or {}

        contract_rec = DailyObservationRecord(
            utc_observation_timestamp=eval_ts,
            available_at_utc=str(rec.get("available_at_utc", "")),
            raw_source_uri_or_id=str(rec.get("raw_source_id", "")),
            source_hash=str(rec.get("raw_sha256", "")),
            data_completeness=float(mkt.get("data_completeness", 0.0)),
            frozen_spec_sha256=str(rec.get("frozen_spec_sha256", "")),
            signal_emitted_from_frozen_spec=sig if sig.get("evaluable") else {},
            theoretical_exposure_under_explicit_assumptions=exp if exp_valid else {},
            funding_and_basis_observations={
                "basis_bps": mkt.get("basis_bps"),
                "annualized_funding_bps": mkt.get("annualized_funding_bps"),
            },
            missing_data_status=str(norm.get("missing_data_status", MissingDataStatus.MISSING_DAY.value)),
            independent_offline_replay_check=replay_ok,
            simulated_fills_represented_as_real=bool(norm.get("simulated_fills_represented_as_real", False)),
            retroactively_reconstructed=bool(norm.get("retroactively_reconstructed", False)),
        )
        real_contract_records.append(contract_rec)

        contract_res = validate_daily_observation(
            contract_rec,
            expected_frozen_spec_sha256=params.frozen_spec_sha256,
            prospective_start_utc=prospective_start_utc,
        )
        record_eligible = (
            chain_report.intact
            and replay_ok
            and rec.get("eligibility_status") == "ELIGIBLE"
            and causal_check.get("valid") is True
            and contract_res.eligible_for_90d_clock
            and bool(obs_day)
            and obs_day >= start_day_iso
            and obs_day <= as_of_day_iso
        )
        if record_eligible:
            eligible_obs_days.add(obs_day)
        elif obs_day:
            rejected_obs_days.add(obs_day)

    # Invoke the existing window progress validator to preserve full contract enforcement
    # (including hard-zero completed_round_trips invariant).
    _ = evaluate_prospective_window_progress(
        real_contract_records,
        expected_frozen_spec_sha256=params.frozen_spec_sha256,
        completed_round_trips=0,  # Hard invariant: zero executed V2 paper trades under passive authority
        prospective_start_utc=prospective_start_utc,
    )

    conflicted_days = sorted(eligible_obs_days & rejected_obs_days)
    net_eligible_days = eligible_obs_days - rejected_obs_days
    eligible_days = len(net_eligible_days) if chain_report.intact else 0
    captured_in_window = {
        d for d in captured_real_days if start_day_iso <= d <= as_of_day_iso
    }
    missing_days = max(0, calendar_days_elapsed - len(captured_in_window))

    return ProspectiveClockSummary(
        strategy_id=params.strategy_id,
        frozen_spec_sha256=params.frozen_spec_sha256,
        as_of_utc=format_utc_iso(as_of),
        prospective_start_utc=format_utc_iso(start_dt),
        calendar_days_elapsed=calendar_days_elapsed,
        actual_captured_observation_days=len(captured_real_days),
        eligible_observation_days=eligible_days,
        required_eligible_observation_days=REQUIRED_ELIGIBLE_OBSERVATION_DAYS,
        rejected_observation_days=len(rejected_obs_days),
        missing_days=missing_days,
        conflicted_days_excluded=conflicted_days,
        synthetic_fixture_days_excluded=len(synthetic_days),
        completed_executed_paper_trades=0,
        theoretical_entry_exit_signal_transitions=theoretical_transitions,
        clock_complete=(eligible_days >= REQUIRED_ELIGIBLE_OBSERVATION_DAYS) and chain_report.intact,
        real_g5_or_g13_pass_granted=False,
        paper_forward_allowed=False,
        live_order_authority=False,
        g6_execution_parity_status=G6_PARITY_STATUS,
        g13_status="UNTOUCHED",
        g15_status="HARD-LOCKED",
        h3_maker_status="QUARANTINED",
        provenance_flags={
            "source_captured": len(records) > 0,
            "file_internally_intact": chain_report.intact,
            "local_integrity_status": LOCAL_INTEGRITY_INTACT if chain_report.intact else LOCAL_INTEGRITY_FAILED,
            "historical_parquet_provenance": HISTORICAL_PARQUET_PROVENANCE,
            "historical_source_independently_authenticated": False,
            "live_source_authenticity_status": SOURCE_AUTHENTICITY_LOCAL_CAPTURE,
            "normalized_output_reproducible": replay_report.passive_data_replay_verified,
        },
        chain_intact=chain_report.intact,
        passive_data_replay_verified=replay_report.passive_data_replay_verified,
        execution_parity_verified=False,
    )


def build_g6_diagnostics_from_store(
    store: AppendOnlyEvidenceStore,
    *,
    include_synthetic: bool = False,
    include_rejected: bool = False,
) -> dict[str, Any]:
    """Run separate G6 microstructure diagnostics over verified real eligible observations by default."""
    chain_report = store.verify_chain()
    records = store.list_records() if chain_report.intact else []
    market_obs: list[dict[str, Any]] = []
    excluded_synthetic = 0
    excluded_rejected = 0

    for rec in records:
        if rec.get("synthetic_fixture", False) and not include_synthetic:
            excluded_synthetic += 1
            continue
        if rec.get("eligibility_status") != "ELIGIBLE" and not include_rejected:
            excluded_rejected += 1
            continue
        mkt = rec.get("normalized_observation", {}).get("market_observation")
        if isinstance(mkt, dict):
            market_obs.append(mkt)

    report = compute_g6_microstructure_diagnostics(market_obs).to_dict()
    report["chain_intact"] = chain_report.intact
    report["excluded_synthetic_records"] = excluded_synthetic
    report["excluded_rejected_records"] = excluded_rejected
    return report
