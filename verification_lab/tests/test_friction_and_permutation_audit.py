"""Tests for execution friction realism and empirical permutation equivalence audit."""

from __future__ import annotations

from verification_lab.execution.friction_realism import (
    FrictionProvenance,
    build_execution_friction_audit,
)
from verification_lab.stats.permutation_audit import audit_empirical_permutation_control


def test_execution_friction_audit_covers_all_eleven_terms_and_flags_g6_unverified() -> None:
    audit = build_execution_friction_audit(hl_l1_observation_count=19)
    assert audit["g6_full_execution_parity_status"] == "G6_FULL_EXECUTION_PARITY_NOT_VERIFIED"
    assert audit["hyperliquid_l1_calibration_confidence"] == "INSUFFICIENT_SAMPLE_N19"

    concepts = audit["cost_concepts"]
    assert "MAKER_FEE_MULTIPLIER_2X" in concepts
    assert "FULL_EXECUTION_FRICTION_STRESS_2X" in concepts
    assert concepts["MAKER_FEE_MULTIPLIER_2X"]["terms_scaled"] == ["maker_fees"]
    assert concepts["FULL_EXECUTION_FRICTION_STRESS_2X"]["calibrated"] is False

    valid_labels = {p.value for p in FrictionProvenance}
    terms_by_name = {t["term"]: t for t in audit["friction_terms"]}
    expected_terms = {
        "maker_fees",
        "taker_fallback_fees",
        "bid_ask_spread",
        "slippage",
        "market_impact",
        "queue_position_uncertainty",
        "partial_fills",
        "single_leg_miss",
        "borrow_financing",
        "funding",
        "liquidation_costs",
    }
    assert set(terms_by_name.keys()) == expected_terms
    for t in audit["friction_terms"]:
        assert t["provenance"] in valid_labels

    # Parameter-parity checks against modeled venue schedules
    assert "0.50% Binance" in terms_by_name["liquidation_costs"]["calibration_basis"]
    assert "1.00% HL" in terms_by_name["liquidation_costs"]["calibration_basis"]
    assert "19.5% adverse jump" in terms_by_name["single_leg_miss"]["calibration_basis"]
    assert "liquidation_triggered" in terms_by_name["taker_fallback_fees"]["limitation"]

    # Sample-count formatting scales dynamically for non-19 sample sizes
    audit_n50 = build_execution_friction_audit(hl_l1_observation_count=50)
    assert audit_n50["hyperliquid_l1_calibration_confidence"] == "INSUFFICIENT_SAMPLE_N50"
    assert "n=50" in {t["term"]: t for t in audit_n50["friction_terms"]}["queue_position_uncertainty"]["calibration_basis"]


def test_permutation_audit_preserves_p_value_and_downgrades_inference() -> None:
    audit = audit_empirical_permutation_control(
        observed_sharpe=4.320427,
        empirical_p_value=0.00999,
        exceed_count=9,
        n_controls=1000,
        n_active_days=1019,
        total_days=2130,
        seed=20261122,
        prior_family_trials=185,
    )
    assert audit["evidence_scope"] == "HISTORICAL_H3_MAKER_DIAGNOSTIC"
    assert audit["prospective_v2_oos_scope"] == "H3_BASIS_CARRY_V2_PROSPECTIVE_OOS"
    assert audit["valid_as_v2_alpha_proof"] is False
    assert audit["apples_to_apples_null_verified"] is False
    assert audit["inferential_status"] == "DIAGNOSTIC_ONLY_NON_EQUIVALENT_NULL_DOWNGRADED"
    assert audit["preserved_numerical_result"]["empirical_p_value"] == 0.00999
    assert audit["multiple_testing_lineage"]["prior_family_research_trials"] == 185
    assert audit["multiple_testing_lineage"]["cumulative_family_trials"] == 186

    dims = {d["dimension"] for d in audit["dimension_audit"]}
    assert dims == {
        "instruments_and_exposure",
        "holding_period_distribution",
        "turnover",
        "fees",
        "borrow_costs",
        "funding_convention",
        "asset_selection_policy",
        "active_day_fraction",
        "risk_normalization",
        "time_series_dependency_preservation",
    }
    risk_dim = next(d for d in audit["dimension_audit"] if d["dimension"] == "risk_normalization")
    assert "partial-fill" in risk_dim["observed_strategy_treatment"]
    assert "full zero-padded calendar vector" in risk_dim["null_control_treatment"]
