"""Independent Decimal double-entry event journal and reconciliation oracle.

Implements a standalone chart of accounts and event-level Debit/Credit ledger
that shares zero PnL summation code with ``borrow_liquidation_model.py``.
Verifies:
- Per-event ``sum(debits) == sum(credits)`` in exact Decimal micro-units.
- Accounting identity ``Assets == Liabilities + Equity``.
- Zero phantom open assets or liabilities after cycle exit.
- Equity delta reconciles to ``Realized PnL + Unrealized PnL``.
- Duplicate funding or duplicate fee events are rejected.
- Any single-event perturbation causes reconciliation failure.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_EVEN
from enum import Enum
from typing import Any, Sequence

Q8 = Decimal("0.00000001")
ZERO = Decimal("0.00000000")


def _q8(val: Decimal) -> Decimal:
    return val.quantize(Q8, rounding=ROUND_HALF_EVEN)


class AccountType(str, Enum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    EQUITY = "EQUITY"


class Account(str, Enum):
    CASH = "CASH"
    PERP_MARGIN_COLLATERAL = "PERP_MARGIN_COLLATERAL"
    SPOT_INVENTORY = "SPOT_INVENTORY"
    PERP_HEDGE_POSITION = "PERP_HEDGE_POSITION"
    SPOT_BORROW_LIABILITY = "SPOT_BORROW_LIABILITY"
    PERP_HEDGE_LIABILITY = "PERP_HEDGE_LIABILITY"
    CAPITAL_EQUITY = "CAPITAL_EQUITY"
    UNREALIZED_PNL = "UNREALIZED_PNL"
    REALIZED_PNL_FUNDING = "REALIZED_PNL_FUNDING"
    REALIZED_PNL_BASIS = "REALIZED_PNL_BASIS"
    REALIZED_PNL_FEES = "REALIZED_PNL_FEES"
    REALIZED_PNL_BORROW = "REALIZED_PNL_BORROW"
    REALIZED_PNL_LIQUIDATION = "REALIZED_PNL_LIQUIDATION"


ACCOUNT_TYPES: dict[Account, AccountType] = {
    Account.CASH: AccountType.ASSET,
    Account.PERP_MARGIN_COLLATERAL: AccountType.ASSET,
    Account.SPOT_INVENTORY: AccountType.ASSET,
    Account.PERP_HEDGE_POSITION: AccountType.ASSET,
    Account.SPOT_BORROW_LIABILITY: AccountType.LIABILITY,
    Account.PERP_HEDGE_LIABILITY: AccountType.LIABILITY,
    Account.CAPITAL_EQUITY: AccountType.EQUITY,
    Account.UNREALIZED_PNL: AccountType.EQUITY,
    Account.REALIZED_PNL_FUNDING: AccountType.EQUITY,
    Account.REALIZED_PNL_BASIS: AccountType.EQUITY,
    Account.REALIZED_PNL_FEES: AccountType.EQUITY,
    Account.REALIZED_PNL_BORROW: AccountType.EQUITY,
    Account.REALIZED_PNL_LIQUIDATION: AccountType.EQUITY,
}

REALIZED_PNL_ACCOUNTS: tuple[Account, ...] = (
    Account.REALIZED_PNL_FUNDING,
    Account.REALIZED_PNL_BASIS,
    Account.REALIZED_PNL_FEES,
    Account.REALIZED_PNL_BORROW,
    Account.REALIZED_PNL_LIQUIDATION,
)

POSITION_ACCOUNTS_MUST_CLOSE: tuple[Account, ...] = (
    Account.PERP_MARGIN_COLLATERAL,
    Account.SPOT_INVENTORY,
    Account.PERP_HEDGE_POSITION,
    Account.SPOT_BORROW_LIABILITY,
    Account.PERP_HEDGE_LIABILITY,
    Account.UNREALIZED_PNL,
)


class EventKind(str, Enum):
    OPENING_CAPITAL = "OPENING_CAPITAL"
    SPOT_ENTRY = "SPOT_ENTRY"
    SPOT_EXIT = "SPOT_EXIT"
    PERP_HEDGE_ENTRY = "PERP_HEDGE_ENTRY"
    PERP_HEDGE_EXIT = "PERP_HEDGE_EXIT"
    MAKER_TAKER_FEE = "MAKER_TAKER_FEE"
    BORROW_ACCRUAL = "BORROW_ACCRUAL"
    FUNDING_ACCRUAL = "FUNDING_ACCRUAL"
    BASIS_CONVERGENCE = "BASIS_CONVERGENCE"
    PARTIAL_HEDGE_FILL = "PARTIAL_HEDGE_FILL"
    FORCED_LIQUIDATION = "FORCED_LIQUIDATION"
    EMERGENCY_CLOSE = "EMERGENCY_CLOSE"
    MARGIN_RELEASE = "MARGIN_RELEASE"
    UNREALIZED_TO_REALIZED_PNL = "UNREALIZED_TO_REALIZED_PNL"


@dataclass(frozen=True)
class LedgerLeg:
    account: Account
    debit: Decimal = ZERO
    credit: Decimal = ZERO

    def __post_init__(self) -> None:
        if self.debit < ZERO or self.credit < ZERO:
            raise ValueError("Debit and credit amounts must be non-negative.")
        if self.debit > ZERO and self.credit > ZERO:
            raise ValueError("A single leg cannot carry both debit and credit.")


@dataclass(frozen=True)
class JournalEvent:
    event_id: str
    kind: EventKind
    timestamp_seq: int
    legs: tuple[LedgerLeg, ...]
    dedup_key: str | None = None
    memo: str = ""


@dataclass(frozen=True)
class OracleReconciliationReport:
    reconciled: bool
    status: str
    event_count: int
    event_kinds_present: list[str]
    ending_cash_usd: Decimal
    realized_pnl_usd: Decimal
    unrealized_pnl_usd: Decimal
    total_equity_usd: Decimal
    equity_delta_usd: Decimal
    balance_sheet_residual_usd: Decimal
    cash_vs_model_residual_usd: Decimal
    pnl_vs_model_residual_usd: Decimal
    failures: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "reconciled": self.reconciled,
            "status": self.status,
            "event_count": self.event_count,
            "event_kinds_present": self.event_kinds_present,
            "ending_cash_usd": str(self.ending_cash_usd),
            "realized_pnl_usd": str(self.realized_pnl_usd),
            "unrealized_pnl_usd": str(self.unrealized_pnl_usd),
            "total_equity_usd": str(self.total_equity_usd),
            "equity_delta_usd": str(self.equity_delta_usd),
            "balance_sheet_residual_usd": str(self.balance_sheet_residual_usd),
            "cash_vs_model_residual_usd": str(self.cash_vs_model_residual_usd),
            "pnl_vs_model_residual_usd": str(self.pnl_vs_model_residual_usd),
            "failures": list(self.failures),
        }


def _signed_pnl_legs(
    *,
    cash_or_asset: Account,
    pnl_account: Account,
    amount: Decimal,
) -> tuple[LedgerLeg, LedgerLeg]:
    amt = _q8(amount)
    if amt >= ZERO:
        return (
            LedgerLeg(account=cash_or_asset, debit=amt),
            LedgerLeg(account=pnl_account, credit=amt),
        )
    mag = _q8(-amt)
    return (
        LedgerLeg(account=pnl_account, debit=mag),
        LedgerLeg(account=cash_or_asset, credit=mag),
    )


def build_carry_cycle_journal(
    *,
    starting_cash: Decimal,
    spot_notional: Decimal,
    perp_notional: Decimal,
    perp_margin_posted: Decimal,
    partial_hedge_fill_notional: Decimal = ZERO,
    entry_maker_fee: Decimal = ZERO,
    exit_maker_fee: Decimal = ZERO,
    taker_fallback_fee: Decimal = ZERO,
    borrow_cost: Decimal = ZERO,
    funding_pnl: Decimal = ZERO,
    basis_pnl: Decimal = ZERO,
    liquidation_loss: Decimal = ZERO,
    emergency_close_loss: Decimal = ZERO,
) -> list[JournalEvent]:
    """Construct balanced Debit/Credit events for a full carry cycle."""
    events: list[JournalEvent] = []
    seq = 0

    def add(
        kind: EventKind,
        legs: Sequence[LedgerLeg],
        *,
        dedup_key: str | None = None,
        memo: str = "",
    ) -> None:
        nonlocal seq
        seq += 1
        events.append(
            JournalEvent(
                event_id=f"evt-{seq:04d}-{kind.value.lower()}",
                kind=kind,
                timestamp_seq=seq,
                legs=tuple(legs),
                dedup_key=dedup_key,
                memo=memo,
            )
        )

    c0 = _q8(starting_cash)
    s_not = _q8(spot_notional)
    p_not = _q8(perp_notional)
    m_post = _q8(perp_margin_posted)
    p_partial = _q8(partial_hedge_fill_notional)

    add(
        EventKind.OPENING_CAPITAL,
        (
            LedgerLeg(account=Account.CASH, debit=c0),
            LedgerLeg(account=Account.CAPITAL_EQUITY, credit=c0),
        ),
        memo="Initial cycle capital",
    )

    # Spot leg entry (cash funded)
    if s_not > ZERO:
        add(
            EventKind.SPOT_ENTRY,
            (
                LedgerLeg(account=Account.SPOT_INVENTORY, debit=s_not),
                LedgerLeg(account=Account.CASH, credit=s_not),
            ),
            memo="Acquire spot leg",
        )

    # Perp margin collateral posting + short hedge notional recognition
    initial_perp_fill = _q8(p_not - p_partial)
    if initial_perp_fill > ZERO or m_post > ZERO:
        legs: list[LedgerLeg] = []
        if m_post > ZERO:
            legs.extend(
                [
                    LedgerLeg(account=Account.PERP_MARGIN_COLLATERAL, debit=m_post),
                    LedgerLeg(account=Account.CASH, credit=m_post),
                ]
            )
        if initial_perp_fill > ZERO:
            legs.extend(
                [
                    LedgerLeg(account=Account.PERP_HEDGE_POSITION, debit=initial_perp_fill),
                    LedgerLeg(account=Account.PERP_HEDGE_LIABILITY, credit=initial_perp_fill),
                ]
            )
        add(EventKind.PERP_HEDGE_ENTRY, legs, memo="Post perp margin and open hedge")

    if p_partial > ZERO:
        add(
            EventKind.PARTIAL_HEDGE_FILL,
            (
                LedgerLeg(account=Account.PERP_HEDGE_POSITION, debit=p_partial),
                LedgerLeg(account=Account.PERP_HEDGE_LIABILITY, credit=p_partial),
            ),
            memo="Complete remaining partial perp hedge fill",
        )

    # Fees (dedup-keyed per distinct fee leg)
    for fee_label, fee_amt in (
        ("entry_maker_fee", _q8(entry_maker_fee)),
        ("exit_maker_fee", _q8(exit_maker_fee)),
        ("taker_fallback_fee", _q8(taker_fallback_fee)),
    ):
        if fee_amt > ZERO:
            add(
                EventKind.MAKER_TAKER_FEE,
                (
                    LedgerLeg(account=Account.REALIZED_PNL_FEES, debit=fee_amt),
                    LedgerLeg(account=Account.CASH, credit=fee_amt),
                ),
                dedup_key=f"fee:{fee_label}",
                memo=f"Settle {fee_label}",
            )

    # Borrow accrual
    b_cost = _q8(borrow_cost)
    if b_cost > ZERO:
        add(
            EventKind.BORROW_ACCRUAL,
            (
                LedgerLeg(account=Account.REALIZED_PNL_BORROW, debit=b_cost),
                LedgerLeg(account=Account.CASH, credit=b_cost),
            ),
            dedup_key="borrow:cycle",
            memo="Spot margin borrow accrual",
        )

    # Funding accrual
    f_pnl = _q8(funding_pnl)
    if f_pnl != ZERO:
        add(
            EventKind.FUNDING_ACCRUAL,
            _signed_pnl_legs(
                cash_or_asset=Account.CASH,
                pnl_account=Account.REALIZED_PNL_FUNDING,
                amount=f_pnl,
            ),
            dedup_key="funding:cycle",
            memo="Perp funding accrual",
        )

    # Basis convergence: first mark unrealized PnL, then realize on close
    bas = _q8(basis_pnl)
    if bas != ZERO:
        add(
            EventKind.BASIS_CONVERGENCE,
            _signed_pnl_legs(
                cash_or_asset=Account.SPOT_INVENTORY,
                pnl_account=Account.UNREALIZED_PNL,
                amount=bas,
            ),
            memo="Mark-to-market basis convergence",
        )
        if bas > ZERO:
            add(
                EventKind.UNREALIZED_TO_REALIZED_PNL,
                (
                    LedgerLeg(account=Account.UNREALIZED_PNL, debit=bas),
                    LedgerLeg(account=Account.REALIZED_PNL_BASIS, credit=bas),
                ),
                memo="Realize positive basis PnL on exit",
            )
        else:
            mag = _q8(-bas)
            add(
                EventKind.UNREALIZED_TO_REALIZED_PNL,
                (
                    LedgerLeg(account=Account.REALIZED_PNL_BASIS, debit=mag),
                    LedgerLeg(account=Account.UNREALIZED_PNL, credit=mag),
                ),
                memo="Realize negative basis PnL on exit",
            )

    # Forced liquidation and/or emergency close
    liq = _q8(liquidation_loss)
    if liq > ZERO:
        add(
            EventKind.FORCED_LIQUIDATION,
            (
                LedgerLeg(account=Account.REALIZED_PNL_LIQUIDATION, debit=liq),
                LedgerLeg(account=Account.CASH, credit=liq),
            ),
            dedup_key="liquidation:forced",
            memo="Forced liquidation loss and penalty",
        )

    emerg = _q8(emergency_close_loss)
    if emerg > ZERO:
        add(
            EventKind.EMERGENCY_CLOSE,
            (
                LedgerLeg(account=Account.REALIZED_PNL_LIQUIDATION, debit=emerg),
                LedgerLeg(account=Account.CASH, credit=emerg),
            ),
            dedup_key="liquidation:emergency_close",
            memo="Emergency close slippage/loss",
        )

    # Close perp hedge and release margin collateral
    if p_not > ZERO:
        add(
            EventKind.PERP_HEDGE_EXIT,
            (
                LedgerLeg(account=Account.PERP_HEDGE_LIABILITY, debit=p_not),
                LedgerLeg(account=Account.PERP_HEDGE_POSITION, credit=p_not),
            ),
            memo="Close perp hedge position",
        )

    if m_post > ZERO:
        add(
            EventKind.MARGIN_RELEASE,
            (
                LedgerLeg(account=Account.CASH, debit=m_post),
                LedgerLeg(account=Account.PERP_MARGIN_COLLATERAL, credit=m_post),
            ),
            memo="Release perp margin collateral to cash",
        )

    # Exit spot leg (including realized basis adjustment in spot inventory)
    spot_exit_proceeds = _q8(s_not + bas)
    if spot_exit_proceeds > ZERO:
        add(
            EventKind.SPOT_EXIT,
            (
                LedgerLeg(account=Account.CASH, debit=spot_exit_proceeds),
                LedgerLeg(account=Account.SPOT_INVENTORY, credit=spot_exit_proceeds),
            ),
            memo="Exit spot inventory to cash",
        )

    return events


def reconcile_journal(
    events: Sequence[JournalEvent],
    *,
    starting_cash: Decimal,
    expected_ending_cash: Decimal,
    expected_net_pnl: Decimal,
    require_flat_positions: bool = True,
) -> OracleReconciliationReport:
    """Independently post all Debit/Credit legs and verify ledger invariants."""
    failures: list[str] = []
    balances: dict[Account, Decimal] = {acct: ZERO for acct in Account}
    seen_event_ids: set[str] = set()
    seen_dedup_keys: set[str] = set()
    kinds_present: list[str] = []

    for ev in events:
        if ev.event_id in seen_event_ids:
            failures.append(f"duplicate_event_id:{ev.event_id}")
        seen_event_ids.add(ev.event_id)

        if ev.dedup_key is not None:
            if ev.dedup_key in seen_dedup_keys:
                failures.append(f"duplicate_settlement_key:{ev.dedup_key}")
            seen_dedup_keys.add(ev.dedup_key)

        if ev.kind.value not in kinds_present:
            kinds_present.append(ev.kind.value)

        ev_debits = ZERO
        ev_credits = ZERO
        for leg in ev.legs:
            ev_debits = _q8(ev_debits + leg.debit)
            ev_credits = _q8(ev_credits + leg.credit)
            acct_type = ACCOUNT_TYPES[leg.account]
            if acct_type == AccountType.ASSET:
                balances[leg.account] = _q8(balances[leg.account] + leg.debit - leg.credit)
            else:
                balances[leg.account] = _q8(balances[leg.account] + leg.credit - leg.debit)

        if ev_debits != ev_credits:
            failures.append(
                f"unbalanced_event:{ev.event_id}:debits={ev_debits}:credits={ev_credits}"
            )

    total_assets = _q8(
        sum(
            (balances[a] for a, t in ACCOUNT_TYPES.items() if t == AccountType.ASSET),
            ZERO,
        )
    )
    total_liabilities = _q8(
        sum(
            (balances[a] for a, t in ACCOUNT_TYPES.items() if t == AccountType.LIABILITY),
            ZERO,
        )
    )
    total_equity = _q8(
        sum(
            (balances[a] for a, t in ACCOUNT_TYPES.items() if t == AccountType.EQUITY),
            ZERO,
        )
    )
    balance_sheet_residual = _q8(total_assets - (total_liabilities + total_equity))
    if balance_sheet_residual != ZERO:
        failures.append(f"balance_sheet_imbalance:{balance_sheet_residual}")

    if require_flat_positions:
        for acct in POSITION_ACCOUNTS_MUST_CLOSE:
            if balances[acct] != ZERO:
                failures.append(f"phantom_open_balance:{acct.value}={balances[acct]}")

    realized_pnl = _q8(sum((balances[a] for a in REALIZED_PNL_ACCOUNTS), ZERO))
    unrealized_pnl = balances[Account.UNREALIZED_PNL]
    equity_delta = _q8(total_equity - _q8(starting_cash))
    if equity_delta != _q8(realized_pnl + unrealized_pnl):
        failures.append(
            f"equity_pnl_mismatch:delta={equity_delta}:pnl={_q8(realized_pnl + unrealized_pnl)}"
        )

    ending_cash = balances[Account.CASH]
    cash_residual = _q8(ending_cash - _q8(expected_ending_cash))
    pnl_residual = _q8(realized_pnl - _q8(expected_net_pnl))

    if cash_residual != ZERO:
        failures.append(f"ending_cash_mismatch_vs_model:{cash_residual}")
    if pnl_residual != ZERO:
        failures.append(f"net_pnl_mismatch_vs_model:{pnl_residual}")

    reconciled = len(failures) == 0
    return OracleReconciliationReport(
        reconciled=reconciled,
        status=(
            "INDEPENDENT_DOUBLE_ENTRY_VERIFIED"
            if reconciled
            else "DOUBLE_ENTRY_RECONCILIATION_FAILED"
        ),
        event_count=len(events),
        event_kinds_present=kinds_present,
        ending_cash_usd=ending_cash,
        realized_pnl_usd=realized_pnl,
        unrealized_pnl_usd=unrealized_pnl,
        total_equity_usd=total_equity,
        equity_delta_usd=equity_delta,
        balance_sheet_residual_usd=balance_sheet_residual,
        cash_vs_model_residual_usd=cash_residual,
        pnl_vs_model_residual_usd=pnl_residual,
        failures=failures,
    )
