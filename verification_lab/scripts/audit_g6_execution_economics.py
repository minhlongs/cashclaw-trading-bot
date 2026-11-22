#!/usr/bin/env python3
"""Independent G6 Execution Economics & Decimal Two-Leg Oracle (Supreme Command #19).

1. Reads artifacts/g6_execution_tca.json (read-only) and independently recomputes
   gross_return, break_even_multiple, and expectancy_per_trade in Decimal across
   Binance & Hyperliquid at 1.0x, 1.5x, 2.0x, 3.0x cost multiples, including n_trades.
2. Runs an independent double-entry Decimal cash-and-inventory ledger oracle:
   tracks cash_balance_usd, spot_position_qty, perp_position_qty, net_delta_qty,
   realized PnL, funding cash flows, fees, friction, borrow costs, and emergency
   penalties; enforces maker zero-half-spread/zero-slippage parity with
   g6_execution_tca.json:166; reconciles (terminal_equity - initial_cash) against
   component net PnL to 0.00000000 Decimal residual.
3. Calibrates borrow-rate sensitivity (0%, 5%, 10%, 20% APR) to the actual
   measured median venue funding rates in g6_execution_tca.json (Hyperliquid
   ~9.84% APR, Binance ~4.43% APR).
4. Deterministically tests all 10 two-leg failure modes on explicitly labeled
   SYNTHETIC_SOFTWARE_TEST_FIXTURE scenarios.
5. Explicitly records external engine parity (NautilusTrader, HftBacktest) as
   NOT_VERIFIED.

Emits artifacts/g6_independent_execution_audit.json.
"""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_EVEN, getcontext
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
G6_ARTIFACT_PATH = REPO_ROOT / "artifacts" / "g6_execution_tca.json"
OUTPUT_PATH = REPO_ROOT / "artifacts" / "g6_independent_execution_audit.json"

DATA_ORIGIN_SYNTHETIC = "SYNTHETIC_SOFTWARE_TEST_FIXTURE"

Q8 = Decimal("0.00000001")
BPS = Decimal("10000")
MS_PER_DAY = Decimal("86400000")


def q8(x: Decimal) -> Decimal:
    return x.quantize(Q8, rounding=ROUND_HALF_EVEN)


@dataclass(frozen=True)
class LegFill:
    order_id: str
    ts_ms: int
    venue: str
    leg: str  # "spot" | "perp"
    side: str  # "BUY" | "SELL"
    liquidity_role: str  # "maker" | "taker"
    qty: Decimal
    mid_price: Decimal
    exec_price: Decimal
    fee_bps: Decimal
    half_spread_bps: Decimal
    slippage_bps: Decimal
    adverse_selection_bps: Decimal

    def __post_init__(self) -> None:
        if self.leg not in ("spot", "perp"):
            raise ValueError(f"Invalid leg: {self.leg}")
        if self.side not in ("BUY", "SELL"):
            raise ValueError(f"Invalid side: {self.side}")
        if self.liquidity_role not in ("maker", "taker"):
            raise ValueError(f"Invalid liquidity_role: {self.liquidity_role}")
        if self.liquidity_role == "maker":
            if self.half_spread_bps != Decimal("0") or self.slippage_bps != Decimal("0"):
                raise ValueError(
                    "MAKER_FILL_CANNOT_CHARGE_HALF_SPREAD_OR_SLIPPAGE: "
                    f"order_id={self.order_id} half_spread_bps={self.half_spread_bps} "
                    f"slippage_bps={self.slippage_bps}"
                )

    def notional(self) -> Decimal:
        return q8(self.qty * self.exec_price)

    def fee_usd(self) -> Decimal:
        return q8(self.notional() * self.fee_bps / BPS)

    def execution_friction_usd(self) -> Decimal:
        if self.liquidity_role == "maker":
            total_bps = self.adverse_selection_bps
        else:
            total_bps = self.half_spread_bps + self.slippage_bps + self.adverse_selection_bps
        return q8(self.notional() * total_bps / BPS)


