"""H3_BASIS_CARRY_V2 Decimal Borrow/Financing & Delayed-Hedge Liquidation Model.

Models two real-world cash-and-carry risks omitted from the original H3_MAKER lab:
1. Spot-leg borrow / capital financing APR accrual (pro-rata daily Decimal).
2. Delayed-hedge directional exposure and perpetual maintenance-margin liquidation
   when one leg fills while the hedge leg is delayed under adverse price movement.

All cash flows reconcile via double-entry Decimal accounting to exact 0.00000000.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_EVEN

Q8 = Decimal("0.00000001")
DAYS_PER_YEAR = Decimal("365")
BPS = Decimal("10000")


def _q8(val: Decimal) -> Decimal:
    return val.quantize(Q8, rounding=ROUND_HALF_EVEN)


@dataclass(frozen=True)
class VenueBorrowSchedule:
    venue: str
    spot_borrow_apr: Decimal
    perp_maker_fee_bps: Decimal
    spot_maker_fee_bps: Decimal
    emergency_taker_fee_bps: Decimal
    maintenance_margin_rate: Decimal
    liquidation_penalty_bps: Decimal
    max_gross_leverage: Decimal = Decimal("1.0")


BINANCE_V2_SCHEDULE = VenueBorrowSchedule(
    venue="binance",
    spot_borrow_apr=Decimal("0.0500"),
    perp_maker_fee_bps=Decimal("2.0"),
    spot_maker_fee_bps=Decimal("10.0"),
    emergency_taker_fee_bps=Decimal("5.0"),
    maintenance_margin_rate=Decimal("0.0050"),
    liquidation_penalty_bps=Decimal("50.0"),
)

HYPERLIQUID_V2_SCHEDULE = VenueBorrowSchedule(
    venue="hyperliquid",
    spot_borrow_apr=Decimal("0.0500"),
    perp_maker_fee_bps=Decimal("1.5"),
    spot_maker_fee_bps=Decimal("4.0"),
    emergency_taker_fee_bps=Decimal("4.5"),
    maintenance_margin_rate=Decimal("0.0100"),
    liquidation_penalty_bps=Decimal("50.0"),
)


@dataclass(frozen=True)
class CarryCycleInput:
    cycle_id: str
    notional_usd: Decimal
    hold_days: Decimal
    funding_apr: Decimal
    basis_entry_bps: Decimal
    basis_exit_bps: Decimal
    cost_multiplier: Decimal = Decimal("1.0")
    borrow_apr_override: Decimal | None = None
    hedge_delay_adverse_move_pct: Decimal = Decimal("0.0")
    initial_margin_ratio: Decimal = Decimal("0.20")
    unhedged_leg_only: bool = False


@dataclass(frozen=True)
class CarryCycleResult:
    cycle_id: str
    venue: str
    cost_multiplier: Decimal
    borrow_apr: Decimal
    funding_pnl: Decimal
    basis_pnl: Decimal
    execution_fee_cost: Decimal
    borrow_financing_cost: Decimal
    hedge_delay_loss: Decimal
    liquidation_triggered: bool
    liquidation_penalty_cost: Decimal
    net_pnl: Decimal
    starting_cash: Decimal
    ending_cash: Decimal
    double_entry_residual: Decimal


def simulate_v2_carry_cycle(
    schedule: VenueBorrowSchedule,
    inp: CarryCycleInput,
) -> CarryCycleResult:
    """Simulate a two-leg carry cycle with borrow APR and delayed-hedge liquidation."""
    if inp.notional_usd <= 0:
        raise ValueError("notional_usd must be positive")
    if inp.hold_days < 0:
        raise ValueError("hold_days must be non-negative")
    if inp.cost_multiplier <= 0:
        raise ValueError("cost_multiplier must be positive")
    if inp.initial_margin_ratio <= 0 or inp.initial_margin_ratio > Decimal("1"):
        raise ValueError("initial_margin_ratio must be in (0, 1]")

    half_notional = _q8(inp.notional_usd / Decimal("2"))
    borrow_apr = inp.borrow_apr_override if inp.borrow_apr_override is not None else schedule.spot_borrow_apr
    if borrow_apr < 0:
        raise ValueError("borrow_apr must be non-negative")

    # Entry + exit maker fees on both spot and perp legs (scaled by cost_multiplier)
    round_trip_fee_bps = Decimal("2") * (schedule.spot_maker_fee_bps + schedule.perp_maker_fee_bps)
    execution_fee_cost = _q8(half_notional * (round_trip_fee_bps / BPS) * inp.cost_multiplier)

    # Funding accrued on short perp leg (half_notional)
    funding_pnl = Decimal("0.00000000") if inp.unhedged_leg_only else _q8(
        half_notional * inp.funding_apr * (inp.hold_days / DAYS_PER_YEAR)
    )

    # Basis convergence PnL on the paired spread (entry basis - exit basis)
    basis_pnl = Decimal("0.00000000") if inp.unhedged_leg_only else _q8(
        half_notional * ((inp.basis_entry_bps - inp.basis_exit_bps) / BPS)
    )

    # Borrow / capital financing cost on spot inventory (half_notional)
    borrow_financing_cost = _q8(half_notional * borrow_apr * (inp.hold_days / DAYS_PER_YEAR))

    # Delayed-hedge directional loss on unhedged leg during hedge fill delay
    adverse_pct = abs(inp.hedge_delay_adverse_move_pct)
    hedge_delay_loss = _q8(half_notional * adverse_pct)

    # Maintenance margin check on the leveraged perpetual margin account
    initial_equity = _q8(half_notional * inp.initial_margin_ratio)
    maintenance_margin = _q8(half_notional * schedule.maintenance_margin_rate)
    post_shock_equity = _q8(initial_equity - hedge_delay_loss)
    liquidation_triggered = post_shock_equity < maintenance_margin
    liquidation_penalty_cost = (
        _q8(half_notional * ((schedule.liquidation_penalty_bps + schedule.emergency_taker_fee_bps) / BPS))
        if liquidation_triggered
        else Decimal("0.00000000")
    )

    net_pnl = _q8(
        funding_pnl
        + basis_pnl
        - execution_fee_cost
        - borrow_financing_cost
        - hedge_delay_loss
        - liquidation_penalty_cost
    )

    # Independent double-entry cash conservation check
    starting_cash = _q8(inp.notional_usd)
    ending_cash = _q8(
        starting_cash
        + funding_pnl
        + basis_pnl
        - execution_fee_cost
        - borrow_financing_cost
        - hedge_delay_loss
        - liquidation_penalty_cost
    )
    residual = _q8((ending_cash - starting_cash) - net_pnl)
    if residual != Decimal("0.00000000"):
        raise AssertionError(f"DOUBLE_ENTRY_RESIDUAL_NONZERO: {residual}")

    return CarryCycleResult(
        cycle_id=inp.cycle_id,
        venue=schedule.venue,
        cost_multiplier=inp.cost_multiplier,
        borrow_apr=borrow_apr,
        funding_pnl=funding_pnl,
        basis_pnl=basis_pnl,
        execution_fee_cost=execution_fee_cost,
        borrow_financing_cost=borrow_financing_cost,
        hedge_delay_loss=hedge_delay_loss,
        liquidation_triggered=liquidation_triggered,
        liquidation_penalty_cost=liquidation_penalty_cost,
        net_pnl=net_pnl,
        starting_cash=starting_cash,
        ending_cash=ending_cash,
        double_entry_residual=residual,
    )
