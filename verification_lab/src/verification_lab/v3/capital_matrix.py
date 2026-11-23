"""Five-tier ($100 / $500 / $1,000 / $5,000 / $10,000) × Three-Route Capital Feasibility Matrix.

Uses exact Decimal arithmetic and live-probed venue metadata rules.
Never shrinks the free liquidity reserve to manufacture eligibility.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN

from .models import AllocationPolicy, VenueRoute, VenueRouteSpec

CAPITAL_TIERS_USD: tuple[Decimal, ...] = (
    Decimal("100"),
    Decimal("500"),
    Decimal("1000"),
    Decimal("5000"),
    Decimal("10000"),
)

BPS = Decimal("10000")
DAYS_PER_YEAR = Decimal("365")


def _floor_to_step(qty: Decimal, step: Decimal) -> Decimal:
    if qty <= Decimal("0") or step <= Decimal("0"):
        return Decimal("0")
    return (qty / step).to_integral_value(rounding=ROUND_DOWN) * step


@dataclass(frozen=True)
class CapitalTierCell:
    """All 20 mandated feasibility metrics for one (route, capital_tier) cell."""

    route: VenueRoute
    capital_tier_usd: Decimal
    # 1-3: Order sizing & rounding
    min_spot_order_usd: Decimal
    min_perp_position_usd: Decimal
    target_leg_notional_usd: Decimal
    spot_qty_btc: Decimal
    perp_qty_btc: Decimal
    actual_spot_notional_usd: Decimal
    actual_perp_notional_usd: Decimal
    rounding_mismatch_btc: Decimal
    rounding_mismatch_usd: Decimal
    # 4-6: Capital accounting (Initial Equity = Spot + Perp IM + Free Reserve)
    initial_margin_usd: Decimal
    maintenance_margin_usd: Decimal
    free_cash_reserve_usd: Decimal
    # 7-10: Costs & break-even
    two_leg_round_trip_fees_usd: Decimal
    two_leg_round_trip_spread_usd: Decimal
    two_leg_total_friction_usd: Decimal
    one_leg_failure_cost_usd: Decimal
    min_viable_funding_annual_bps: Decimal
    break_even_holding_days: Decimal
    # 11-13: Returns & benchmark
    holding_days_horizon: int
    gross_funding_usd: Decimal
    opportunity_cost_usd: Decimal
    net_return_after_costs_usd: Decimal
    return_on_initial_equity_pct: Decimal
    cash_benchmark_return_pct: Decimal
    excess_over_cash_benchmark_pct: Decimal
    # 14-16: Risk & stress
    liquidation_buffer_pct: Decimal
    adverse_funding_reversal_loss_usd: Decimal
    max_modeled_stress_loss_usd: Decimal
    # 17-20: Operations, access, confidence, verdict
    required_operational_availability: str
    venue_access_classification: str
    data_confidence_classification: str
    final_eligibility_verdict: str
    infeasibility_reasons: tuple[str, ...]


def evaluate_capital_tier_cell(
    spec: VenueRouteSpec,
    capital_usd: Decimal,
    policy: AllocationPolicy | None = None,
    holding_days: int = 90,
    cash_benchmark_annual_bps: Decimal = Decimal("400"),  # 4.00% T-bill/USDC opportunity cost
    use_taker_entry_exit: bool = True,
) -> CapitalTierCell:
    """Evaluate a single (VenueRouteSpec, capital_usd) cell with exact Decimal arithmetic."""
    pol = policy or AllocationPolicy()

    # Minimum venue order sizes in USD (max of minNotional and minQty * price)
    min_spot_usd = max(spec.spot_min_notional_usd, spec.spot_min_qty * spec.spot_price_usd)
    min_perp_usd = max(spec.perp_min_notional_usd, spec.perp_min_qty * spec.perp_price_usd)

    # Strictly cash-funded target allocation without violating free reserve floor
    target_spot_budget = capital_usd * pol.spot_ratio
    target_perp_im = capital_usd * pol.perp_im_ratio
    target_free_reserve = capital_usd * pol.free_reserve_ratio

    # Quantize both legs to venue stepSize; enforce matched hedge using coarser step
    raw_spot_qty = target_spot_budget / spec.spot_price_usd
    raw_perp_qty = target_spot_budget / spec.perp_price_usd
    spot_qty = _floor_to_step(raw_spot_qty, spec.spot_step_size)
    perp_qty = _floor_to_step(raw_perp_qty, spec.perp_step_size)

    # Match spot to perp step if perp is coarser (e.g. Binance perp 0.001 BTC) to avoid naked delta
    if spec.perp_step_size > spec.spot_step_size and perp_qty > Decimal("0"):
        matched_spot_qty = _floor_to_step(perp_qty, spec.spot_step_size)
        spot_qty = min(spot_qty, matched_spot_qty)

    actual_spot_notional = spot_qty * spec.spot_price_usd
    actual_perp_notional = perp_qty * spec.perp_price_usd
    rounding_mismatch_btc = abs(spot_qty - perp_qty)
    rounding_mismatch_usd = rounding_mismatch_btc * spec.perp_price_usd

    # Recompute exact IM, MM, and free cash reserve (never reduce reserve below policy floor)
    effective_perp_im = max(target_perp_im, actual_perp_notional * spec.perp_initial_margin_rate)
    maint_margin = actual_perp_notional * spec.perp_maint_margin_rate
    # Actual free cash after funding spot notional + perp IM
    free_reserve = capital_usd - actual_spot_notional - effective_perp_im

    # Two-leg round-trip fees (entry + exit) and two-leg bid/ask spread (entry + exit)
    spot_fee_bps = spec.spot_taker_fee_bps if use_taker_entry_exit else spec.spot_maker_fee_bps
    perp_fee_bps = spec.perp_taker_fee_bps if use_taker_entry_exit else spec.perp_maker_fee_bps
    # Round trip = 2x one-way fee per leg
    rt_spot_fees = actual_spot_notional * (Decimal("2") * spot_fee_bps / BPS)
    rt_perp_fees = actual_perp_notional * (Decimal("2") * perp_fee_bps / BPS)
    two_leg_rt_fees = rt_spot_fees + rt_perp_fees

    # Half-spread paid on entry + half-spread paid on exit = 1 full spread per leg round-trip
    spot_spread_ratio = (spec.spot_ask_usd - spec.spot_bid_usd) / spec.spot_price_usd
    perp_spread_ratio = (spec.perp_ask_usd - spec.perp_bid_usd) / spec.perp_price_usd
    two_leg_rt_spread = (actual_spot_notional * spot_spread_ratio) + (actual_perp_notional * perp_spread_ratio)
    transfer_friction = spec.cross_venue_transfer_fee_usd * Decimal("2")  # enter + unwind
    total_rt_friction = two_leg_rt_fees + two_leg_rt_spread + transfer_friction

    # One-leg failure cost: emergency taker unwind + 25 bps adverse slippage on unhedged leg
    unhedged_notional = max(actual_spot_notional, actual_perp_notional)
    one_leg_failure_cost = unhedged_notional * ((spec.perp_taker_fee_bps + Decimal("25")) / BPS)

    # Funding & opportunity cost over holding_days horizon
    horizon_frac = Decimal(holding_days) / DAYS_PER_YEAR
    # Use historical mean funding (conservative vs single-hour live spike) for horizon economics
    gross_funding_usd = actual_perp_notional * (spec.historical_mean_funding_bps / BPS) * horizon_frac
    opp_cost_usd = capital_usd * (cash_benchmark_annual_bps / BPS) * horizon_frac
    op_penalty_usd = actual_spot_notional * (spec.operational_penalty_bps_annual / BPS) * horizon_frac

    # Accounting net return (before cash opportunity cost) and economic net carry (after opportunity cost)
    net_accounting_usd = gross_funding_usd - total_rt_friction - op_penalty_usd
    net_economic_usd = net_accounting_usd - opp_cost_usd
    roe_pct = (net_accounting_usd / capital_usd) * Decimal("100")
    cash_bench_pct = (opp_cost_usd / capital_usd) * Decimal("100")
    excess_pct = (net_economic_usd / capital_usd) * Decimal("100")

    # Minimum viable annual funding (bps on perp leg) to cover RT friction + opp cost + op penalty over holding_days
    if actual_perp_notional > Decimal("0"):
        required_gross_usd = total_rt_friction + opp_cost_usd + op_penalty_usd
        min_viable_funding_bps = (required_gross_usd / (actual_perp_notional * horizon_frac)) * BPS
        daily_net_funding = (
            actual_perp_notional * ((spec.historical_mean_funding_bps - spec.operational_penalty_bps_annual) / BPS)
            - capital_usd * (cash_benchmark_annual_bps / BPS)
        ) / DAYS_PER_YEAR
        if daily_net_funding > Decimal("0"):
            be_days = total_rt_friction / daily_net_funding
        else:
            be_days = Decimal("999999")
    else:
        min_viable_funding_bps = Decimal("999999")
        be_days = Decimal("999999")

    # Liquidation buffer: % upward BTC move before perp IM + free_reserve (if same-venue) hits maintenance margin
    # Conservative: count only perp IM (before manual transfer) for immediate liquidation distance
    if actual_perp_notional > Decimal("0"):
        liq_buffer_pct = ((effective_perp_im - maint_margin) / actual_perp_notional) * Decimal("100")
    else:
        liq_buffer_pct = Decimal("0")

    # Adverse funding reversal loss: 14 days at -1500 bps annualized (-15% APR)
    adverse_funding_loss = actual_perp_notional * (Decimal("1500") / BPS) * (Decimal("14") / DAYS_PER_YEAR)

    # Max modeled stress loss: 15% basis dislocation + 2x friction + adverse funding + wrapper depeg (5% if wrapped)
    basis_stress_loss = actual_perp_notional * Decimal("0.15")
    wrapper_loss = actual_spot_notional * Decimal("0.05") if spec.is_wrapped_spot else Decimal("0")
    max_stress_loss = min(
        capital_usd,
        basis_stress_loss + (Decimal("2") * total_rt_friction) + adverse_funding_loss + wrapper_loss,
    )

    # Strict infeasibility checks (never reduce reserves to manufacture eligibility)
    reasons: list[str] = []
    if spot_qty < spec.spot_min_qty or actual_spot_notional < spec.spot_min_notional_usd:
        reasons.append(
            f"SPOT_BELOW_MIN_ORDER(actual=${actual_spot_notional:.2f}<min=${min_spot_usd:.2f})"
        )
    if perp_qty < spec.perp_min_qty or actual_perp_notional < spec.perp_min_notional_usd:
        reasons.append(
            f"PERP_BELOW_MIN_ORDER(actual=${actual_perp_notional:.2f}<min=${min_perp_usd:.2f})"
        )
    if free_reserve < capital_usd * pol.min_free_reserve_ratio:
        reasons.append(
            f"FREE_RESERVE_BELOW_FLOOR(${free_reserve:.2f}<${capital_usd * pol.min_free_reserve_ratio:.2f})"
        )
    if actual_perp_notional > Decimal("0") and (rounding_mismatch_usd / actual_perp_notional) > Decimal("0.05"):
        reasons.append(f"LOT_SIZE_HEDGE_MISMATCH_GT_5PCT(${rounding_mismatch_usd:.2f})")
    if net_economic_usd <= Decimal("0"):
        reasons.append(f"NEGATIVE_EXCESS_CARRY_OVER_CASH(${net_economic_usd:.2f})")

    if any(r.startswith(("SPOT_BELOW_MIN", "PERP_BELOW_MIN", "FREE_RESERVE_BELOW")) for r in reasons):
        verdict = "INFEASIBLE_BELOW_VENUE_MINIMUMS"
    elif spec.venue_access_classification == "VENUE_ACCESS_NOT_VERIFIED":
        verdict = (
            "INFEASIBLE_NEGATIVE_EXCESS_CARRY_AND_UNVERIFIED_ACCESS"
            if net_economic_usd <= Decimal("0")
            else "UNVERIFIED_VENUE_ACCESS_MECHANICALLY_SIZABLE"
        )
    elif net_economic_usd <= Decimal("0"):
        verdict = "INFEASIBLE_NEGATIVE_NET_CARRY_AFTER_OPP_COST"
    else:
        verdict = "MECHANICALLY_FEASIBLE_RESEARCH_CANDIDATE_NOT_VALIDATED"

    op_avail = (
        "24/7_DUAL_VENUE_BRIDGE_MONITORING"
        if spec.route == VenueRoute.CROSS_VENUE_BN_SPOT_HL_PERP
        else "24/7_SINGLE_VENUE_MARGIN_MONITORING"
    )

    return CapitalTierCell(
        route=spec.route,
        capital_tier_usd=capital_usd,
        min_spot_order_usd=min_spot_usd,
        min_perp_position_usd=min_perp_usd,
        target_leg_notional_usd=target_spot_budget,
        spot_qty_btc=spot_qty,
        perp_qty_btc=perp_qty,
        actual_spot_notional_usd=actual_spot_notional,
        actual_perp_notional_usd=actual_perp_notional,
        rounding_mismatch_btc=rounding_mismatch_btc,
        rounding_mismatch_usd=rounding_mismatch_usd,
        initial_margin_usd=effective_perp_im,
        maintenance_margin_usd=maint_margin,
        free_cash_reserve_usd=free_reserve,
        two_leg_round_trip_fees_usd=two_leg_rt_fees,
        two_leg_round_trip_spread_usd=two_leg_rt_spread,
        two_leg_total_friction_usd=total_rt_friction,
        one_leg_failure_cost_usd=one_leg_failure_cost,
        min_viable_funding_annual_bps=min_viable_funding_bps,
        break_even_holding_days=be_days,
        holding_days_horizon=holding_days,
        gross_funding_usd=gross_funding_usd,
        opportunity_cost_usd=opp_cost_usd,
        net_return_after_costs_usd=net_economic_usd,
        return_on_initial_equity_pct=roe_pct,
        cash_benchmark_return_pct=cash_bench_pct,
        excess_over_cash_benchmark_pct=excess_pct,
        liquidation_buffer_pct=liq_buffer_pct,
        adverse_funding_reversal_loss_usd=adverse_funding_loss,
        max_modeled_stress_loss_usd=max_stress_loss,
        required_operational_availability=op_avail,
        venue_access_classification=spec.venue_access_classification,
        data_confidence_classification=spec.data_confidence_classification,
        final_eligibility_verdict=verdict,
        infeasibility_reasons=tuple(reasons),
    )


def build_five_tier_capital_matrix(
    specs: dict[VenueRoute, VenueRouteSpec],
    policy: AllocationPolicy | None = None,
    holding_days: int = 90,
    cash_benchmark_annual_bps: Decimal = Decimal("400"),
) -> dict[VenueRoute, tuple[CapitalTierCell, ...]]:
    """Build the full 3-route × 5-tier capital feasibility matrix."""
    return {
        route: tuple(
            evaluate_capital_tier_cell(
                spec=spec,
                capital_usd=tier,
                policy=policy,
                holding_days=holding_days,
                cash_benchmark_annual_bps=cash_benchmark_annual_bps,
            )
            for tier in CAPITAL_TIERS_USD
        )
        for route, spec in specs.items()
    }
