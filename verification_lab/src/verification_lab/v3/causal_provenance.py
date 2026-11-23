"""Fail-closed causal timing and data provenance validator for H3_CASH_FUNDED_BASIS_CARRY_V3.

Explicitly closes both CASHCLAW #27 P1 findings:
  - P1-A: Rejects mixed 1d / intraday granularity misalignment.
  - P1-B: Bounds composite available_at_utc conservatively by the LATEST defensible
          availability timestamp across all required components (never earlier than any
          component's local capture time when venue publication timestamps are absent).
  - Also rejects oracle-only spot references masquerading as an actual spot order book,
    and refuses to upgrade HASH_RECORDED_UNVERIFIED provenance or fabricate lookback.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum


class ProvenanceStatus(str, Enum):
    """Data provenance classifications; never silently upgraded."""

    TRUSTED_MANIFEST_VERIFIED = "HASH_MATCH_TRUSTED_MANIFEST"
    LOCAL_UNAUTHENTICATED = "SOURCE_CAPTURED_LOCAL_UNAUTHENTICATED"
    HASH_RECORDED_UNVERIFIED = "HASH_RECORDED_UNVERIFIED"
    MISSING_OR_INVALID = "MISSING_OR_INVALID"


@dataclass(frozen=True)
class ComponentTimestamp:
    """Per-input causal timestamp record for a single market-data component."""

    component_name: str
    granularity: str  # e.g., "1d_finalized", "l2_snapshot", "funding_1h", "funding_8h"
    is_spot_order_book: bool
    is_oracle_reference_only: bool
    event_time_utc: datetime | None
    venue_pub_time_utc: datetime | None
    local_capture_time_utc: datetime
    provenance: ProvenanceStatus

    def latest_defensible_available_utc(self) -> datetime:
        """Return the latest defensible UTC timestamp at which this component became available.

        If a venue publication timestamp is missing, local_capture_time_utc is the earliest
        defensible availability bound. Even when venue_pub_time_utc is present, we never
        claim availability before local_capture_time_utc for unauthenticated local captures.
        """
        candidates = [self.local_capture_time_utc]
        if self.event_time_utc is not None:
            candidates.append(self.event_time_utc)
        if self.venue_pub_time_utc is not None:
            candidates.append(self.venue_pub_time_utc)
        return max(candidates)


@dataclass(frozen=True)
class CompositeObservationInput:
    """Composite multi-source observation submitted to V3 causal validation."""

    observation_id: str
    declared_bar_granularity: str  # e.g. "1d_finalized" or "1h_aligned"
    evaluation_time_utc: datetime
    claimed_composite_available_utc: datetime | None
    components: tuple[ComponentTimestamp, ...]
    lookback_days_observed: int
    required_lookback_days: int = 30
    max_intraday_component_skew_seconds: int = 10


@dataclass(frozen=True)
class CausalValidationResult:
    """Result of fail-closed V3 causal and provenance validation."""

    valid: bool
    blocking_reasons: tuple[str, ...]
    computed_composite_available_utc: datetime | None
    overall_provenance: ProvenanceStatus
    eligible_for_empirical_claim: bool


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise ValueError(f"Naive datetime not permitted: {dt!r}")
    return dt.astimezone(timezone.utc)


def validate_v3_composite_causality(obs: CompositeObservationInput) -> CausalValidationResult:
    """Validate multi-source temporal causality, granularity alignment, and spot-book integrity."""
    reasons: list[str] = []
    if not obs.components:
        return CausalValidationResult(
            valid=False,
            blocking_reasons=("EMPTY_COMPONENT_SET",),
            computed_composite_available_utc=None,
            overall_provenance=ProvenanceStatus.MISSING_OR_INVALID,
            eligible_for_empirical_claim=False,
        )

    eval_utc = _ensure_utc(obs.evaluation_time_utc)
    component_bounds: list[datetime] = []
    has_actual_spot_book = False
    granularities: set[str] = set()
    provenances: set[ProvenanceStatus] = set()

    for comp in obs.components:
        cap_utc = _ensure_utc(comp.local_capture_time_utc)
        ev_utc = _ensure_utc(comp.event_time_utc) if comp.event_time_utc is not None else None
        pub_utc = _ensure_utc(comp.venue_pub_time_utc) if comp.venue_pub_time_utc is not None else None

        if comp.is_oracle_reference_only:
            reasons.append(f"ORACLE_SPOT_PROXY_REJECTED:{comp.component_name}")
        if comp.is_spot_order_book and not comp.is_oracle_reference_only:
            has_actual_spot_book = True

        if ev_utc is not None and ev_utc > cap_utc:
            reasons.append(f"EVENT_TIME_AFTER_CAPTURE:{comp.component_name}")
        if pub_utc is not None and pub_utc > cap_utc:
            reasons.append(f"VENUE_PUB_AFTER_CAPTURE:{comp.component_name}")

        bound = comp.latest_defensible_available_utc().astimezone(timezone.utc)
        component_bounds.append(bound)
        if bound > eval_utc:
            reasons.append(f"COMPONENT_AVAILABLE_AFTER_EVAL:{comp.component_name}")

        granularities.add(comp.granularity)
        provenances.add(comp.provenance)

    if not has_actual_spot_book:
        reasons.append("MISSING_ACTUAL_SPOT_ORDER_BOOK")

    composite_available_utc = max(component_bounds)

    # Close CASHCLAW #27 P1-B: reject any claimed composite availability earlier than last component.
    if obs.claimed_composite_available_utc is not None:
        claimed_utc = _ensure_utc(obs.claimed_composite_available_utc)
        if claimed_utc < composite_available_utc:
            reasons.append("COMPOSITE_AVAILABLE_PRECEDES_LATEST_COMPONENT")

    if composite_available_utc > eval_utc:
        reasons.append("COMPOSITE_AVAILABLE_AFTER_EVALUATION")

    # Close CASHCLAW #27 P1-A: reject mixed 1d vs intraday snapshot misalignment (both directions).
    if obs.declared_bar_granularity == "1d_finalized":
        non_daily = [g for g in granularities if g != "1d_finalized"]
        if non_daily:
            reasons.append(f"MIXED_GRANULARITY_MISALIGNMENT:{','.join(sorted(non_daily))}")
    else:
        if "1d_finalized" in granularities:
            reasons.append("MIXED_GRANULARITY_MISALIGNMENT:1d_finalized_in_intraday")
        # For aligned intraday snapshots, bound cross-component capture skew.
        skew_seconds = (max(component_bounds) - min(component_bounds)).total_seconds()
        if skew_seconds > obs.max_intraday_component_skew_seconds:
            reasons.append(f"INTRADAY_COMPONENT_SKEW_EXCEEDED:{skew_seconds:.3f}s")

    # Prevent lookback fabrication.
    if obs.lookback_days_observed < obs.required_lookback_days:
        reasons.append(
            f"INSUFFICIENT_LOOKBACK_DAYS:{obs.lookback_days_observed}<{obs.required_lookback_days}"
        )

    # Worst-case provenance governs (never upgrade HASH_RECORDED_UNVERIFIED).
    if ProvenanceStatus.MISSING_OR_INVALID in provenances:
        overall_prov = ProvenanceStatus.MISSING_OR_INVALID
        reasons.append("INVALID_PROVENANCE")
    elif ProvenanceStatus.HASH_RECORDED_UNVERIFIED in provenances:
        overall_prov = ProvenanceStatus.HASH_RECORDED_UNVERIFIED
    elif ProvenanceStatus.LOCAL_UNAUTHENTICATED in provenances:
        overall_prov = ProvenanceStatus.LOCAL_UNAUTHENTICATED
    else:
        overall_prov = ProvenanceStatus.TRUSTED_MANIFEST_VERIFIED

    valid = len(reasons) == 0
    eligible_for_empirical = valid and overall_prov == ProvenanceStatus.TRUSTED_MANIFEST_VERIFIED
    return CausalValidationResult(
        valid=valid,
        blocking_reasons=tuple(reasons),
        computed_composite_available_utc=composite_available_utc,
        overall_provenance=overall_prov,
        eligible_for_empirical_claim=eligible_for_empirical,
    )
