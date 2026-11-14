"""Re-price one book under the execution model, and under a stated ladder of it.

The book and the price path are inputs; nothing here rebuilds a signal. That is
the whole point of the separation: if the cost model changed which configuration
won, the report would be describing a different strategy than the one the
statistical gates scored, and the comparison between the two reports would be
meaningless.

Two views are produced. The attrition view adds the components one at a time so
a hypothesis that turns negative can be attributed to fees, to spread crossing,
to latency or to impact rather than to "costs". The ladder view scales the whole
charge by the audit's 1.0x/1.5x/2.0x/3.0x structural multiples, which are
robustness probes rather than claims about any venue's published schedule.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..stats.core import sharpe_ratio
from ..stats.episodes import trade_expectancy
from .cost_model import CostAssumptions, daily_cost

RUNG_MULTIPLES = (1.0, 1.5, 2.0, 3.0)
PERIODS_PER_YEAR = 365
ATTRITION_ORDER = ("fee", "half_spread", "latency_slippage", "volatility_impact")


@dataclass(frozen=True)
class PricedBook:
    """One hypothesis' costs, decomposed and laddered, with the net path on hand."""

    gross: np.ndarray
    cost: np.ndarray
    components: dict[str, np.ndarray]
    days: int


def price_book(
    gross: np.ndarray,
    weights: np.ndarray,
    positions: np.ndarray,
    *,
    legs,
    leg_fee_bps: dict[str, float],
    half_spread_bps_value: float,
    adv_usd: np.ndarray,
    vol_daily: np.ndarray,
    assumptions: CostAssumptions,
) -> PricedBook:
    """Charge the modelled cost against a book whose gross return is already known."""
    cost = daily_cost(
        weights,
        legs=legs,
        leg_fee_bps=leg_fee_bps,
        half_spread_bps_value=half_spread_bps_value,
        adv_usd=adv_usd,
        vol_daily=vol_daily,
        assumptions=assumptions,
    )
    return PricedBook(
        gross=np.asarray(gross, dtype=float),
        cost=cost["total"],
        components=cost["components"],
        days=cost["days"],
    )


def ladder(book: PricedBook, positions: np.ndarray, multiples=RUNG_MULTIPLES) -> dict:
    """Cumulative net, Sharpe, break-even and per-trade expectancy at each multiple."""
    gross_total = float(np.nansum(book.gross))
    cost_total = float(np.nansum(book.cost))
    out = {}
    for m in multiples:
        net = book.gross - book.cost * m
        expectancy = trade_expectancy(net, positions)
        out[f"{m}x"] = {
            "multiple": float(m),
            "cum_cost": round(cost_total * m, 6),
            "cum_net": round(float(np.nansum(net)), 6),
            "sharpe": round(sharpe_ratio(net, PERIODS_PER_YEAR), 4),
            "break_even_multiple": round(gross_total / cost_total, 4) if cost_total > 0 else None,
            "expectancy_per_trade": expectancy.get("expectancy"),
            "n_trades": expectancy.get("n_trades", 0),
            # Travels with the expectancy: a per-trade figure from a single
            # holding episode is not evidence of a trade distribution.
            "mean_hold_days": expectancy.get("mean_hold_days"),
            "expectancy_positive": bool(
                expectancy.get("expectancy") is not None and expectancy["expectancy"] > 0.0
            ),
            "net_positive": bool(np.nansum(net) > 0.0),
        }
    return out


def attrition(book: PricedBook) -> list[dict]:
    """Cost and resulting net as each component is switched on, in turn.

    Cumulative, so the last row is the full model. `flips_the_verdict` marks the
    *first* component that takes cumulative net from positive to non-positive --
    the term that decides the verdict, which is the only actionable form of
    "costs are too high". Marking every later row as well would just repeat the
    sign of `cum_net` and name nothing.
    """
    gross_total = float(np.nansum(book.gross))
    rows = []
    running = np.zeros_like(book.cost)
    flipped = False
    for name in ATTRITION_ORDER:
        part = book.components[name]
        marginal = float(np.nansum(part))
        running = running + part
        cum_net = gross_total - float(np.nansum(running))
        decided_here = cum_net <= 0.0 and not flipped
        flipped = flipped or decided_here
        rows.append(
            {
                "component": name,
                "marginal_cost": round(marginal, 6),
                "cum_cost": round(float(np.nansum(running)), 6),
                "cum_net": round(cum_net, 6),
                "sharpe": round(
                    sharpe_ratio(book.gross - running, PERIODS_PER_YEAR), 4
                ),
                "flips_the_verdict": bool(decided_here),
            }
        )
    return rows


def share_of_cost(book: PricedBook) -> dict:
    """What fraction of the modelled charge is each component.

    Rounded shares can sum to 0.9999 or 1.0001; they are reported as computed
    rather than forced, because a forced share is a small lie in a table whose
    whole purpose is auditability.
    """
    total = float(np.nansum(book.cost))
    if total <= 0.0:
        return {name: None for name in ATTRITION_ORDER}
    return {
        name: round(float(np.nansum(book.components[name])) / total, 4)
        for name in ATTRITION_ORDER
    }


def bps_per_turn(book: PricedBook, traded: np.ndarray) -> float | None:
    """Effective charge per unit of notional traded, comparable to a flat bps rate."""
    traded_total = float(np.nansum(traded))
    if traded_total <= 0.0:
        return None
    return round(1e4 * float(np.nansum(book.cost)) / traded_total, 4)