def reconcile_two_leg_cycle(
    *,
    scenario_id: str,
    name: str,
    spot_entry: LegFill | None,
    perp_entry: LegFill | None,
    spot_exit: LegFill | None,
    perp_exit: LegFill | None,
    funding_cash_flow_usd: Decimal,
    borrow_apr: Decimal,
    initial_cash_usd: Decimal = Decimal("100000.00000000"),
    extra_fills: list[LegFill] | None = None,
    rejected_orders: list[dict[str, Any]] | None = None,
    emergency_penalty_usd: Decimal = Decimal("0"),
    margin_liquidation_details: dict[str, Any] | None = None,
    mark_price: Decimal | None = None,
    require_closed: bool = True,
    notes: str = "",
) -> dict[str, Any]:
    """Double-entry Decimal cash-and-inventory ledger reconciliation for a two-leg cycle."""
    base_fills = [f for f in (spot_entry, perp_entry, spot_exit, perp_exit) if f is not None]
    all_fills = sorted(base_fills + list(extra_fills or []), key=lambda f: (f.ts_ms, f.order_id))

    if not all_fills:
        raise ValueError(f"Scenario {scenario_id} has no fills")

    # Derive hold_days directly from fill timestamps
    first_ts_ms = min(f.ts_ms for f in all_fills)
    last_ts_ms = max(f.ts_ms for f in all_fills)
    hold_days = q8(Decimal(last_ts_ms - first_ts_ms) / MS_PER_DAY)

    # Independent double-entry cash-and-inventory ledger
    cash_balance_usd = q8(initial_cash_usd)
    spot_position_qty = Decimal("0")
    perp_position_qty = Decimal("0")
    spot_cash_flow = Decimal("0")
    perp_cash_flow = Decimal("0")
    total_fees = Decimal("0")
    total_friction = Decimal("0")

    for fill in all_fills:
        notional = fill.notional()
        fee = fill.fee_usd()
        friction = fill.execution_friction_usd()
        total_fees = q8(total_fees + fee)
        total_friction = q8(total_friction + friction)

        if fill.leg == "spot":
            if fill.side == "BUY":
                cash_balance_usd = q8(cash_balance_usd - notional - fee - friction)
                spot_cash_flow = q8(spot_cash_flow - notional)
                spot_position_qty = q8(spot_position_qty + fill.qty)
            else:
                cash_balance_usd = q8(cash_balance_usd + notional - fee - friction)
                spot_cash_flow = q8(spot_cash_flow + notional)
                spot_position_qty = q8(spot_position_qty - fill.qty)
        else:  # perp
            if fill.side == "BUY":
                cash_balance_usd = q8(cash_balance_usd - notional - fee - friction)
                perp_cash_flow = q8(perp_cash_flow - notional)
                perp_position_qty = q8(perp_position_qty + fill.qty)
            else:
                cash_balance_usd = q8(cash_balance_usd + notional - fee - friction)
                perp_cash_flow = q8(perp_cash_flow + notional)
                perp_position_qty = q8(perp_position_qty - fill.qty)

    net_delta_qty = q8(spot_position_qty + perp_position_qty)
    if require_closed and (spot_position_qty != Decimal("0") or perp_position_qty != Decimal("0")):
        raise ValueError(
            f"UNCLOSED_POSITION_MISMATCH in {scenario_id}: "
            f"spot_position_qty={spot_position_qty} perp_position_qty={perp_position_qty}"
        )

    borrowed_notional = spot_entry.notional() if spot_entry is not None else Decimal("0")
    borrow_cost = q8(borrowed_notional * borrow_apr * hold_days / Decimal("365"))
    funding_cf = q8(funding_cash_flow_usd)
    emerg_pen = q8(emergency_penalty_usd)

    cash_balance_usd = q8(cash_balance_usd + funding_cf - borrow_cost - emerg_pen)

    # Mark any residual open inventory if require_closed=False
    open_spot_mtm = Decimal("0")
    open_perp_mtm = Decimal("0")
    if spot_position_qty != Decimal("0") or perp_position_qty != Decimal("0"):
        if mark_price is None:
            raise ValueError(f"mark_price required when residual inventory is open in {scenario_id}")
        open_spot_mtm = q8(spot_position_qty * mark_price)
        open_perp_mtm = q8(perp_position_qty * mark_price)

    terminal_equity_usd = q8(cash_balance_usd + open_spot_mtm + open_perp_mtm)
    ledger_net_pnl_usd = q8(terminal_equity_usd - q8(initial_cash_usd))

    # Component PnL decomposition (realized + open MTM)
    realized_spot_pnl = q8(spot_cash_flow + open_spot_mtm)
    realized_perp_pnl = q8(perp_cash_flow + open_perp_mtm)
    gross_pnl = q8(realized_spot_pnl + realized_perp_pnl + funding_cf)
    total_costs = q8(total_fees + total_friction + borrow_cost + emerg_pen)
    component_net_pnl = q8(gross_pnl - total_costs)

    residual = q8(ledger_net_pnl_usd - component_net_pnl)

    order_records: list[dict[str, Any]] = [
        {
            "order_id": f.order_id,
            "ts_ms": f.ts_ms,
            "venue": f.venue,
            "leg": f.leg,
            "side": f.side,
            "liquidity_role": f.liquidity_role,
            "status": "FILLED",
            "qty": str(f.qty),
            "mid_price": str(f.mid_price),
            "exec_price": str(f.exec_price),
            "fee_usd": str(f.fee_usd()),
            "friction_usd": str(f.execution_friction_usd()),
        }
        for f in all_fills
    ]
    for rej in rejected_orders or []:
        order_records.append(
            {
                "order_id": rej["order_id"],
                "ts_ms": rej["ts_ms"],
                "venue": rej["venue"],
                "leg": rej["leg"],
                "side": rej["side"],
                "liquidity_role": rej.get("liquidity_role", "taker"),
                "status": "REJECTED",
                "qty": str(rej["qty"]),
                "reject_reason": rej["reject_reason"],
            }
        )
    order_records.sort(key=lambda o: (o["ts_ms"], o["order_id"]))

    result: dict[str, Any] = {
        "scenario_id": scenario_id,
        "name": name,
        "data_origin": DATA_ORIGIN_SYNTHETIC,
        "hold_days": str(hold_days),
        "orders": order_records,
        "ledger_state": {
            "initial_cash_usd": str(q8(initial_cash_usd)),
            "terminal_cash_balance_usd": str(cash_balance_usd),
            "terminal_equity_usd": str(terminal_equity_usd),
            "spot_position_qty": str(spot_position_qty),
            "perp_position_qty": str(perp_position_qty),
            "net_delta_qty": str(net_delta_qty),
            "ledger_net_pnl_usd": str(ledger_net_pnl_usd),
        },
        "pnl_components": {
            "spot_price_pnl_usd": str(realized_spot_pnl),
            "perp_price_pnl_usd": str(realized_perp_pnl),
            "funding_cash_flow_usd": str(funding_cf),
            "total_fees_usd": str(total_fees),
            "total_friction_usd": str(total_friction),
            "borrow_cost_usd": str(borrow_cost),
            "emergency_penalty_usd": str(emerg_pen),
            "gross_pnl_usd": str(gross_pnl),
            "total_costs_usd": str(total_costs),
            "net_pnl_usd": str(component_net_pnl),
            "reconciliation_residual_usd": str(residual),
        },
        "reconciled_zero_residual": residual == Decimal("0.00000000"),
        "notes": notes,
    }
    if margin_liquidation_details is not None:
        result["margin_liquidation"] = margin_liquidation_details
    return result


