"""Comprehensive unit, adversarial, accounting-oracle, causal, and falsification tests for V3."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import ast
from pathlib import Path
import pytest

from verification_lab.v3 import (
    CAPITAL_TIERS_USD,
    AllocationPolicy,
    CashFundedEconomicsEngine,
    ComponentTimestamp,
    CompositeObservationInput,
    EconomicEvent,
    EventType,
    IndependentDoubleEntryOracle,
    LedgerIntegrityError,
    ProvenanceStatus,
    RouteFeasibilityVerdict,
    VenueRoute,
    build_default_route_specs,
    build_five_tier_capital_matrix,
    run_execution_stress_suite,
    run_scientific_falsification,
    validate_v3_composite_causality,
)


def test_allocation_policy_invariants() -> None:
    pol = AllocationPolicy()
    assert pol.spot_ratio + pol.perp_im_ratio + pol.free_reserve_ratio == Decimal("1")
    with pytest.raises(ValueError, match="sum to 1"):
        AllocationPolicy(spot_ratio=Decimal("0.70"), perp_im_ratio=Decimal("0.20"), free_reserve_ratio=Decimal("0.20"))
    with pytest.raises(ValueError, match="below minimum"):
        AllocationPolicy(spot_ratio=Decimal("0.75"), perp_im_ratio=Decimal("0.15"), free_reserve_ratio=Decimal("0.10"))


def test_five_tier_capital_matrix_all_routes() -> None:
    specs = build_default_route_specs()
    matrix = build_five_tier_capital_matrix(specs)
    assert set(matrix.keys()) == set(VenueRoute)
    for route, cells in matrix.items():
        assert len(cells) == len(CAPITAL_TIERS_USD) == 5
        for cell in cells:
            # Strict cash-funded capital identity: actual_spot + perp_im + free_reserve == capital
            assert cell.actual_spot_notional_usd + cell.initial_margin_usd + cell.free_cash_reserve_usd == cell.capital_tier_usd
            assert cell.free_cash_reserve_usd >= cell.capital_tier_usd * Decimal("0.25")

    # Binance $100 must be infeasible because perp minQty 0.001 BTC (~$61.47) exceeds $60 spot/perp budget
    bn_100 = matrix[VenueRoute.BINANCE_SAME_VENUE][0]
    assert bn_100.capital_tier_usd == Decimal("100")
    assert bn_100.perp_qty_btc == Decimal("0")
    assert bn_100.final_eligibility_verdict == "INFEASIBLE_BELOW_VENUE_MINIMUMS"

    # Cross-venue $100 must have negative excess carry due to $5 RT transfer + fees + opp cost
    cv_100 = matrix[VenueRoute.CROSS_VENUE_BN_SPOT_HL_PERP][0]
    assert cv_100.net_return_after_costs_usd < Decimal("0")

    # Hyperliquid UBTC is explicitly flagged as wrapped spot and avoids Portfolio Margin
    hl_spec = specs[VenueRoute.HYPERLIQUID_SAME_VENUE]
    assert hl_spec.is_wrapped_spot is True
    assert hl_spec.portfolio_margin_required is False
    assert hl_spec.route_verdict == RouteFeasibilityVerdict.MECHANICALLY_FEASIBLE


def test_double_entry_engine_and_oracle_full_lifecycle() -> None:
    engine = CashFundedEconomicsEngine()
    oracle = IndependentDoubleEntryOracle()
    init_eq = Decimal("1000")
    events = [
        EconomicEvent(seq=0, timestamp_utc="2026-11-23T00:00:00Z", event_type=EventType.INIT_EQUITY, is_observed=False),
        EconomicEvent(
            seq=1, timestamp_utc="2026-11-23T00:01:00Z", event_type=EventType.SPOT_BUY, is_observed=True,
            qty_btc=Decimal("0.00970"), price_usd=Decimal("61416.00"),
            fee_usd=Decimal("0.41701464"), spread_slippage_usd=Decimal("0.00485"),
        ),
        EconomicEvent(
            seq=2, timestamp_utc="2026-11-23T00:01:01Z", event_type=EventType.PERP_SHORT_OPEN, is_observed=True,
            qty_btc=Decimal("0.00970"), price_usd=Decimal("61492.00"),
            margin_transfer_usd=Decimal("150.00"),
            fee_usd=Decimal("0.26841258"), spread_slippage_usd=Decimal("0.00485"),
        ),
        EconomicEvent(
            seq=3, timestamp_utc="2026-11-23T01:00:00Z", event_type=EventType.FUNDING_SETTLEMENT, is_observed=True,
            funding_cashflow_usd=Decimal("0.007455905"),
        ),
        EconomicEvent(
            seq=4, timestamp_utc="2026-11-24T00:00:00Z", event_type=EventType.MARK_TO_MARKET, is_observed=True,
            price_usd=Decimal("62000.00"), perp_mark_usd=Decimal("62020.00"),
        ),
        EconomicEvent(
            seq=5, timestamp_utc="2026-11-24T00:05:00Z", event_type=EventType.HEDGE_REBALANCE, is_observed=False,
            margin_transfer_usd=Decimal("25.00"), fee_usd=Decimal("0.05"),
        ),
        EconomicEvent(
            seq=6, timestamp_utc="2026-11-24T00:10:00Z", event_type=EventType.UNFILLED_HEDGE, is_observed=False,
            hedge_error_usd=Decimal("0.30"),
        ),
        EconomicEvent(
            seq=7, timestamp_utc="2026-11-24T00:15:00Z", event_type=EventType.WRAPPED_DISCOUNT_EVENT, is_observed=False,
            price_usd=Decimal("61950.00"), other_cost_usd=Decimal("0.10"),
        ),
        EconomicEvent(
            seq=8, timestamp_utc="2026-11-24T00:20:00Z", event_type=EventType.OPPORTUNITY_COST_ACCRUAL, is_observed=False,
            opportunity_cost_usd=Decimal("0.10958904"),
        ),
        EconomicEvent(
            seq=9, timestamp_utc="2026-11-25T00:00:00Z", event_type=EventType.SPOT_SELL, is_observed=True,
            qty_btc=Decimal("0.00970"), price_usd=Decimal("61950.00"),
            fee_usd=Decimal("0.42064050"), spread_slippage_usd=Decimal("0.00485"),
        ),
        EconomicEvent(
            seq=10, timestamp_utc="2026-11-25T00:00:01Z", event_type=EventType.PERP_SHORT_CLOSE, is_observed=True,
            qty_btc=Decimal("0.00970"), price_usd=Decimal("61980.00"),
            fee_usd=Decimal("0.27054270"), spread_slippage_usd=Decimal("0.00485"),
        ),
    ]
    result = engine.run(init_eq, events)
    audit = oracle.verify(init_eq, events, result)
    assert audit["verified"] is True
    assert Decimal(str(audit["max_balance_sheet_residual_usd"])) == Decimal("0")
    assert result.liquidated is False
    assert result.observed_events == 6
    assert result.modeled_events == 5
    # Verify exact Net Carry identity
    recomputed_net = (
        result.funding_usd
        + result.basis_pnl_usd
        - result.spot_fees_usd
        - result.perp_fees_usd
        - result.spread_slippage_usd
        - result.hedge_error_usd
        - result.opportunity_cost_usd
        - result.other_verified_costs_usd
    )
    assert recomputed_net == result.net_carry_after_opportunity_cost_usd


def test_double_entry_forbids_borrowed_principal_and_detects_tampering() -> None:
    engine = CashFundedEconomicsEngine()
    oracle = IndependentDoubleEntryOracle()
    # 1. Borrowed principal strictly rejected
    bad_events = [
        EconomicEvent(
            seq=0, timestamp_utc="2026-11-23T00:00:00Z", event_type=EventType.INIT_EQUITY,
            is_observed=False, borrowed_principal_usd=Decimal("50"),
        )
    ]
    with pytest.raises(LedgerIntegrityError, match="FORBIDDEN_BORROWED_PRINCIPAL_IN_V3"):
        engine.run(Decimal("100"), bad_events)

    # 2. Oracle catches deliberately tampered checkpoint
    good_events = [
        EconomicEvent(seq=0, timestamp_utc="2026-11-23T00:00:00Z", event_type=EventType.INIT_EQUITY, is_observed=False),
        EconomicEvent(
            seq=1, timestamp_utc="2026-11-23T01:00:00Z", event_type=EventType.FUNDING_SETTLEMENT,
            is_observed=True, funding_cashflow_usd=Decimal("1.25"),
        ),
    ]
    rep = engine.run(Decimal("100"), good_events)
    tampered_cp = rep.checkpoints[1].__class__(
        **{**rep.checkpoints[1].__dict__, "total_equity_usd": rep.checkpoints[1].total_equity_usd + Decimal("0.01")}
    )
    tampered_rep = rep.__class__(**{**rep.__dict__, "checkpoints": (rep.checkpoints[0], tampered_cp)})
    with pytest.raises(LedgerIntegrityError, match="Reported equity mismatch"):
        oracle.verify(Decimal("100"), good_events, tampered_rep)


def test_liquidation_detection_on_short_perp_rally() -> None:
    engine = CashFundedEconomicsEngine()
    oracle = IndependentDoubleEntryOracle()
    events = [
        EconomicEvent(seq=0, timestamp_utc="2026-11-23T00:00:00Z", event_type=EventType.INIT_EQUITY, is_observed=False),
        EconomicEvent(
            seq=1, timestamp_utc="2026-11-23T00:01:00Z", event_type=EventType.PERP_SHORT_OPEN, is_observed=False,
            qty_btc=Decimal("0.01"), price_usd=Decimal("60000"), margin_transfer_usd=Decimal("100"),
        ),
        EconomicEvent(
            seq=2, timestamp_utc="2026-11-23T02:00:00Z", event_type=EventType.MARK_TO_MARKET, is_observed=False,
            perp_mark_usd=Decimal("70000"),
        ),
        EconomicEvent(
            seq=3, timestamp_utc="2026-11-23T02:00:01Z", event_type=EventType.LIQUIDATION, is_observed=False,
            perp_mark_usd=Decimal("70000"), fee_usd=Decimal("3.00"), other_cost_usd=Decimal("2.00"),
        ),
    ]
    res = engine.run(Decimal("1000"), events)
    assert res.liquidated is True
    audit = oracle.verify(Decimal("1000"), events, res)
    assert audit["verified"] is True

    # Post-liquidation trading events must be rejected
    events_after_liq = events + [
        EconomicEvent(
            seq=4, timestamp_utc="2026-11-23T02:01:00Z", event_type=EventType.SPOT_BUY, is_observed=False,
            qty_btc=Decimal("0.001"), price_usd=Decimal("70000"),
        )
    ]
    with pytest.raises(LedgerIntegrityError, match="POST_LIQUIDATION_EVENT_REJECTED"):
        engine.run(Decimal("1000"), events_after_liq)

    # Negative qty must be rejected
    with pytest.raises(LedgerIntegrityError, match="must be non-negative"):
        engine.run(
            Decimal("1000"),
            [
                EconomicEvent(seq=0, timestamp_utc="2026-11-23T00:00:00Z", event_type=EventType.INIT_EQUITY, is_observed=False),
                EconomicEvent(
                    seq=1, timestamp_utc="2026-11-23T00:01:00Z", event_type=EventType.SPOT_BUY, is_observed=False,
                    qty_btc=Decimal("-0.01"), price_usd=Decimal("60000"),
                ),
            ],
        )


def test_causal_validator_closes_cashclaw_27_p1_findings() -> None:
    t0 = datetime(2026, 11, 23, 5, 45, 35, tzinfo=timezone.utc)
    # Reproduce CASHCLAW #27 P1-A (1d vs intraday) + P1-B (composite available precedes borrow) + oracle spot proxy
    bad_obs = CompositeObservationInput(
        observation_id="repro_cc27",
        declared_bar_granularity="1d_finalized",
        evaluation_time_utc=t0 + timedelta(seconds=2),
        claimed_composite_available_utc=t0,  # earlier than comp2 capture (t0 + 1.8s)
        components=(
            ComponentTimestamp(
                component_name="hl_oracle_spot", granularity="l2_snapshot",
                is_spot_order_book=False, is_oracle_reference_only=True,
                event_time_utc=t0, venue_pub_time_utc=t0, local_capture_time_utc=t0,
                provenance=ProvenanceStatus.LOCAL_UNAUTHENTICATED,
            ),
            ComponentTimestamp(
                component_name="hl_borrow", granularity="l2_snapshot",
                is_spot_order_book=False, is_oracle_reference_only=False,
                event_time_utc=None, venue_pub_time_utc=None, local_capture_time_utc=t0 + timedelta(seconds=1.8),
                provenance=ProvenanceStatus.LOCAL_UNAUTHENTICATED,
            ),
        ),
        lookback_days_observed=1,
    )
    res = validate_v3_composite_causality(bad_obs)
    assert res.valid is False
    assert any("ORACLE_SPOT_PROXY_REJECTED" in r for r in res.blocking_reasons)
    assert "MISSING_ACTUAL_SPOT_ORDER_BOOK" in res.blocking_reasons
    assert "COMPOSITE_AVAILABLE_PRECEDES_LATEST_COMPONENT" in res.blocking_reasons
    assert any("MIXED_GRANULARITY_MISALIGNMENT" in r for r in res.blocking_reasons)
    assert any("INSUFFICIENT_LOOKBACK_DAYS" in r for r in res.blocking_reasons)

    # Valid aligned 1d observation with trusted manifest passes
    t_day = datetime(2026, 11, 24, 0, 0, 5, tzinfo=timezone.utc)
    good_obs = CompositeObservationInput(
        observation_id="valid_1d",
        declared_bar_granularity="1d_finalized",
        evaluation_time_utc=t_day + timedelta(seconds=5),
        claimed_composite_available_utc=t_day + timedelta(seconds=2),
        components=(
            ComponentTimestamp(
                component_name="ubtc_spot_1d", granularity="1d_finalized",
                is_spot_order_book=True, is_oracle_reference_only=False,
                event_time_utc=t_day, venue_pub_time_utc=t_day, local_capture_time_utc=t_day + timedelta(seconds=1),
                provenance=ProvenanceStatus.TRUSTED_MANIFEST_VERIFIED,
            ),
            ComponentTimestamp(
                component_name="btc_perp_1d", granularity="1d_finalized",
                is_spot_order_book=False, is_oracle_reference_only=False,
                event_time_utc=t_day, venue_pub_time_utc=t_day, local_capture_time_utc=t_day + timedelta(seconds=2),
                provenance=ProvenanceStatus.TRUSTED_MANIFEST_VERIFIED,
            ),
        ),
        lookback_days_observed=30,
    )
    good_res = validate_v3_composite_causality(good_obs)
    assert good_res.valid is True
    assert good_res.eligible_for_empirical_claim is True


def test_execution_stress_and_falsification_invariants() -> None:
    specs = build_default_route_specs()
    stress = run_execution_stress_suite(specs[VenueRoute.HYPERLIQUID_SAME_VENUE], capital_usd=Decimal("5000"))
    assert len(stress) == 11
    by_id = {s.scenario_id: s for s in stress}
    assert by_id["S11_SHORT_PERP_LIQUIDATION_PRESSURE"].perp_liquidation_breached is True
    assert by_id["S10_WRAPPED_BTC_DEPEG_5PCT"].stress_shock_loss_usd > Decimal("0")

    # Synthetic positive funding series falsification check: cumulative N >= 186
    funding = [0.0003] * 120
    btc_ret = [0.001 if i % 2 == 0 else -0.0005 for i in range(120)]
    fals = run_scientific_falsification(funding, btc_ret, prior_family_trials=186, new_v3_trials=15)
    assert fals.cumulative_family_trials_n == 201
    assert fals.dataset_provenance == "HASH_RECORDED_UNVERIFIED"


def test_v3_package_has_zero_order_or_credential_imports() -> None:
    forbidden = {"ccxt", "hyperliquid", "binance", "web3", "eth_account", "boto3"}
    v3_dir = Path(__file__).resolve().parents[1] / "src" / "verification_lab" / "v3"
    for py_file in v3_dir.glob("*.py"):
        tree = ast.parse(py_file.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert alias.name.split(".")[0] not in forbidden, f"Forbidden import {alias.name} in {py_file}"
            elif isinstance(node, ast.ImportFrom) and node.module:
                assert node.module.split(".")[0] not in forbidden, f"Forbidden import {node.module} in {py_file}"
