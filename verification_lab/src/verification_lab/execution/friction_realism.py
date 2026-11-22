"""Decomposed execution friction realism and G6 parity assessment.

Explicitly separates all eleven execution friction terms with provenance
labels (MEASURED / VENUE_PUBLISHED / ASSUMED / UNAVAILABLE), distinguishes
``MAKER_FEE_MULTIPLIER_2X`` from ``FULL_EXECUTION_FRICTION_STRESS_2X``, and
flags Hyperliquid L1 quote calibration (n=19 observations) as statistically
insufficient without fabricating calibration.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal
from enum import Enum
from typing import Any

from verification_lab.execution.borrow_liquidation_model import (
    BINANCE_V2_SCHEDULE,
    HYPERLIQUID_V2_SCHEDULE,
)


class FrictionProvenance(str, Enum):
    MEASURED = "MEASURED"
    VENUE_PUBLISHED = "VENUE_PUBLISHED"
    ASSUMED = "ASSUMED"
    UNAVAILABLE = "UNAVAILABLE"


MIN_STATISTICAL_L1_OBSERVATIONS = 1000
DELAYED_HEDGE_LIQUIDATION_SHOCK_PCT = Decimal("0.195")
DELAYED_HEDGE_INITIAL_MARGIN_RATIO = Decimal("0.20")


@dataclass(frozen=True)
class FrictionTermAudit:
    term: str
    provenance: str
    scaled_by_cost_multiplier: bool
    calibration_basis: str
    limitation: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_execution_friction_audit(
    *,
    hl_l1_observation_count: int = 19,
    observed_scenarios: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Produce honest 11-term friction audit and G6 parity status."""
    l1_calibrated = hl_l1_observation_count >= MIN_STATISTICAL_L1_OBSERVATIONS
    bin_mmr_pct = BINANCE_V2_SCHEDULE.maintenance_margin_rate * Decimal("100")
    hl_mmr_pct = HYPERLIQUID_V2_SCHEDULE.maintenance_margin_rate * Decimal("100")
    shock_pct = DELAYED_HEDGE_LIQUIDATION_SHOCK_PCT * Decimal("100")
    init_margin_pct = DELAYED_HEDGE_INITIAL_MARGIN_RATIO * Decimal("100")

    l1_comparison = (
        f">={MIN_STATISTICAL_L1_OBSERVATIONS}"
        if l1_calibrated
        else f"<{MIN_STATISTICAL_L1_OBSERVATIONS}"
    )

    terms: list[FrictionTermAudit] = [
        FrictionTermAudit(
            term="maker_fees",
            provenance=FrictionProvenance.VENUE_PUBLISHED.value,
            scaled_by_cost_multiplier=True,
            calibration_basis=(
                f"Binance VIP0 ({BINANCE_V2_SCHEDULE.spot_maker_fee_bps:.1f} bps spot / "
                f"{BINANCE_V2_SCHEDULE.perp_maker_fee_bps:.1f} bps perp); "
                f"Hyperliquid Tier-0 ({HYPERLIQUID_V2_SCHEDULE.spot_maker_fee_bps:.1f} bps spot / "
                f"{HYPERLIQUID_V2_SCHEDULE.perp_maker_fee_bps:.1f} bps perp)."
            ),
            limitation="Tiered fee rebates or VIP changes are not dynamically modeled.",
        ),
        FrictionTermAudit(
            term="taker_fallback_fees",
            provenance=FrictionProvenance.VENUE_PUBLISHED.value,
            scaled_by_cost_multiplier=False,
            calibration_basis=(
                f"Binance {BINANCE_V2_SCHEDULE.emergency_taker_fee_bps:.1f} bps perp taker; "
                f"Hyperliquid {HYPERLIQUID_V2_SCHEDULE.emergency_taker_fee_bps:.1f} bps perp taker."
            ),
            limitation=(
                "Not multiplied by cost_multiplier in borrow_liquidation_model; "
                "emergency_taker_fee_bps is applied only inside liquidation_penalty_cost when liquidation_triggered is True."
            ),
        ),
        FrictionTermAudit(
            term="bid_ask_spread",
            provenance=FrictionProvenance.UNAVAILABLE.value,
            scaled_by_cost_multiplier=False,
            calibration_basis=(
                f"Historical continuous L1/L2 spread series unavailable; Hyperliquid L1 snapshot has only "
                f"n={hl_l1_observation_count} observations."
            ),
            limitation="Cannot calibrate historical bid/ask spread across 2021-2026 regime changes.",
        ),
        FrictionTermAudit(
            term="slippage",
            provenance=FrictionProvenance.UNAVAILABLE.value,
            scaled_by_cost_multiplier=False,
            calibration_basis="No historical execution fill log or L2 order-book depth replay.",
            limitation="Not included in MAKER_FEE_MULTIPLIER_2X.",
        ),
        FrictionTermAudit(
            term="market_impact",
            provenance=FrictionProvenance.UNAVAILABLE.value,
            scaled_by_cost_multiplier=False,
            calibration_basis="No empirical order-flow impact calibration on target venues.",
            limitation="Square-root impact is uncalibrated for Hyperliquid spot/perp books.",
        ),
        FrictionTermAudit(
            term="queue_position_uncertainty",
            provenance=FrictionProvenance.ASSUMED.value,
            scaled_by_cost_multiplier=False,
            calibration_basis=(
                f"Assumed fifo_fill_probability=0.55; Hyperliquid L1 sample size "
                f"n={hl_l1_observation_count} ({l1_comparison} minimum observations)."
            ),
            limitation=(
                f"Queue-fill calibration from n={hl_l1_observation_count} L1 observations "
                "is statistically insufficient without an independent statistical justification."
                if not l1_calibrated
                else "Queue-fill probability remains parametric rather than empirical order-level replay."
            ),
        ),
        FrictionTermAudit(
            term="partial_fills",
            provenance=FrictionProvenance.UNAVAILABLE.value,
            scaled_by_cost_multiplier=False,
            calibration_basis="No empirical partial-fill distribution recorded.",
            limitation="Modeled structurally in double-entry journal, not empirically calibrated.",
        ),
        FrictionTermAudit(
            term="single_leg_miss",
            provenance=FrictionProvenance.ASSUMED.value,
            scaled_by_cost_multiplier=False,
            calibration_basis=(
                f"Deterministic adverse-move liquidation breach scenario ({shock_pct:.1f}% adverse jump "
                f"on delayed hedge at {init_margin_pct:.1f}% initial margin vs {hl_mmr_pct:.2f}% HL MMR)."
            ),
            limitation="Probability of single-leg miss during volatility spikes is assumed, not measured.",
        ),
        FrictionTermAudit(
            term="borrow_financing",
            provenance=FrictionProvenance.ASSUMED.value,
            scaled_by_cost_multiplier=False,
            calibration_basis="Parametric 5% APR and 10% APR stress scenarios.",
            limitation="Actual venue borrow rates spike non-linearly during high positive funding regimes.",
        ),
        FrictionTermAudit(
            term="funding",
            provenance=FrictionProvenance.MEASURED.value,
            scaled_by_cost_multiplier=False,
            calibration_basis="Historical 8h Binance and 1h Hyperliquid funding rate time series.",
            limitation="Local Parquet provenance is HASH_RECORDED_UNVERIFIED without external trusted manifest.",
        ),
        FrictionTermAudit(
            term="liquidation_costs",
            provenance=FrictionProvenance.VENUE_PUBLISHED.value,
            scaled_by_cost_multiplier=False,
            calibration_basis=(
                f"Modeled maintenance margin ratios ({bin_mmr_pct:.2f}% Binance / "
                f"{hl_mmr_pct:.2f}% HL) and {HYPERLIQUID_V2_SCHEDULE.liquidation_penalty_bps:.1f} bps "
                "liquidation penalty plus emergency taker fee."
            ),
            limitation="Insurance-fund / ADL / cascade slippage beyond nominal penalty is uncalibrated.",
        ),
    ]

    unavailable_terms = [
        t.term for t in terms if t.provenance == FrictionProvenance.UNAVAILABLE.value
    ]
    full_friction_calibrated = len(unavailable_terms) == 0 and l1_calibrated
    g6_status = (
        "G6_FULL_EXECUTION_PARITY_VERIFIED"
        if full_friction_calibrated
        else "G6_FULL_EXECUTION_PARITY_NOT_VERIFIED"
    )

    return {
        "g6_full_execution_parity_status": g6_status,
        "hyperliquid_l1_observation_count": hl_l1_observation_count,
        "hyperliquid_l1_calibration_confidence": (
            "SUFFICIENT"
            if l1_calibrated
            else f"INSUFFICIENT_SAMPLE_N{hl_l1_observation_count}"
        ),
        "cost_concepts": {
            "MAKER_FEE_MULTIPLIER_2X": {
                "description": (
                    "Multiplies only modeled maker entry/exit fees by 2x. "
                    "Does NOT double spread, slippage, market impact, queue uncertainty, "
                    "partial fills, borrow financing, or liquidation costs."
                ),
                "terms_scaled": [t.term for t in terms if t.scaled_by_cost_multiplier],
            },
            "FULL_EXECUTION_FRICTION_STRESS_2X": {
                "description": (
                    "Would require doubling all measured/calibrated execution friction terms "
                    "(maker/taker fees, spread, slippage, market impact, queue-miss cost, "
                    "partial-fill cost, borrow, and liquidation cost)."
                ),
                "calibrated": full_friction_calibrated,
                "unavailable_terms": unavailable_terms,
                "status": g6_status,
            },
        },
        "friction_terms": [t.to_dict() for t in terms],
        "retained_observed_scenarios": observed_scenarios or {},
    }
