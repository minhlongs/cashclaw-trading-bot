"""Offline Cash-Funded V3 Economics Engine and Independent Double-Entry Decimal Reference Oracle.

Sign conventions (explicit, zero ambiguity):
  - funding_cashflow_usd: > 0 when short perp RECEIVES funding; < 0 when short perp PAYS funding.
  - basis_pnl_usd: (spot_pnl + perp_pnl) where spot_pnl = qty * (spot_px - spot_entry) and
                   perp_pnl = perp_qty * (perp_entry - perp_px) for a short perp.
  - All cost terms (spot_fees_usd, perp_fees_usd, spread_slippage_usd, hedge_error_usd,
    opportunity_cost_usd, other_verified_costs_usd) are stored as NON-NEGATIVE magnitudes and
    SUBTRACTED in Net Carry:
      Net Carry = Funding + Basis PnL - Spot Fees - Perp Fees - Spread/Slippage
                  - Hedge Error - Opportunity Cost - Other Verified Costs

Accounting identity enforced at EVERY checkpoint by IndependentDoubleEntryOracle:
  Assets = Liabilities + Equity
  where Liabilities == 0 (strictly zero literal borrowed principal in V3; negative perp equity
  above liquidation triggers explicit liquidation/deficit liability and halts).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum


class LedgerIntegrityError(ValueError):
    """Raised when double-entry reconciliation fails or a forbidden V3 invariant is violated."""


class EventType(str, Enum):
    """Supported exact-event accounting transitions for cash-funded V3."""

    INIT_EQUITY = "INIT_EQUITY"
    SPOT_BUY = "SPOT_BUY"
    PERP_SHORT_OPEN = "PERP_SHORT_OPEN"
    FUNDING_SETTLEMENT = "FUNDING_SETTLEMENT"
    MARK_TO_MARKET = "MARK_TO_MARKET"
    HEDGE_REBALANCE = "HEDGE_REBALANCE"
    PARTIAL_FILL = "PARTIAL_FILL"
    UNFILLED_HEDGE = "UNFILLED_HEDGE"
    SPOT_SELL = "SPOT_SELL"
    PERP_SHORT_CLOSE = "PERP_SHORT_CLOSE"
    OPPORTUNITY_COST_ACCRUAL = "OPPORTUNITY_COST_ACCRUAL"
    WRAPPED_DISCOUNT_EVENT = "WRAPPED_DISCOUNT_EVENT"
    LIQUIDATION = "LIQUIDATION"
    RESERVE_DEPLETION = "RESERVE_DEPLETION"


@dataclass(frozen=True)
class EconomicEvent:
    """Single immutable accounting event."""

    seq: int
    timestamp_utc: str
    event_type: EventType
    is_observed: bool  # True = observed venue data; False = modeled/synthetic
    qty_btc: Decimal = Decimal("0")
    price_usd: Decimal = Decimal("0")
    perp_mark_usd: Decimal = Decimal("0")
    fee_usd: Decimal = Decimal("0")
    spread_slippage_usd: Decimal = Decimal("0")
    funding_cashflow_usd: Decimal = Decimal("0")
    hedge_error_usd: Decimal = Decimal("0")
    opportunity_cost_usd: Decimal = Decimal("0")
    other_cost_usd: Decimal = Decimal("0")
    margin_transfer_usd: Decimal = Decimal("0")
    borrowed_principal_usd: Decimal = Decimal("0")  # Must ALWAYS be 0 in V3
    note: str = ""


@dataclass(frozen=True)
class AccountingCheckpoint:
    """Snapshot of Assets, Liabilities, and Equity after a single event."""

    seq: int
    event_type: EventType
    free_cash_usd: Decimal
    perp_margin_cash_usd: Decimal
    spot_market_value_usd: Decimal
    perp_unrealized_pnl_usd: Decimal
    total_assets_usd: Decimal
    total_liabilities_usd: Decimal
    total_equity_usd: Decimal
    accounting_residual_usd: Decimal
    spot_qty_btc: Decimal
    perp_short_qty_btc: Decimal
    net_delta_btc: Decimal
    liquidated: bool


@dataclass(frozen=True)
class NetCarryBreakdown:
    """Decomposed V3 Net Carry statement separating observed vs modeled components."""

    initial_equity_usd: Decimal
    ending_equity_usd: Decimal
    accounting_pnl_usd: Decimal
    funding_usd: Decimal
    basis_pnl_usd: Decimal
    spot_fees_usd: Decimal
    perp_fees_usd: Decimal
    spread_slippage_usd: Decimal
    hedge_error_usd: Decimal
    opportunity_cost_usd: Decimal
    other_verified_costs_usd: Decimal
    net_carry_after_opportunity_cost_usd: Decimal
    return_on_initial_equity: Decimal
    excess_return_over_cash_benchmark: Decimal
    liquidated: bool
    observed_events: int
    modeled_events: int
    checkpoints: tuple[AccountingCheckpoint, ...]


class CashFundedEconomicsEngine:
    """Deterministic Decimal accounting engine for cash-funded two-leg basis carry."""

    def run(
        self,
        initial_equity_usd: Decimal,
        events: list[EconomicEvent],
        maint_margin_rate: Decimal = Decimal("0.0125"),
    ) -> NetCarryBreakdown:
        if initial_equity_usd <= Decimal("0"):
            raise LedgerIntegrityError("initial_equity_usd must be positive")

        free_cash = initial_equity_usd
        perp_margin_cash = Decimal("0")
        spot_qty = Decimal("0")
        spot_cost_basis = Decimal("0")
        spot_mark = Decimal("0")
        perp_short_qty = Decimal("0")
        perp_entry_notional = Decimal("0")
        perp_mark = Decimal("0")

        realized_spot_pnl = Decimal("0")
        realized_perp_pnl = Decimal("0")
        funding_total = Decimal("0")
        spot_fees = Decimal("0")
        perp_fees = Decimal("0")
        spread_slippage = Decimal("0")
        hedge_error = Decimal("0")
        opp_cost = Decimal("0")
        other_costs = Decimal("0")
        liabilities = Decimal("0")
        liquidated = False

        observed_count = 0
        modeled_count = 0
        checkpoints: list[AccountingCheckpoint] = []

        for expected_seq, ev in enumerate(events):
            if ev.seq != expected_seq:
                raise LedgerIntegrityError(f"Non-monotonic event seq {ev.seq}, expected {expected_seq}")
            if ev.borrowed_principal_usd != Decimal("0"):
                raise LedgerIntegrityError("FORBIDDEN_BORROWED_PRINCIPAL_IN_V3")
            if ev.qty_btc < Decimal("0") or ev.price_usd < Decimal("0") or ev.perp_mark_usd < Decimal("0") or ev.margin_transfer_usd < Decimal("0"):
                raise LedgerIntegrityError("Quantity, price, and margin transfer magnitudes must be non-negative")
            if ev.fee_usd < Decimal("0") or ev.spread_slippage_usd < Decimal("0"):
                raise LedgerIntegrityError("Fees and spread/slippage magnitudes must be non-negative")
            if ev.hedge_error_usd < Decimal("0") or ev.opportunity_cost_usd < Decimal("0") or ev.other_cost_usd < Decimal("0"):
                raise LedgerIntegrityError("Cost magnitudes must be non-negative")
            if liquidated and ev.event_type in (
                EventType.SPOT_BUY,
                EventType.PARTIAL_FILL,
                EventType.PERP_SHORT_OPEN,
                EventType.HEDGE_REBALANCE,
            ):
                raise LedgerIntegrityError(f"POST_LIQUIDATION_EVENT_REJECTED:{ev.event_type.value}")

            if ev.is_observed:
                observed_count += 1
            else:
                modeled_count += 1

            et = ev.event_type
            if et == EventType.INIT_EQUITY:
                pass
            elif et in (EventType.SPOT_BUY, EventType.PARTIAL_FILL):
                # Spot buy funded strictly from free_cash (zero borrowing).
                notional = ev.qty_btc * ev.price_usd
                total_out = notional + ev.fee_usd + ev.spread_slippage_usd
                if total_out > free_cash:
                    raise LedgerIntegrityError(
                        f"Insufficient free cash for {et.value}: need {total_out}, have {free_cash}"
                    )
                free_cash -= total_out
                spot_qty += ev.qty_btc
                spot_cost_basis += notional
                spot_mark = ev.price_usd
                spot_fees += ev.fee_usd
                spread_slippage += ev.spread_slippage_usd
            elif et == EventType.PERP_SHORT_OPEN:
                # Post explicit USDC initial margin from free_cash into perp margin wallet.
                if ev.margin_transfer_usd > free_cash:
                    raise LedgerIntegrityError(
                        f"Insufficient free cash for perp IM: need {ev.margin_transfer_usd}, have {free_cash}"
                    )
                free_cash -= ev.margin_transfer_usd
                perp_margin_cash += ev.margin_transfer_usd
                perp_margin_cash -= (ev.fee_usd + ev.spread_slippage_usd)
                perp_short_qty += ev.qty_btc
                perp_entry_notional += ev.qty_btc * ev.price_usd
                perp_mark = ev.price_usd
                perp_fees += ev.fee_usd
                spread_slippage += ev.spread_slippage_usd
            elif et == EventType.FUNDING_SETTLEMENT:
                perp_margin_cash += ev.funding_cashflow_usd
                funding_total += ev.funding_cashflow_usd
            elif et == EventType.MARK_TO_MARKET:
                if ev.price_usd > Decimal("0"):
                    spot_mark = ev.price_usd
                if ev.perp_mark_usd > Decimal("0"):
                    perp_mark = ev.perp_mark_usd
            elif et == EventType.HEDGE_REBALANCE:
                # Transfer cash from free_cash to perp_margin_cash and/or pay rebalance friction.
                if ev.margin_transfer_usd > Decimal("0"):
                    if ev.margin_transfer_usd > free_cash:
                        raise LedgerIntegrityError("Free reserve exhausted during hedge rebalance")
                    free_cash -= ev.margin_transfer_usd
                    perp_margin_cash += ev.margin_transfer_usd
                perp_margin_cash -= (ev.fee_usd + ev.spread_slippage_usd)
                perp_fees += ev.fee_usd
                spread_slippage += ev.spread_slippage_usd
            elif et == EventType.UNFILLED_HEDGE:
                free_cash -= ev.hedge_error_usd
                hedge_error += ev.hedge_error_usd
            elif et == EventType.WRAPPED_DISCOUNT_EVENT:
                # Explicit wrapped/bridge depeg impact on spot mark or direct verified cost.
                if ev.price_usd > Decimal("0"):
                    spot_mark = ev.price_usd
                if ev.other_cost_usd > Decimal("0"):
                    free_cash -= ev.other_cost_usd
                    other_costs += ev.other_cost_usd
            elif et == EventType.SPOT_SELL:
                if ev.qty_btc > spot_qty:
                    raise LedgerIntegrityError("Cannot sell more spot BTC than held")
                avg_cost = spot_cost_basis / spot_qty if spot_qty > Decimal("0") else Decimal("0")
                proceeds = ev.qty_btc * ev.price_usd
                realized_spot_pnl += proceeds - (ev.qty_btc * avg_cost)
                spot_cost_basis -= ev.qty_btc * avg_cost
                spot_qty -= ev.qty_btc
                free_cash += proceeds - ev.fee_usd - ev.spread_slippage_usd
                spot_mark = ev.price_usd
                spot_fees += ev.fee_usd
                spread_slippage += ev.spread_slippage_usd
            elif et == EventType.PERP_SHORT_CLOSE:
                if ev.qty_btc > perp_short_qty:
                    raise LedgerIntegrityError("Cannot close more short perp BTC than open")
                avg_entry = perp_entry_notional / perp_short_qty if perp_short_qty > Decimal("0") else Decimal("0")
                pnl = ev.qty_btc * (avg_entry - ev.price_usd)
                realized_perp_pnl += pnl
                perp_entry_notional -= ev.qty_btc * avg_entry
                perp_short_qty -= ev.qty_btc
                perp_margin_cash += pnl - ev.fee_usd - ev.spread_slippage_usd
                perp_mark = ev.price_usd
                perp_fees += ev.fee_usd
                spread_slippage += ev.spread_slippage_usd
                if perp_short_qty == Decimal("0") and perp_margin_cash > Decimal("0"):
                    # Return released margin to free_cash cleanly.
                    free_cash += perp_margin_cash
                    perp_margin_cash = Decimal("0")
            elif et == EventType.OPPORTUNITY_COST_ACCRUAL:
                # Memo benchmark cost (does not reduce cash assets; reduces economic net carry).
                opp_cost += ev.opportunity_cost_usd
            elif et == EventType.RESERVE_DEPLETION:
                free_cash -= ev.other_cost_usd
                other_costs += ev.other_cost_usd
            elif et == EventType.LIQUIDATION:
                # Forced close of short perp at liquidation price + liquidation penalty fee.
                if ev.perp_mark_usd > Decimal("0"):
                    perp_mark = ev.perp_mark_usd
                if perp_short_qty > Decimal("0"):
                    avg_entry = perp_entry_notional / perp_short_qty
                    pnl = perp_short_qty * (avg_entry - perp_mark)
                    realized_perp_pnl += pnl
                    perp_margin_cash += pnl - ev.fee_usd - ev.other_cost_usd
                    perp_short_qty = Decimal("0")
                    perp_entry_notional = Decimal("0")
                    perp_fees += ev.fee_usd
                    other_costs += ev.other_cost_usd
                liquidated = True
            else:
                raise LedgerIntegrityError(f"Unsupported event type: {et}")

            # Check automatic short-perp liquidation condition if still open.
            spot_mv = spot_qty * spot_mark
            perp_upnl = perp_entry_notional - (perp_short_qty * perp_mark) if perp_short_qty > Decimal("0") else Decimal("0")
            perp_notional = perp_short_qty * perp_mark
            perp_wallet_equity = perp_margin_cash + perp_upnl
            if perp_short_qty > Decimal("0") and perp_wallet_equity <= perp_notional * maint_margin_rate:
                liquidated = True

            # Handle negative cash deficits as explicit accumulated liabilities (so Assets = Liabilities + Equity).
            if perp_margin_cash < Decimal("0") and perp_short_qty == Decimal("0"):
                liabilities += -perp_margin_cash
                perp_margin_cash = Decimal("0")
            if free_cash < Decimal("0"):
                liabilities += -free_cash
                free_cash = Decimal("0")

            total_assets = free_cash + perp_margin_cash + spot_mv + perp_upnl
            spot_upnl = spot_mv - spot_cost_basis
            basis_pnl = realized_spot_pnl + spot_upnl + realized_perp_pnl + perp_upnl
            accounting_pnl = (
                funding_total
                + basis_pnl
                - spot_fees
                - perp_fees
                - spread_slippage
                - hedge_error
                - other_costs
            )
            total_equity = initial_equity_usd + accounting_pnl
            residual = total_assets - (liabilities + total_equity)

            checkpoints.append(
                AccountingCheckpoint(
                    seq=ev.seq,
                    event_type=et,
                    free_cash_usd=free_cash,
                    perp_margin_cash_usd=perp_margin_cash,
                    spot_market_value_usd=spot_mv,
                    perp_unrealized_pnl_usd=perp_upnl,
                    total_assets_usd=total_assets,
                    total_liabilities_usd=liabilities,
                    total_equity_usd=total_equity,
                    accounting_residual_usd=residual,
                    spot_qty_btc=spot_qty,
                    perp_short_qty_btc=perp_short_qty,
                    net_delta_btc=spot_qty - perp_short_qty,
                    liquidated=liquidated,
                )
            )

        last = checkpoints[-1] if checkpoints else None
        ending_equity = last.total_equity_usd if last else initial_equity_usd
        accounting_pnl = ending_equity - initial_equity_usd
        spot_upnl = (spot_qty * spot_mark) - spot_cost_basis
        perp_upnl = perp_entry_notional - (perp_short_qty * perp_mark) if perp_short_qty > Decimal("0") else Decimal("0")
        basis_pnl = realized_spot_pnl + spot_upnl + realized_perp_pnl + perp_upnl
        net_carry_after_opp = (
            funding_total
            + basis_pnl
            - spot_fees
            - perp_fees
            - spread_slippage
            - hedge_error
            - opp_cost
            - other_costs
        )
        return NetCarryBreakdown(
            initial_equity_usd=initial_equity_usd,
            ending_equity_usd=ending_equity,
            accounting_pnl_usd=accounting_pnl,
            funding_usd=funding_total,
            basis_pnl_usd=basis_pnl,
            spot_fees_usd=spot_fees,
            perp_fees_usd=perp_fees,
            spread_slippage_usd=spread_slippage,
            hedge_error_usd=hedge_error,
            opportunity_cost_usd=opp_cost,
            other_verified_costs_usd=other_costs,
            net_carry_after_opportunity_cost_usd=net_carry_after_opp,
            return_on_initial_equity=accounting_pnl / initial_equity_usd,
            excess_return_over_cash_benchmark=net_carry_after_opp / initial_equity_usd,
            liquidated=liquidated,
            observed_events=observed_count,
            modeled_events=modeled_count,
            checkpoints=tuple(checkpoints),
        )


class IndependentDoubleEntryOracle:
    """Independent double-entry Decimal verifier.

    Replays the raw event stream using a separate balance-sheet journal (Debit/Credit
    accounts) and verifies:
      1. Assets == Liabilities + Equity at EVERY checkpoint (exact Decimal tolerance <= 1e-12).
      2. Zero literal borrowed principal across all events.
      3. Exact agreement with CashFundedEconomicsEngine checkpoints and ending Net Carry.
      4. Fails loudly on deliberately corrupted event histories or tampered checkpoints.
    """

    TOLERANCE = Decimal("1e-12")

    def verify(
        self,
        initial_equity_usd: Decimal,
        events: list[EconomicEvent],
        reported: NetCarryBreakdown,
    ) -> dict[str, object]:
        # Independent sub-wallet journal balances (Debit-normal assets, Credit-normal equity/liabilities)
        debit_free_cash = initial_equity_usd
        debit_perp_cash = Decimal("0")
        debit_spot_cost = Decimal("0")
        debit_spot_reval = Decimal("0")
        debit_perp_upnl = Decimal("0")
        credit_contributed_equity = initial_equity_usd
        credit_retained_pnl = Decimal("0")
        credit_liabilities = Decimal("0")

        spot_qty = Decimal("0")
        spot_mark = Decimal("0")
        perp_qty = Decimal("0")
        perp_entry = Decimal("0")
        perp_mark = Decimal("0")
        opp_memo = Decimal("0")

        if len(reported.checkpoints) != len(events):
            raise LedgerIntegrityError(
                f"Checkpoint count mismatch: reported={len(reported.checkpoints)} vs events={len(events)}"
            )

        max_residual = Decimal("0")
        for ev, cp in zip(events, reported.checkpoints, strict=True):
            if ev.borrowed_principal_usd != Decimal("0"):
                raise LedgerIntegrityError("Oracle detected forbidden borrowed principal")

            et = ev.event_type
            if et in (EventType.SPOT_BUY, EventType.PARTIAL_FILL):
                notional = ev.qty_btc * ev.price_usd
                debit_free_cash -= (notional + ev.fee_usd + ev.spread_slippage_usd)
                debit_spot_cost += notional
                credit_retained_pnl -= (ev.fee_usd + ev.spread_slippage_usd)
                spot_qty += ev.qty_btc
                spot_mark = ev.price_usd
            elif et == EventType.PERP_SHORT_OPEN:
                debit_free_cash -= ev.margin_transfer_usd
                debit_perp_cash += ev.margin_transfer_usd - (ev.fee_usd + ev.spread_slippage_usd)
                credit_retained_pnl -= (ev.fee_usd + ev.spread_slippage_usd)
                perp_qty += ev.qty_btc
                perp_entry += ev.qty_btc * ev.price_usd
                perp_mark = ev.price_usd
            elif et == EventType.FUNDING_SETTLEMENT:
                debit_perp_cash += ev.funding_cashflow_usd
                credit_retained_pnl += ev.funding_cashflow_usd
            elif et == EventType.MARK_TO_MARKET:
                if ev.price_usd > Decimal("0"):
                    spot_mark = ev.price_usd
                if ev.perp_mark_usd > Decimal("0"):
                    perp_mark = ev.perp_mark_usd
            elif et == EventType.HEDGE_REBALANCE:
                if ev.margin_transfer_usd > Decimal("0"):
                    debit_free_cash -= ev.margin_transfer_usd
                    debit_perp_cash += ev.margin_transfer_usd
                debit_perp_cash -= (ev.fee_usd + ev.spread_slippage_usd)
                credit_retained_pnl -= (ev.fee_usd + ev.spread_slippage_usd)
            elif et == EventType.UNFILLED_HEDGE:
                debit_free_cash -= ev.hedge_error_usd
                credit_retained_pnl -= ev.hedge_error_usd
            elif et == EventType.WRAPPED_DISCOUNT_EVENT:
                if ev.price_usd > Decimal("0"):
                    spot_mark = ev.price_usd
                debit_free_cash -= ev.other_cost_usd
                credit_retained_pnl -= ev.other_cost_usd
            elif et == EventType.SPOT_SELL:
                avg = debit_spot_cost / spot_qty if spot_qty > Decimal("0") else Decimal("0")
                proceeds = ev.qty_btc * ev.price_usd
                cost_out = ev.qty_btc * avg
                debit_spot_cost -= cost_out
                debit_free_cash += (proceeds - ev.fee_usd - ev.spread_slippage_usd)
                credit_retained_pnl += (proceeds - cost_out - ev.fee_usd - ev.spread_slippage_usd)
                spot_qty -= ev.qty_btc
                spot_mark = ev.price_usd
            elif et == EventType.PERP_SHORT_CLOSE:
                avg = perp_entry / perp_qty if perp_qty > Decimal("0") else Decimal("0")
                pnl = ev.qty_btc * (avg - ev.price_usd)
                perp_entry -= ev.qty_btc * avg
                perp_qty -= ev.qty_btc
                debit_perp_cash += (pnl - ev.fee_usd - ev.spread_slippage_usd)
                credit_retained_pnl += (pnl - ev.fee_usd - ev.spread_slippage_usd)
                perp_mark = ev.price_usd
                if perp_qty == Decimal("0") and debit_perp_cash > Decimal("0"):
                    debit_free_cash += debit_perp_cash
                    debit_perp_cash = Decimal("0")
            elif et == EventType.OPPORTUNITY_COST_ACCRUAL:
                opp_memo += ev.opportunity_cost_usd
            elif et == EventType.RESERVE_DEPLETION:
                debit_free_cash -= ev.other_cost_usd
                credit_retained_pnl -= ev.other_cost_usd
            elif et == EventType.LIQUIDATION:
                if ev.perp_mark_usd > Decimal("0"):
                    perp_mark = ev.perp_mark_usd
                if perp_qty > Decimal("0"):
                    avg = perp_entry / perp_qty
                    pnl = perp_qty * (avg - perp_mark)
                    debit_perp_cash += (pnl - ev.fee_usd - ev.other_cost_usd)
                    credit_retained_pnl += (pnl - ev.fee_usd - ev.other_cost_usd)
                    perp_qty = Decimal("0")
                    perp_entry = Decimal("0")

            # Recompute unrealized revaluations independently
            new_spot_reval = (spot_qty * spot_mark) - debit_spot_cost
            new_perp_upnl = (perp_entry - (perp_qty * perp_mark)) if perp_qty > Decimal("0") else Decimal("0")
            credit_retained_pnl += (new_spot_reval - debit_spot_reval) + (new_perp_upnl - debit_perp_upnl)
            debit_spot_reval = new_spot_reval
            debit_perp_upnl = new_perp_upnl

            # Mirror cash deficits as accumulated liabilities so Assets = Liabilities + Equity
            if debit_perp_cash < Decimal("0") and perp_qty == Decimal("0"):
                credit_liabilities += -debit_perp_cash
                debit_perp_cash = Decimal("0")
            if debit_free_cash < Decimal("0"):
                credit_liabilities += -debit_free_cash
                debit_free_cash = Decimal("0")

            oracle_assets = debit_free_cash + debit_perp_cash + debit_spot_cost + debit_spot_reval + debit_perp_upnl
            oracle_equity = credit_contributed_equity + credit_retained_pnl
            oracle_residual = abs(oracle_assets - (credit_liabilities + oracle_equity))
            max_residual = max(max_residual, oracle_residual)

            if oracle_residual > self.TOLERANCE:
                raise LedgerIntegrityError(
                    f"Oracle balance sheet failed at seq={ev.seq}: residual={oracle_residual}"
                )
            if abs(cp.total_assets_usd - oracle_assets) > self.TOLERANCE:
                raise LedgerIntegrityError(
                    f"Reported assets mismatch at seq={ev.seq}: {cp.total_assets_usd} != {oracle_assets}"
                )
            if abs(cp.total_liabilities_usd - credit_liabilities) > self.TOLERANCE:
                raise LedgerIntegrityError(
                    f"Reported liabilities mismatch at seq={ev.seq}: {cp.total_liabilities_usd} != {credit_liabilities}"
                )
            if abs(cp.total_equity_usd - oracle_equity) > self.TOLERANCE:
                raise LedgerIntegrityError(
                    f"Reported equity mismatch at seq={ev.seq}: {cp.total_equity_usd} != {oracle_equity}"
                )
            if abs(cp.accounting_residual_usd) > self.TOLERANCE:
                raise LedgerIntegrityError(
                    f"Non-zero reported accounting residual at seq={ev.seq}: {cp.accounting_residual_usd}"
                )

        # Final net carry identity cross-check
        expected_net_carry = (reported.ending_equity_usd - initial_equity_usd) - opp_memo
        if abs(reported.net_carry_after_opportunity_cost_usd - expected_net_carry) > self.TOLERANCE:
            raise LedgerIntegrityError(
                f"Net carry mismatch: reported={reported.net_carry_after_opportunity_cost_usd} vs oracle={expected_net_carry}"
            )

        return {
            "verified": True,
            "checkpoints_checked": len(events),
            "max_balance_sheet_residual_usd": str(max_residual),
            "final_assets_usd": str(reported.checkpoints[-1].total_assets_usd if reported.checkpoints else initial_equity_usd),
            "final_liabilities_usd": str(reported.checkpoints[-1].total_liabilities_usd if reported.checkpoints else Decimal("0")),
            "final_equity_usd": str(reported.ending_equity_usd),
        }
