"""Methodological audit of the empirical permutation control for H3_MAKER.

Preserves the historical numerical result (p = 0.00999 across 1,000 draws on
historical H3_MAKER data) while explicitly auditing equivalence across ten
statistical and economic dimensions, documenting 185-trial family selection
bias, and separating HISTORICAL_H3_MAKER_DIAGNOSTIC from
H3_BASIS_CARRY_V2_PROSPECTIVE_OOS.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class DimensionAudit:
    dimension: str
    equivalent: bool
    observed_strategy_treatment: str
    null_control_treatment: str
    impact_on_p_value: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def audit_empirical_permutation_control(
    *,
    observed_sharpe: float,
    empirical_p_value: float,
    exceed_count: int,
    n_controls: int,
    n_active_days: int,
    total_days: int,
    seed: int = 20261122,
    prior_family_trials: int = 185,
) -> dict[str, Any]:
    """Audit equivalence between observed H3_MAKER and randomized-entry null."""
    dimensions: list[DimensionAudit] = [
        DimensionAudit(
            dimension="instruments_and_exposure",
            equivalent=False,
            observed_strategy_treatment="Signal-filtered subset of perp/spot carry pairs with regime gating.",
            null_control_treatment="Unconditioned equal-weight average across all available carry pairs on each sampled day.",
            impact_on_p_value="Null mixes instruments not held by the strategy, altering cross-sectional variance.",
        ),
        DimensionAudit(
            dimension="holding_period_distribution",
            equivalent=False,
            observed_strategy_treatment="Multi-day persistent carry positions held across consecutive positive-funding regimes.",
            null_control_treatment="Independent single-day draws without replacement (no contiguous holding-period blocks).",
            impact_on_p_value="Destroys multi-day holding structure and serial carry clustering.",
        ),
        DimensionAudit(
            dimension="turnover",
            equivalent=False,
            observed_strategy_treatment="Explicit entry/exit turnover driven by signal transitions.",
            null_control_treatment="Zero turnover modeling on sampled daily returns.",
            impact_on_p_value="Null is not penalized for random entry/exit churn.",
        ),
        DimensionAudit(
            dimension="fees",
            equivalent=False,
            observed_strategy_treatment="Observed H3_MAKER Sharpe is net of modeled maker fees.",
            null_control_treatment="Null samples gross equal-weight carry returns with zero entry/exit fees.",
            impact_on_p_value="Asymmetric fee treatment prevents apples-to-apples Sharpe comparison.",
        ),
        DimensionAudit(
            dimension="borrow_costs",
            equivalent=False,
            observed_strategy_treatment="Historical H3_MAKER omitted spot borrow financing (V2 adds 5%/10% APR borrow).",
            null_control_treatment="Zero borrow financing applied in null control.",
            impact_on_p_value="Cannot validate V2 alpha under positive borrow costs.",
        ),
        DimensionAudit(
            dimension="funding_convention",
            equivalent=True,
            observed_strategy_treatment="Daily summed 8h Binance funding accrual on short perp leg.",
            null_control_treatment="Same daily summed funding series used to construct carry_ret.",
            impact_on_p_value="Consistent funding series source.",
        ),
        DimensionAudit(
            dimension="asset_selection_policy",
            equivalent=False,
            observed_strategy_treatment="Top-carry / funding-threshold asset selection rule.",
            null_control_treatment="Uniform equal-weight across all pairs regardless of funding rank.",
            impact_on_p_value="Tests combined selection + timing vs unconditioned universe rather than pure timing null.",
        ),
        DimensionAudit(
            dimension="active_day_fraction",
            equivalent=True,
            observed_strategy_treatment=f"{n_active_days} active days out of {total_days} total days.",
            null_control_treatment=f"Draws exactly n_active={n_active_days} days per permutation.",
            impact_on_p_value="Matches active-day count only.",
        ),
        DimensionAudit(
            dimension="risk_normalization",
            equivalent=False,
            observed_strategy_treatment=(
                "Annualized Sharpe over full calendar equity curve where build_positions_maker "
                "(p_fill=0.55) scales gross exposure below 1.0 during partial-fill entry/exit ramps."
            ),
            null_control_treatment=(
                "Annualized Sharpe over full zero-padded calendar vector applying full 1.0 unit "
                "equal-weight gross exposure on every sampled active day."
            ),
            impact_on_p_value=(
                "Time-varying partial-fill exposure vs full-unit exposure changes return variance "
                "and drawdown scaling across active days, preventing strict risk-normalized parity."
            ),
        ),
        DimensionAudit(
            dimension="time_series_dependency_preservation",
            equivalent=False,
            observed_strategy_treatment="Autocorrelated funding and volatility clusters.",
            null_control_treatment="i.i.d. day sampling without block bootstrap or stationary bootstrap.",
            impact_on_p_value="Understates variance of null Sharpe under positive funding autocorrelation.",
        ),
    ]

    non_equivalent = [d.dimension for d in dimensions if not d.equivalent]
    apples_to_apples = len(non_equivalent) == 0

    return {
        "evidence_scope": "HISTORICAL_H3_MAKER_DIAGNOSTIC",
        "prospective_v2_oos_scope": "H3_BASIS_CARRY_V2_PROSPECTIVE_OOS",
        "valid_as_v2_alpha_proof": False,
        "apples_to_apples_null_verified": apples_to_apples,
        "inferential_status": (
            "APPLES_TO_APPLES_VERIFIED"
            if apples_to_apples
            else "DIAGNOSTIC_ONLY_NON_EQUIVALENT_NULL_DOWNGRADED"
        ),
        "preserved_numerical_result": {
            "observed_sharpe": round(float(observed_sharpe), 6),
            "empirical_p_value": round(float(empirical_p_value), 6),
            "exceed_count": int(exceed_count),
            "n_controls": int(n_controls),
            "n_active_days": int(n_active_days),
            "total_days": int(total_days),
            "seed": int(seed),
            "dataset_origin": "HISTORICAL_H3_MAKER_BACKTEST_NOT_FRESH_V2_OOS",
        },
        "multiple_testing_lineage": {
            "prior_family_research_trials": prior_family_trials,
            "v2_trial_seq": 1,
            "cumulative_family_trials": prior_family_trials + 1,
            "family_selection_bias_note": (
                f"H3_BASIS_CARRY_V2 is registered with trial_seq=1 for its fresh prospective "
                f"window, but inherits family-level selection bias from {prior_family_trials} "
                "prior research trials. Unadjusted single-test p-values do not control FWER/FDR."
            ),
        },
        "dimension_audit": [d.to_dict() for d in dimensions],
        "non_equivalent_dimensions": non_equivalent,
    }
