"""Calibrated FIFO passive-maker queue, adverse-selection & single-leg miss model (§6.5, §20.3).

Unlike a naive zero-spread maker assumption (which `fees.per_side_bps(..., side='maker')`
rightly refuses), passive quoting on a two-leg spot-perp cash-and-carry pair incurs three
distinct microstructure frictions:
1. **FIFO Queue Fill Probability (`p_fill < 1`):** Resting at top-of-book fills only a
   fraction `p_fill` of desired rebalance notional per period, delaying entry into wide
   basis and slowing exit when basis decays.
2. **Adverse Selection (`adverse_selection_bps` in `[1.5, 3.0]` bps per leg):** Passive
   limit orders fill disproportionately when informed flow sweeps through the quote
   (toxic fills / winner's curse).
3. **Unhedged Single-Leg Miss Fallback (`p_leg_miss`):** When one leg fills passively and
   the hedge leg misses in the queue, the strategy must cross the spread immediately as
   an emergency taker (`taker_fee + half_spread + latency_slippage`) to eliminate naked
   directional exposure.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import fees
from .cost_model import CostAssumptions, Leg, impact_bps, participation, traded_notional

ADVERSE_SELECTION_FLOOR_BPS = 1.5
ADVERSE_SELECTION_MID_BPS = 2.25
ADVERSE_SELECTION_CEILING_BPS = 3.0

LEG_MISS_FLOOR = 0.15
LEG_MISS_MID = 0.20
LEG_MISS_CEILING = 0.25


@dataclass(frozen=True)
class MakerQueueAssumptions:
    p_fill: float = 0.65
    adverse_selection_bps: float = ADVERSE_SELECTION_MID_BPS
    p_leg_miss: float = LEG_MISS_MID
    dust_threshold: float = 0.01

    def __post_init__(self) -> None:
        if not (0.0 < self.p_fill <= 1.0):
            raise ValueError(f"p_fill must lie in (0, 1], got {self.p_fill}")
        if self.adverse_selection_bps < 0.0:
            raise ValueError("adverse_selection_bps must be >= 0")
        if not (0.0 <= self.p_leg_miss <= 1.0):
            raise ValueError(f"p_leg_miss must lie in [0, 1], got {self.p_leg_miss}")


def apply_fifo_partial_fills(
    target_weights: np.ndarray,
    *,
    p_fill: float,
    dust_threshold: float = 0.01,
    tradable_mask: np.ndarray | None = None,
) -> np.ndarray:
    """Realised daily position path under FIFO partial queue fills (`p_fill` per bar).

    When `tradable_mask[t, j]` is `False` (the contract was already inactive/delisted
    at the prior bar close `t-1`), exchange mandatory settlement flattens any residual
    position to `0.0` immediately rather than decaying through a non-existent passive
    order book.
    """
    pf = min(1.0, max(0.05, float(p_fill)))
    target = np.nan_to_num(np.asarray(target_weights, dtype=float), nan=0.0)
    t_len, n_sym = target.shape
    mask = (
        np.asarray(tradable_mask, dtype=bool)
        if tradable_mask is not None
        else np.ones((t_len, n_sym), dtype=bool)
    )
    realised = np.zeros((t_len, n_sym), dtype=float)
    prev = np.zeros(n_sym, dtype=float)

    for t in range(t_len):
        goal = np.where(mask[t], target[t], 0.0)
        step = prev + pf * (goal - prev)
        step = np.where(mask[t], step, 0.0)
        # Clean up tiny residual dust once target is flat.
        step = np.where((goal == 0.0) & (np.abs(step) < dust_threshold), 0.0, step)
        gross = float(np.sum(np.abs(step)))
        if gross > 1.0:
            step = step / gross
        realised[t] = step
        prev = step
    return realised


def blended_pair_bps_per_leg(
    venue_name: str,
    *,
    adverse_selection_bps: float = ADVERSE_SELECTION_MID_BPS,
    p_leg_miss: float = LEG_MISS_MID,
    taker_half_spread_bps: float = 3.0,
    latency_slippage_bps: float = 1.0,
) -> dict[str, float]:
    """Expected per-leg bps (before square-root volatility impact) for a maker+fallback pair."""
    v = fees.venue(venue_name)
    out: dict[str, float] = {}
    passive = 1.0 - float(p_leg_miss)
    miss = float(p_leg_miss)
    for leg in ("spot", "perp"):
        fee_b = passive * v.maker_bps(leg) + miss * v.taker_bps(leg)
        adv_or_spread_b = passive * float(adverse_selection_bps) + miss * float(taker_half_spread_bps)
        lat_b = miss * float(latency_slippage_bps)
        out[leg] = fee_b + adv_or_spread_b + lat_b
    return out


def maker_daily_cost(
    weights: np.ndarray,
    *,
    legs: list[Leg],
    venue_name: str,
    taker_half_spread_bps: float,
    adv_usd: np.ndarray,
    vol_daily: np.ndarray,
    assumptions: CostAssumptions,
    queue: MakerQueueAssumptions,
) -> dict:
    """Four-component additive TCA for passive maker quoting with adverse selection & leg-miss."""
    w = np.asarray(weights, dtype=float)
    t_len, n = w.shape
    fee = np.zeros(t_len)
    spread_adv = np.zeros(t_len)
    slip = np.zeros(t_len)
    impact = np.zeros(t_len)

    v = fees.venue(venue_name)
    passive = 1.0 - float(queue.p_leg_miss)
    miss = float(queue.p_leg_miss)

    for leg in legs:
        traded = traded_notional(w, leg.notional_scale)
        eff_fee_bps = passive * v.maker_bps(leg.leg) + miss * v.taker_bps(leg.leg)
        # No double-counting: passive fills pay adverse_selection_bps (never half_spread);
        # only the `p_leg_miss` emergency-taker fallback crosses `taker_half_spread_bps`.
        eff_spread_adv_bps = (
            passive * float(queue.adverse_selection_bps) + miss * float(taker_half_spread_bps)
        )
        eff_lat_bps = miss * float(assumptions.latency_slippage_bps)

        fee += np.nansum(traded * (eff_fee_bps / 1e4), axis=1)
        spread_adv += np.nansum(traded * (eff_spread_adv_bps / 1e4), axis=1)
        slip += np.nansum(traded * (eff_lat_bps / 1e4), axis=1)

        part = participation(traded, adv_usd, assumptions.capital_usd)
        bps = impact_bps(
            part,
            vol_daily,
            coefficient=assumptions.impact_coefficient,
            fallback_bps=assumptions.assumed_impact_bps,
        )
        impact += np.nansum(traded * (bps / 1e4), axis=1)

    return {
        "total": fee + spread_adv + slip + impact,
        "components": {
            "fee": fee,
            "half_spread": spread_adv,
            "latency_slippage": slip,
            "volatility_impact": impact,
        },
        "days": t_len,
        "n_symbols": int(n),
    }