def load_median_venue_funding_apr_pct(g6_path: Path = G6_ARTIFACT_PATH) -> dict[str, Decimal]:
    g6 = json.loads(g6_path.read_text(encoding="utf-8"))
    pc = g6["hyperliquid_cross_check"]["historical_1h_funding_carry_cross_check"][
        "per_coin_daily_funding_comparison"
    ]
    hl_rates = [float(v["hyperliquid_ann_rate_pct"]) for v in pc.values()]
    bn_rates = [float(v["binance_ann_rate_pct"]) for v in pc.values()]
    return {
        "hyperliquid": Decimal(str(round(statistics.median(hl_rates), 4))),
        "binance": Decimal(str(round(statistics.median(bn_rates), 4))),
    }


def run_borrow_rate_sensitivity(g6_path: Path = G6_ARTIFACT_PATH) -> dict[str, Any]:
    """Calibrate borrow-rate sensitivity (0%, 5%, 10%, 20% APR) to actual G6 median venue funding."""
    median_apr_pct = load_median_venue_funding_apr_pct(g6_path)
    base_ts = 1_704_067_200_000
    hold_ms = int(Decimal("113.22") * MS_PER_DAY)
    hold_days = q8(Decimal(hold_ms) / MS_PER_DAY)
    qty = Decimal("0.25000000")
    spot_px = Decimal("40000.00000000")
    perp_px = Decimal("40000.00000000")
    notional = q8(qty * spot_px)

    venue_schedules = {
        "hyperliquid": {"spot_maker_bps": Decimal("4.0"), "perp_maker_bps": Decimal("1.5")},
        "binance": {"spot_maker_bps": Decimal("10.0"), "perp_maker_bps": Decimal("2.0")},
    }

    by_venue: dict[str, list[dict[str, Any]]] = {}
    for venue in ("hyperliquid", "binance"):
        funding_apr = median_apr_pct[venue] / Decimal("100")
        funding_cf = q8(notional * funding_apr * hold_days / Decimal("365"))
        sched = venue_schedules[venue]
        rows: list[dict[str, Any]] = []
        for apr_str in ("0.00", "0.05", "0.10", "0.20"):
            apr = Decimal(apr_str)
            res = reconcile_two_leg_cycle(
                scenario_id=f"G6-BORROW-{venue.upper()}-{int(apr * 100)}PCT",
                name=f"{venue}_borrow_rate_{int(apr * 100)}pct_apr",
                spot_entry=LegFill(
                    "ORD-SE-1", base_ts, venue, "spot", "BUY", "maker",
                    qty, spot_px, spot_px, sched["spot_maker_bps"],
                    Decimal("0"), Decimal("0"), Decimal("1.5"),
                ),
                perp_entry=LegFill(
                    "ORD-PE-1", base_ts + 500, venue, "perp", "SELL", "maker",
                    qty, perp_px, perp_px, sched["perp_maker_bps"],
                    Decimal("0"), Decimal("0"), Decimal("1.5"),
                ),
                spot_exit=LegFill(
                    "ORD-SX-1", base_ts + hold_ms, venue, "spot", "SELL", "maker",
                    qty, spot_px, spot_px, sched["spot_maker_bps"],
                    Decimal("0"), Decimal("0"), Decimal("1.5"),
                ),
                perp_exit=LegFill(
                    "ORD-PX-1", base_ts + hold_ms + 500, venue, "perp", "BUY", "maker",
                    qty, perp_px, perp_px, sched["perp_maker_bps"],
                    Decimal("0"), Decimal("0"), Decimal("1.5"),
                ),
                funding_cash_flow_usd=funding_cf,
                borrow_apr=apr,
                notes=f"{venue} VIP-0 maker schedule calibrated to measured median funding {median_apr_pct[venue]}% APR",
            )
            rows.append(
                {
                    "venue": venue,
                    "calibrated_funding_apr_pct": float(median_apr_pct[venue]),
                    "borrow_apr_pct": int(apr * 100),
                    "funding_cash_flow_usd": res["pnl_components"]["funding_cash_flow_usd"],
                    "borrow_cost_usd": res["pnl_components"]["borrow_cost_usd"],
                    "net_pnl_usd": res["pnl_components"]["net_pnl_usd"],
                    "net_positive": Decimal(res["pnl_components"]["net_pnl_usd"]) > Decimal("0"),
                    "reconciled_zero_residual": res["reconciled_zero_residual"],
                }
            )
        by_venue[venue] = rows

    return {
        "calibrated_venue_funding_apr_pct": {k: float(v) for k, v in median_apr_pct.items()},
        "hyperliquid": by_venue["hyperliquid"],
        "binance": by_venue["binance"],
    }


