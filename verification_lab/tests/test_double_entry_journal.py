"""Tests for the independent Decimal double-entry journal and reconciliation oracle."""

from __future__ import annotations

from decimal import Decimal

import pytest

from verification_lab.execution.double_entry_journal import (
    Account,
    EventKind,
    JournalEvent,
    LedgerLeg,
    build_carry_cycle_journal,
    reconcile_journal,
)

ZERO = Decimal("0.00000000")


def _full_lifecycle_events() -> tuple[list[JournalEvent], Decimal, Decimal, Decimal]:
    starting_cash = Decimal("100000.00000000")
    spot_notional = Decimal("50000.00000000")
    perp_notional = Decimal("50000.00000000")
    perp_margin = Decimal("10000.00000000")
    partial_fill = Decimal("15000.00000000")
    entry_maker_fee = Decimal("15.00000000")
    exit_maker_fee = Decimal("15.00000000")
    taker_fallback_fee = Decimal("22.50000000")
    borrow_cost = Decimal("205.47945205")
    funding_pnl = Decimal("404.52739726")
    basis_pnl = Decimal("40.00000000")
    liquidation_loss = Decimal("250.00000000")
    emergency_close_loss = Decimal("125.00000000")

    expected_net_pnl = (
        funding_pnl
        + basis_pnl
        - entry_maker_fee
        - exit_maker_fee
        - taker_fallback_fee
        - borrow_cost
        - liquidation_loss
        - emergency_close_loss
    )
    expected_ending_cash = starting_cash + expected_net_pnl

    events = build_carry_cycle_journal(
        starting_cash=starting_cash,
        spot_notional=spot_notional,
        perp_notional=perp_notional,
        perp_margin_posted=perp_margin,
        partial_hedge_fill_notional=partial_fill,
        entry_maker_fee=entry_maker_fee,
        exit_maker_fee=exit_maker_fee,
        taker_fallback_fee=taker_fallback_fee,
        borrow_cost=borrow_cost,
        funding_pnl=funding_pnl,
        basis_pnl=basis_pnl,
        liquidation_loss=liquidation_loss,
        emergency_close_loss=emergency_close_loss,
    )
    return events, starting_cash, expected_ending_cash, expected_net_pnl


def test_full_event_lifecycle_reconciles_to_exact_zero_micro_units() -> None:
    events, starting_cash, expected_ending_cash, expected_net_pnl = _full_lifecycle_events()
    report = reconcile_journal(
        events,
        starting_cash=starting_cash,
        expected_ending_cash=expected_ending_cash,
        expected_net_pnl=expected_net_pnl,
    )
    assert report.reconciled is True
    assert report.status == "INDEPENDENT_DOUBLE_ENTRY_VERIFIED"
    assert report.balance_sheet_residual_usd == ZERO
    assert report.cash_vs_model_residual_usd == ZERO
    assert report.pnl_vs_model_residual_usd == ZERO
    assert report.unrealized_pnl_usd == ZERO
    assert report.equity_delta_usd == expected_net_pnl

    required_kinds = {
        EventKind.SPOT_ENTRY.value,
        EventKind.SPOT_EXIT.value,
        EventKind.PERP_HEDGE_ENTRY.value,
        EventKind.PERP_HEDGE_EXIT.value,
        EventKind.MAKER_TAKER_FEE.value,
        EventKind.BORROW_ACCRUAL.value,
        EventKind.FUNDING_ACCRUAL.value,
        EventKind.BASIS_CONVERGENCE.value,
        EventKind.PARTIAL_HEDGE_FILL.value,
        EventKind.FORCED_LIQUIDATION.value,
        EventKind.EMERGENCY_CLOSE.value,
        EventKind.MARGIN_RELEASE.value,
        EventKind.UNREALIZED_TO_REALIZED_PNL.value,
    }
    assert required_kinds.issubset(set(report.event_kinds_present))


def test_single_event_perturbation_triggers_oracle_mismatch() -> None:
    events, starting_cash, expected_ending_cash, expected_net_pnl = _full_lifecycle_events()

    # Perturb the funding accrual event by 1 micro-unit (0.00000001)
    perturbed: list[JournalEvent] = []
    for ev in events:
        if ev.kind == EventKind.FUNDING_ACCRUAL:
            leg0, leg1 = ev.legs
            perturbed.append(
                JournalEvent(
                    event_id=ev.event_id,
                    kind=ev.kind,
                    timestamp_seq=ev.timestamp_seq,
                    legs=(
                        LedgerLeg(account=leg0.account, debit=leg0.debit + Decimal("0.00000001")),
                        LedgerLeg(account=leg1.account, credit=leg1.credit + Decimal("0.00000001")),
                    ),
                    dedup_key=ev.dedup_key,
                )
            )
        else:
            perturbed.append(ev)

    report = reconcile_journal(
        perturbed,
        starting_cash=starting_cash,
        expected_ending_cash=expected_ending_cash,
        expected_net_pnl=expected_net_pnl,
    )
    assert report.reconciled is False
    assert report.status == "DOUBLE_ENTRY_RECONCILIATION_FAILED"
    assert any("ending_cash_mismatch_vs_model" in f for f in report.failures)
    assert any("net_pnl_mismatch_vs_model" in f for f in report.failures)


def test_duplicate_funding_or_fee_rejected() -> None:
    events, starting_cash, expected_ending_cash, expected_net_pnl = _full_lifecycle_events()
    funding_ev = next(e for e in events if e.kind == EventKind.FUNDING_ACCRUAL)
    dup = JournalEvent(
        event_id="evt-9999-dup-funding",
        kind=EventKind.FUNDING_ACCRUAL,
        timestamp_seq=999,
        legs=funding_ev.legs,
        dedup_key=funding_ev.dedup_key,
    )
    report = reconcile_journal(
        [*events, dup],
        starting_cash=starting_cash,
        expected_ending_cash=expected_ending_cash,
        expected_net_pnl=expected_net_pnl,
    )
    assert report.reconciled is False
    assert any("duplicate_settlement_key:funding:cycle" in f for f in report.failures)


def test_unbalanced_event_and_phantom_position_detected() -> None:
    events, starting_cash, expected_ending_cash, expected_net_pnl = _full_lifecycle_events()
    # Drop MARGIN_RELEASE to leave a phantom open collateral asset
    without_release = [e for e in events if e.kind != EventKind.MARGIN_RELEASE]
    report = reconcile_journal(
        without_release,
        starting_cash=starting_cash,
        expected_ending_cash=expected_ending_cash,
        expected_net_pnl=expected_net_pnl,
    )
    assert report.reconciled is False
    assert any("phantom_open_balance:PERP_MARGIN_COLLATERAL" in f for f in report.failures)

    # Also verify unbalanced debit != credit fails
    unbalanced_ev = JournalEvent(
        event_id="evt-unbalanced",
        kind=EventKind.MAKER_TAKER_FEE,
        timestamp_seq=500,
        legs=(
            LedgerLeg(account=Account.REALIZED_PNL_FEES, debit=Decimal("1.00000000")),
            LedgerLeg(account=Account.CASH, credit=Decimal("0.50000000")),
        ),
    )
    report2 = reconcile_journal(
        [*events, unbalanced_ev],
        starting_cash=starting_cash,
        expected_ending_cash=expected_ending_cash,
        expected_net_pnl=expected_net_pnl,
    )
    assert report2.reconciled is False
    assert any("unbalanced_event:evt-unbalanced" in f for f in report2.failures)
