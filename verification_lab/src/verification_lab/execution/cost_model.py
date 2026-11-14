"""Explicitly-added execution costs for a close-price backtest.

The audit's no-double-counting rule has two branches, and which one binds depends
on the simulator. A fill at best_ask, or a walk down L2 depth, already contains
half-spread and static impact in the fill price, so such a simulator must add
only fees, latency slippage, funding/borrow and allocated operations cost. This
lab has no book and no fills: every hypothesis is scored on closing prices, so
the binding branch is the other one -- half spread, slippage and
volatility-dependent impact must be added explicitly to the price that is
crossed.

What is deliberately not a turn cost: funding. Funding is a cash flow on held
notional and is already inside each hypothesis' gross return (H1 and H2 carry
-w*funding, H3 carries +0.5*w*funding). Charging it a second time as a scratch
cost would double count it, and would also erase the venue comparison the audit
asks for between a schedule that settles hourly and one that settles eight-fold.

Every term here is additive and reported separately, so a hypothesis that turns
negative under realistic costs can be attributed to a specific component instead
of to "costs" in general.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

BASIS = "assumed_not_measured"
DEFAULT_CAPITAL_USD = 1_000_000.0


@dataclass(frozen=True)
class CostAssumptions:
    """Every knob here is an assumption, not a measurement.

    `latency_slippage_bps` is the cost of acting on a decision this data only
    resolves to a daily close, and has no free observable in daily bars.
    `impact_coefficient` is the square-root law's slope; 1.0 is the conservative
    upper end of the range quoted for crypto pairs, and the 2.0x/3.0x ladder is
    what tests the answer against it being wrong. `capital_usd` enters only
    through participation (order notional over median daily traded value), so a
    larger book is charged more.
    """

    latency_slippage_bps: float = 1.0
    impact_coefficient: float = 1.0
    capital_usd: float = DEFAULT_CAPITAL_USD
    assumed_impact_bps: float = 2.0


@dataclass(frozen=True)
class Leg:
    """One traded leg of a book: what it is called, how big it is, where it fills.

    `notional_scale` multiplies the book weight. A cross-sectional perp book is
    one leg at full weight; the spot-perp carry pair is two legs at half weight
    each, because its weight is expressed per pair, not per leg.
    """

    leg: str
    venue: str
    notional_scale: float


def traded_notional(weights: np.ndarray, scale: float) -> np.ndarray:
    """Per-day traded notional on one leg, in units of portfolio notional.

    The signed difference, not the difference of absolute values: a flip from
    +0.5 to -0.5 crosses a full unit of notional, and |Δ|w|| quietly reports zero.
    """
    w = np.nan_to_num(np.asarray(weights, dtype=float), nan=0.0)
    prev = np.vstack([np.zeros((1, w.shape[1])), w[:-1]])
    return float(scale) * np.abs(w - prev)


def participation(traded: np.ndarray, adv_row_usd: np.ndarray, capital_usd: float) -> np.ndarray:
    """Order notional as a fraction of that symbol's median daily traded value."""
    adv = np.asarray(adv_row_usd, dtype=float)
    safe = np.where(adv > 0.0, adv, np.nan)
    return traded * capital_usd / safe


def impact_bps(
    part: np.ndarray,
    vol_daily: np.ndarray,
    *,
    coefficient: float,
    fallback_bps: float,
) -> np.ndarray:
    """Square-root impact scaled by realised volatility, in bps of traded notional.

    Impact ~ coefficient * sigma_daily * sqrt(Q / V). The volatility term is what
    makes this "volatility-dependent" as the audit requires: the same order costs
    more when the tape is fast. Rows where a symbol has no volume observation fall
    back to a flat charge and are counted, rather than being priced at zero --
    unpriced is not free.
    """
    p = np.asarray(part, dtype=float)
    v = np.asarray(vol_daily, dtype=float)
    measured = np.isfinite(p) & (p >= 0.0) & np.isfinite(v) & (v >= 0.0)
    sigma = np.where(measured, v, 0.0)
    safe_p = np.where(measured, p, 0.0)
    with np.errstate(invalid="ignore"):
        scaled = 1e4 * coefficient * sigma * np.sqrt(safe_p)
    return np.where(measured, scaled, fallback_bps)


def daily_cost(
    weights: np.ndarray,
    *,
    legs: list[Leg],
    leg_fee_bps: dict[str, float],
    half_spread_bps_value: float,
    adv_usd: np.ndarray,
    vol_daily: np.ndarray,
    assumptions: CostAssumptions,
) -> dict:
    """The four additive cost components of each day's trading, and their total.

    `leg_fee_bps` is keyed by the leg's own name, not by venue, because a pair can
    put two different schedules on the same exchange: H3 at Binance pays 10 bps on
    its spot leg and 5 bps on its perp leg, and a venue-keyed map could only carry
    one of them.

    `half_spread_bps_value` is a scalar for the run, taken from the band in
    `spread.band` rather than from a per-symbol estimate; the reason is in that
    module. `adv_usd` and `vol_daily` are day x symbol matrices.
    """
    w = np.asarray(weights, dtype=float)
    t_len, n = w.shape
    fee = np.zeros(t_len)
    spread = np.zeros(t_len)
    slip = np.zeros(t_len)
    impact = np.zeros(t_len)

    half_spread = float(half_spread_bps_value)
    for leg in legs:
        traded = traded_notional(w, leg.notional_scale)
        fee += np.nansum(traded * (leg_fee_bps[leg.leg] / 1e4), axis=1)
        spread += np.nansum(traded * (half_spread / 1e4), axis=1)
        slip += np.nansum(traded * (assumptions.latency_slippage_bps / 1e4), axis=1)
        part = participation(traded, adv_usd, assumptions.capital_usd)
        bps = impact_bps(
            part,
            vol_daily,
            coefficient=assumptions.impact_coefficient,
            fallback_bps=assumptions.assumed_impact_bps,
        )
        impact += np.nansum(traded * (bps / 1e4), axis=1)

    return {
        "total": fee + spread + slip + impact,
        "components": {
            "fee": fee,
            "half_spread": spread,
            "latency_slippage": slip,
            "volatility_impact": impact,
        },
        "days": t_len,
        "n_symbols": int(n),
    }


def stressed_turnover(weights: np.ndarray, legs: list[Leg]) -> np.ndarray:
    """Total traded notional per day across every leg, in portfolio-notional units."""
    total = np.zeros(weights.shape[0], dtype=float)
    for leg in legs:
        total += traded_notional(weights, leg.notional_scale).sum(axis=1)
    return total


def flat_baseline_cost(turnover: np.ndarray, bps_per_turn: float) -> np.ndarray:
    """The single flat rate the lab charged before this model existed.

    Kept only as a consistency probe. Drive the four components with every term
    but fees switched off and a 6.0 bps schedule, and the result must equal this
    to the last bit; if it does not, the new model is not re-pricing the same
    book the statistical gates scored and the two reports describe different
    strategies.
    """
    return np.asarray(turnover, dtype=float) * (float(bps_per_turn) / 1e4)