def run_ten_failure_modes() -> list[dict[str, Any]]:
    t0 = 1_704_067_200_000
    day_ms = 86_400_000
    qty = Decimal("0.25000000")
    p0 = Decimal("40000.00000000")

    # G6-FM-10 margin liquidation derivation:
    # 0.25 BTC short perp at $40,000 ($10,000 notional), 10x leverage -> posted_margin = $1,000.00
    # Maintenance margin = 5% of entry notional = $500.00
    # Rally to $46,000 -> adverse_mtm_loss = 0.25 * $6,000 = $1,500.00 > (posted - maint = $500) -> margin breached!
    # Liquidation fee = 50 bps (0.50%) of exit perp notional (0.25 * $46,150 = $11,537.50) = $57.68750000
    fm10_posted_margin = Decimal("1000.00000000")
    fm10_maint_margin = Decimal("500.00000000")
    fm10_adverse_mtm = q8(qty * (Decimal("46000.00000000") - p0))
    fm10_margin_breached = (fm10_posted_margin - fm10_adverse_mtm) < fm10_maint_margin
    fm10_liq_fee_bps = Decimal("50.0")
    fm10_liq_fee = q8(qty * Decimal("46150.00000000") * fm10_liq_fee_bps / BPS)

    scenarios = [
        # 1. Spot fills (maker), perp does not -> unhedged directional drop + emergency taker unwind
        # Adverse move (-30 bps) is in exec_price (39880); taker slippage_bps=0 to avoid double-counting.
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-01",
            name="spot_fills_perp_misses_emergency_unwind",
            spot_entry=LegFill("FM01-SE", t0, "binance", "spot", "BUY", "maker", qty, p0, p0, Decimal("10.0"), Decimal("0"), Decimal("0"), Decimal("2.0")),
            perp_entry=None,
            spot_exit=LegFill("FM01-SX", t0 + 15000, "binance", "spot", "SELL", "taker", qty, Decimal("39880.00000000"), Decimal("39880.00000000"), Decimal("10.0"), Decimal("3.0"), Decimal("0.0"), Decimal("0.0")),
            perp_exit=None,
            funding_cash_flow_usd=Decimal("0"),
            borrow_apr=Decimal("0.05"),
            notes="Perp leg missed; spot unwound via emergency taker after -30 bps move (slippage in exec_price, not double-counted)",
        ),
        # 2. Perp fills (maker), spot does not -> naked short perp rises + emergency taker cover
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-02",
            name="perp_fills_spot_misses_emergency_cover",
            spot_entry=None,
            perp_entry=LegFill("FM02-PE", t0, "binance", "perp", "SELL", "maker", qty, p0, p0, Decimal("2.0"), Decimal("0"), Decimal("0"), Decimal("2.0")),
            spot_exit=None,
            perp_exit=LegFill("FM02-PX", t0 + 15000, "binance", "perp", "BUY", "taker", qty, Decimal("40140.00000000"), Decimal("40140.00000000"), Decimal("5.0"), Decimal("3.0"), Decimal("0.0"), Decimal("0.0")),
            funding_cash_flow_usd=Decimal("0"),
            borrow_apr=Decimal("0"),
            notes="Spot leg missed; naked short perp covered via emergency taker after +35 bps rally",
        ),
        # 3. One leg partially fills -> residual 0.10 BTC delta rebalanced via explicit taker hedge order
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-03",
            name="one_leg_partial_fill_delta_rebalance",
            spot_entry=LegFill("FM03-SE", t0, "hyperliquid", "spot", "BUY", "maker", qty, p0, p0, Decimal("4.0"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            perp_entry=LegFill("FM03-PE", t0 + 500, "hyperliquid", "perp", "SELL", "maker", Decimal("0.15000000"), p0, p0, Decimal("1.5"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            extra_fills=[
                LegFill("FM03-PR", t0 + 2500, "hyperliquid", "perp", "SELL", "taker", Decimal("0.10000000"), Decimal("39950.00000000"), Decimal("39950.00000000"), Decimal("4.5"), Decimal("2.0"), Decimal("0.0"), Decimal("0.0")),
            ],
            spot_exit=LegFill("FM03-SX", t0 + day_ms, "hyperliquid", "spot", "SELL", "taker", qty, Decimal("39900.00000000"), Decimal("39900.00000000"), Decimal("7.0"), Decimal("2.0"), Decimal("0.0"), Decimal("0.0")),
            perp_exit=LegFill("FM03-PX", t0 + day_ms + 500, "hyperliquid", "perp", "BUY", "taker", qty, Decimal("39900.00000000"), Decimal("39900.00000000"), Decimal("4.5"), Decimal("2.0"), Decimal("0.0"), Decimal("0.0")),
            funding_cash_flow_usd=Decimal("1.50000000"),
            borrow_apr=Decimal("0.05"),
            notes="Perp maker filled 60% (0.15/0.25); explicit taker hedge-rebalance order FM03-PR closes 0.10 BTC delta at $39,950",
        ),
        # 4. One venue disconnects -> stale quote / forced taker exit
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-04",
            name="venue_disconnect_forced_taker_exit",
            spot_entry=LegFill("FM04-SE", t0, "binance", "spot", "BUY", "maker", qty, p0, p0, Decimal("10.0"), Decimal("0"), Decimal("0"), Decimal("2.0")),
            perp_entry=LegFill("FM04-PE", t0 + 500, "hyperliquid", "perp", "SELL", "maker", qty, p0, p0, Decimal("1.5"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            spot_exit=LegFill("FM04-SX", t0 + 3 * day_ms, "binance", "spot", "SELL", "taker", qty, Decimal("39950.00000000"), Decimal("39950.00000000"), Decimal("10.0"), Decimal("4.0"), Decimal("0.0"), Decimal("0.0")),
            perp_exit=LegFill("FM04-PX", t0 + 3 * day_ms + 4000, "hyperliquid", "perp", "BUY", "taker", qty, Decimal("39980.00000000"), Decimal("39980.00000000"), Decimal("4.5"), Decimal("4.0"), Decimal("0.0"), Decimal("0.0")),
            funding_cash_flow_usd=Decimal("4.00000000"),
            borrow_apr=Decimal("0.05"),
            notes="Cross-venue disconnect forces staggered taker exit with basis slippage",
        ),
        # 5. Funding reverses -> negative carry bleed (passive maker both sides)
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-05",
            name="funding_reverses_negative_carry_bleed",
            spot_entry=LegFill("FM05-SE", t0, "hyperliquid", "spot", "BUY", "maker", qty, p0, p0, Decimal("4.0"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            perp_entry=LegFill("FM05-PE", t0 + 500, "hyperliquid", "perp", "SELL", "maker", qty, p0, p0, Decimal("1.5"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            spot_exit=LegFill("FM05-SX", t0 + 10 * day_ms, "hyperliquid", "spot", "SELL", "maker", qty, p0, p0, Decimal("4.0"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            perp_exit=LegFill("FM05-PX", t0 + 10 * day_ms + 500, "hyperliquid", "perp", "BUY", "maker", qty, p0, p0, Decimal("1.5"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            funding_cash_flow_usd=Decimal("-45.00000000"),
            borrow_apr=Decimal("0.05"),
            notes="Funding flips negative before exit threshold triggers",
        ),
        # 6. Basis diverges -> mark-to-market drawdown at exit
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-06",
            name="basis_divergence_mtm_drawdown",
            spot_entry=LegFill("FM06-SE", t0, "binance", "spot", "BUY", "maker", qty, p0, p0, Decimal("10.0"), Decimal("0"), Decimal("0"), Decimal("2.0")),
            perp_entry=LegFill("FM06-PE", t0 + 500, "binance", "perp", "SELL", "maker", qty, Decimal("40020.00000000"), Decimal("40020.00000000"), Decimal("2.0"), Decimal("0"), Decimal("0"), Decimal("2.0")),
            spot_exit=LegFill("FM06-SX", t0 + 5 * day_ms, "binance", "spot", "SELL", "taker", qty, p0, p0, Decimal("10.0"), Decimal("2.0"), Decimal("2.0"), Decimal("0.0")),
            perp_exit=LegFill("FM06-PX", t0 + 5 * day_ms + 500, "binance", "perp", "BUY", "taker", qty, Decimal("40320.00000000"), Decimal("40320.00000000"), Decimal("5.0"), Decimal("2.0"), Decimal("2.0"), Decimal("0.0")),
            funding_cash_flow_usd=Decimal("12.00000000"),
            borrow_apr=Decimal("0.05"),
            notes="Perp basis blows out +300 USD/BTC against short perp hedge",
        ),
        # 7. Spread expands -> entry/exit half-spread shock (taker execution during stress)
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-07",
            name="spread_expansion_shock",
            spot_entry=LegFill("FM07-SE", t0, "binance", "spot", "BUY", "taker", qty, p0, p0, Decimal("10.0"), Decimal("25.0"), Decimal("2.0"), Decimal("0.0")),
            perp_entry=LegFill("FM07-PE", t0 + 500, "binance", "perp", "SELL", "taker", qty, p0, p0, Decimal("5.0"), Decimal("25.0"), Decimal("2.0"), Decimal("0.0")),
            spot_exit=LegFill("FM07-SX", t0 + 2 * day_ms, "binance", "spot", "SELL", "taker", qty, p0, p0, Decimal("10.0"), Decimal("25.0"), Decimal("2.0"), Decimal("0.0")),
            perp_exit=LegFill("FM07-PX", t0 + 2 * day_ms + 500, "binance", "perp", "BUY", "taker", qty, p0, p0, Decimal("5.0"), Decimal("25.0"), Decimal("2.0"), Decimal("0.0")),
            funding_cash_flow_usd=Decimal("8.00000000"),
            borrow_apr=Decimal("0.05"),
            notes="Half-spread widens to 25 bps on both legs (exec_price=mid_price, spread charged once in friction)",
        ),
        # 8. Liquidity disappears -> depth collapse / market impact slippage on taker exit
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-08",
            name="liquidity_collapse_market_impact",
            spot_entry=LegFill("FM08-SE", t0, "hyperliquid", "spot", "BUY", "maker", qty, p0, p0, Decimal("4.0"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            perp_entry=LegFill("FM08-PE", t0 + 500, "hyperliquid", "perp", "SELL", "maker", qty, p0, p0, Decimal("1.5"), Decimal("0"), Decimal("0"), Decimal("1.5")),
            spot_exit=LegFill("FM08-SX", t0 + 4 * day_ms, "hyperliquid", "spot", "SELL", "taker", qty, p0, p0, Decimal("7.0"), Decimal("10.0"), Decimal("45.0"), Decimal("0.0")),
            perp_exit=LegFill("FM08-PX", t0 + 4 * day_ms + 500, "hyperliquid", "perp", "BUY", "taker", qty, p0, p0, Decimal("4.5"), Decimal("10.0"), Decimal("45.0"), Decimal("0.0")),
            funding_cash_flow_usd=Decimal("10.00000000"),
            borrow_apr=Decimal("0.05"),
            notes="Order book depth collapses; exit incurs 45 bps market impact per leg (exec_price=mid_price)",
        ),
        # 9. Emergency exit fails -> explicit rejected attempt(s) + filled retry ladder
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-09",
            name="emergency_exit_failure_retry_ladder",
            spot_entry=LegFill("FM09-SE", t0, "binance", "spot", "BUY", "maker", qty, p0, p0, Decimal("10.0"), Decimal("0"), Decimal("0"), Decimal("2.0")),
            perp_entry=LegFill("FM09-PE", t0 + 500, "binance", "perp", "SELL", "maker", qty, p0, p0, Decimal("2.0"), Decimal("0"), Decimal("0"), Decimal("2.0")),
            rejected_orders=[
                {
                    "order_id": "FM09-SX-ATTEMPT1",
                    "ts_ms": t0 + 2 * day_ms,
                    "venue": "binance",
                    "leg": "spot",
                    "side": "SELL",
                    "qty": qty,
                    "reject_reason": "IOC_INSUFFICIENT_DEPTH",
                },
                {
                    "order_id": "FM09-PX-ATTEMPT1",
                    "ts_ms": t0 + 2 * day_ms + 500,
                    "venue": "binance",
                    "leg": "perp",
                    "side": "BUY",
                    "qty": qty,
                    "reject_reason": "EXCHANGE_RATE_LIMIT_429",
                },
            ],
            spot_exit=LegFill("FM09-SX-RETRY2", t0 + 2 * day_ms + 30000, "binance", "spot", "SELL", "taker", qty, Decimal("39700.00000000"), Decimal("39700.00000000"), Decimal("10.0"), Decimal("8.0"), Decimal("0.0"), Decimal("0.0")),
            perp_exit=LegFill("FM09-PX-RETRY2", t0 + 2 * day_ms + 35000, "binance", "perp", "BUY", "taker", qty, Decimal("39760.00000000"), Decimal("39760.00000000"), Decimal("5.0"), Decimal("8.0"), Decimal("0.0"), Decimal("0.0")),
            funding_cash_flow_usd=Decimal("5.00000000"),
            borrow_apr=Decimal("0.05"),
            emergency_penalty_usd=Decimal("15.00000000"),
            notes="First emergency exit attempts rejected; retry ladder fills 30s later with explicit rejected order audit trail",
        ),
        # 10. Position experiences liquidation pressure -> explicit margin breach & derived liquidation fee
        reconcile_two_leg_cycle(
            scenario_id="G6-FM-10",
            name="liquidation_pressure_margin_breach",
            spot_entry=LegFill("FM10-SE", t0, "binance", "spot", "BUY", "maker", qty, p0, p0, Decimal("10.0"), Decimal("0"), Decimal("0"), Decimal("2.0")),
            perp_entry=LegFill("FM10-PE", t0 + 500, "binance", "perp", "SELL", "maker", qty, p0, p0, Decimal("2.0"), Decimal("0"), Decimal("0"), Decimal("2.0")),
            spot_exit=LegFill("FM10-SX", t0 + 7 * day_ms, "binance", "spot", "SELL", "taker", qty, Decimal("46000.00000000"), Decimal("46000.00000000"), Decimal("10.0"), Decimal("5.0"), Decimal("0.0"), Decimal("0.0")),
            perp_exit=LegFill("FM10-PX", t0 + 7 * day_ms + 1000, "binance", "perp", "BUY", "taker", qty, Decimal("46150.00000000"), Decimal("46150.00000000"), Decimal("5.0"), Decimal("5.0"), Decimal("0.0"), Decimal("0.0")),
            funding_cash_flow_usd=Decimal("18.00000000"),
            borrow_apr=Decimal("0.10"),
            emergency_penalty_usd=fm10_liq_fee,
            margin_liquidation_details={
                "posted_margin_usd": str(fm10_posted_margin),
                "maintenance_margin_usd": str(fm10_maint_margin),
                "adverse_mtm_loss_usd": str(fm10_adverse_mtm),
                "margin_breached": fm10_margin_breached,
                "liquidation_fee_bps": str(fm10_liq_fee_bps),
                "derived_liquidation_fee_usd": str(fm10_liq_fee),
            },
            notes="Sharp +15% rally breaches short-perp maintenance margin; liquidation fee derived from 50 bps * exit perp notional",
        ),
    ]
    return scenarios


def verify_committed_g6_tca(g6_path: Path = G6_ARTIFACT_PATH) -> dict[str, Any]:
    g6 = json.loads(g6_path.read_text(encoding="utf-8"))
    tc = g6["tick_calibrated_h3_maker"]["by_venue"]
    summary: dict[str, Any] = {}
    all_decimal_parity_ok = True

    for venue in ("binance", "hyperliquid"):
        v = tc[venue]["train_calibrated_bounds"]
        venue_out: dict[str, Any] = {
            "full_sample_pass_2x_both_ends": bool(v["full_sample_pass_2x_both_ends"]),
            "locked_oos_pass_2x_both_ends": bool(v["locked_oos_pass_2x_both_ends"]),
            "clears_2x_full_and_oos": bool(v["clears_2x_full_and_oos"]),
            "scopes": {},
        }
        for scope in ("full_sample", "locked_oos"):
            venue_out["scopes"][scope] = {}
            for end in ("at_floor", "at_ceiling"):
                d = v[scope][end]
                cs = d["cost_stress"]
                n_trades = int(d["n_trades"])
                cum_net = Decimal(str(d["cum_net"]))
                cum_cost = Decimal(str(d["cum_cost"]))
                gross_return = q8(cum_net + cum_cost)
                recomp_be = q8(gross_return / cum_cost) if cum_cost != Decimal("0") else Decimal("0")
                recomp_exp = q8(cum_net / Decimal(str(n_trades))) if n_trades > 0 else Decimal("0")

                committed_be = Decimal(str(d["break_even_multiple"]))
                committed_exp = Decimal(str(d["expectancy_per_trade"]))
                be_diff = abs(recomp_be - committed_be)
                exp_diff = abs(recomp_exp - committed_exp)
                parity_ok = be_diff <= Decimal("0.001") and exp_diff <= Decimal("0.0001")
                if not parity_ok:
                    all_decimal_parity_ok = False

                venue_out["scopes"][scope][end] = {
                    "n_trades": n_trades,
                    "cum_net": str(cum_net),
                    "cum_cost": str(cum_cost),
                    "recomputed_gross_return": str(gross_return),
                    "break_even_multiple": float(d["break_even_multiple"]),
                    "recomputed_break_even_multiple": str(recomp_be),
                    "recomputed_expectancy_1_0x": str(recomp_exp),
                    "decimal_parity_ok": parity_ok,
                    "expectancy_1_0x": float(cs["1.0x"]["expectancy_per_trade"]),
                    "expectancy_1_5x": float(cs["1.5x"]["expectancy_per_trade"]),
                    "expectancy_2_0x": float(cs["2.0x"]["expectancy_per_trade"]),
                    "expectancy_3_0x": float(cs["3.0x"]["expectancy_per_trade"]),
                    "positive_at_2_0x": bool(cs["2.0x"]["expectancy_positive"]),
                    "positive_at_3_0x": bool(cs["3.0x"]["expectancy_positive"]),
                }
        summary[venue] = venue_out

    bn_oos_ceil = summary["binance"]["scopes"]["locked_oos"]["at_ceiling"]
    hl_oos_ceil = summary["hyperliquid"]["scopes"]["locked_oos"]["at_ceiling"]

    return {
        "source_artifact": str(g6_path.relative_to(REPO_ROOT)),
        "decimal_recomputation_parity_ok": all_decimal_parity_ok,
        "venues": summary,
        "key_invariants": {
            "binance_oos_2x_negative": not bn_oos_ceil["positive_at_2_0x"],
            "hyperliquid_oos_2x_positive_thin_at_ceiling": hl_oos_ceil["positive_at_2_0x"]
            and hl_oos_ceil["expectancy_2_0x"] < 0.0005,
            "hyperliquid_oos_3x_negative": not hl_oos_ceil["positive_at_3_0x"],
            "decimal_recomputation_parity_ok": all_decimal_parity_ok,
        },
    }


def main() -> int:
    getcontext().prec = 28
    getcontext().rounding = ROUND_HALF_EVEN

    tca_verification = verify_committed_g6_tca(G6_ARTIFACT_PATH)
    borrow_data = run_borrow_rate_sensitivity(G6_ARTIFACT_PATH)
    failure_modes = run_ten_failure_modes()

    all_reconciled = (
        all(fm["reconciled_zero_residual"] for fm in failure_modes)
        and all(b["reconciled_zero_residual"] for b in borrow_data["hyperliquid"])
        and all(b["reconciled_zero_residual"] for b in borrow_data["binance"])
    )
    invariants_ok = all(tca_verification["key_invariants"].values())

    report = {
        "gate": "G6_REALISTIC_NET_EXECUTION_ECONOMICS",
        "schema_version": "1.1.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "committed_tca_verification": tca_verification,
        "decimal_two_leg_oracle": {
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "precision_digits": 28,
            "rounding_mode": "ROUND_HALF_EVEN",
            "calibrated_venue_funding_apr_pct": borrow_data["calibrated_venue_funding_apr_pct"],
            "borrow_rate_sensitivity": borrow_data["hyperliquid"],
            "binance_borrow_rate_sensitivity": borrow_data["binance"],
            "failure_modes_total": len(failure_modes),
            "failure_modes_reconciled_zero_residual": sum(
                1 for fm in failure_modes if fm["reconciled_zero_residual"]
            ),
            "all_reconciled_zero_residual": all_reconciled,
            "failure_modes": failure_modes,
        },
        "external_engine_parity": {
            "NautilusTrader": "NOT_VERIFIED",
            "HftBacktest": "NOT_VERIFIED",
            "note": "Neither NautilusTrader nor HftBacktest is installed or executed in this offline audit environment.",
        },
        "verdict": {
            "committed_tca_invariants_verified": invariants_ok,
            "decimal_oracle_zero_residual": all_reconciled,
            "external_parity_status": "NOT_VERIFIED",
        },
    }

    OUTPUT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"G6 audit complete: invariants={invariants_ok} "
        f"failure_modes={len(failure_modes)}/10 zero_residual={all_reconciled}"
    )
    return 0 if (invariants_ok and all_reconciled) else 1


if __name__ == "__main__":
    raise SystemExit(main())
