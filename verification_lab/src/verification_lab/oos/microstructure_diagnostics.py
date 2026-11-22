"""Separate G6 microstructure diagnostic pipeline for passive OOS observations.

Strict epistemic boundaries:
- L1 top-of-book snapshots do NOT establish FIFO queue position.
- L1 snapshots are NOT equivalent to L2 order-by-order fill data.
- Sample adequacy and identification assumptions are stated explicitly.
- Always preserves G6_FULL_EXECUTION_PARITY_NOT_VERIFIED until empirical
  L2/execution evidence exists.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal
from statistics import median
from typing import Any, Mapping, Sequence

G6_PARITY_STATUS = "G6_FULL_EXECUTION_PARITY_NOT_VERIFIED"
MIN_ADEQUATE_L1_SAMPLES = 1000
DEFAULT_BORROW_APR_GRID_BPS: tuple[int, ...] = (300, 500, 800, 1000, 1500)


@dataclass(frozen=True)
class MicrostructureDiagnosticReport:
    g6_execution_parity_status: str
    l1_establishes_fifo_queue_position: bool
    l1_equivalent_to_l2_order_by_order: bool
    sample_count: int
    min_adequate_sample_count: int
    sample_adequacy_status: str
    spread_bps_distribution: dict[str, float | None]
    quote_freshness_seconds: dict[str, float | None]
    venue_depth_l1_summary: dict[str, dict[str, float | None]]
    quote_gap_count: int
    funding_availability_ratio: float
    data_completeness_mean: float
    borrow_apr_sensitivity_bps: list[dict[str, Any]]
    observed_trading_cost_bounds_bps: dict[str, float | None]
    identification_assumptions: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _quantile(sorted_vals: Sequence[float], q: float) -> float | None:
    if not sorted_vals:
        return None
    idx = int(round(q * (len(sorted_vals) - 1)))
    return round(float(sorted_vals[max(0, min(idx, len(sorted_vals) - 1))]), 6)


def compute_g6_microstructure_diagnostics(
    observations: Sequence[Mapping[str, Any]],
    *,
    borrow_apr_grid_bps: Sequence[int] = DEFAULT_BORROW_APR_GRID_BPS,
    max_quote_gap_seconds: float = 300.0,
) -> MicrostructureDiagnosticReport:
    """Compute passive G6 microstructure diagnostics without overstating execution parity."""
    spreads: list[float] = []
    freshness: list[float] = []
    completeness_vals: list[float] = []
    funding_available = 0
    annual_funding_vals: list[Decimal] = []
    quote_gaps = 0
    venue_depth: dict[str, list[tuple[float, float]]] = {}

    for obs in observations:
        venue = str(obs.get("venue", "unknown"))
        spread_raw = obs.get("spread_bps")
        if spread_raw is not None:
            spreads.append(float(spread_raw))

        meta = obs.get("public_liquidity_metadata") or {}
        age_raw = meta.get("quote_age_seconds")
        if age_raw is not None:
            age_f = float(age_raw)
            freshness.append(age_f)
            if age_f > max_quote_gap_seconds:
                quote_gaps += 1
        else:
            quote_gaps += 1

        bid_q = obs.get("l1_bid_qty")
        ask_q = obs.get("l1_ask_qty")
        if bid_q is not None and ask_q is not None:
            venue_depth.setdefault(venue, []).append((float(bid_q), float(ask_q)))

        ann_f = obs.get("annualized_funding_bps")
        if ann_f is not None:
            funding_available += 1
            annual_funding_vals.append(Decimal(str(ann_f)))

        comp = obs.get("data_completeness")
        if isinstance(comp, (int, float)) and not isinstance(comp, bool):
            completeness_vals.append(float(comp))

    n = len(observations)
    spreads_sorted = sorted(spreads)
    fresh_sorted = sorted(freshness)

    spread_dist = {
        "min": round(spreads_sorted[0], 6) if spreads_sorted else None,
        "p50": round(float(median(spreads_sorted)), 6) if spreads_sorted else None,
        "p95": _quantile(spreads_sorted, 0.95),
        "max": round(spreads_sorted[-1], 6) if spreads_sorted else None,
    }
    fresh_dist = {
        "min": round(fresh_sorted[0], 6) if fresh_sorted else None,
        "p50": round(float(median(fresh_sorted)), 6) if fresh_sorted else None,
        "p95": _quantile(fresh_sorted, 0.95),
        "max": round(fresh_sorted[-1], 6) if fresh_sorted else None,
    }

    depth_summary: dict[str, dict[str, float | None]] = {}
    for venue, pairs in sorted(venue_depth.items()):
        bids = [p[0] for p in pairs]
        asks = [p[1] for p in pairs]
        depth_summary[venue] = {
            "samples": float(len(pairs)),
            "median_l1_bid_qty": round(float(median(bids)), 6),
            "median_l1_ask_qty": round(float(median(asks)), 6),
        }

    mean_ann_funding = (
        sum(annual_funding_vals, Decimal("0")) / Decimal(len(annual_funding_vals))
        if annual_funding_vals
        else None
    )
    borrow_sensitivity: list[dict[str, Any]] = []
    for b_bps in borrow_apr_grid_bps:
        net_spread = (
            round(float(mean_ann_funding - Decimal(b_bps)), 4)
            if mean_ann_funding is not None
            else None
        )
        borrow_sensitivity.append(
            {
                "borrow_apr_bps": int(b_bps),
                "mean_funding_minus_borrow_bps": net_spread,
                "passes_200bps_floor": (net_spread is not None and net_spread >= 200.0),
            }
        )

    # Lower bound: half-spread crossing cost for entry+exit (2 * half-spread = 1 * full spread).
    # Upper bound remains None because L1 cannot bound market impact or partial-fill adverse selection.
    cost_bounds = {
        "observed_l1_half_spread_bps_p50": (
            round(spread_dist["p50"] / 2.0, 6) if spread_dist["p50"] is not None else None
        ),
        "observed_l1_round_trip_spread_lower_bound_bps_p50": spread_dist["p50"],
        "market_impact_and_queue_slippage_upper_bound_bps": None,
    }

    adequacy = (
        "SAMPLE_ADEQUATE_FOR_L1_SPREAD_ONLY"
        if n >= MIN_ADEQUATE_L1_SAMPLES
        else f"INSUFFICIENT_SAMPLE_N{n}"
    )

    return MicrostructureDiagnosticReport(
        g6_execution_parity_status=G6_PARITY_STATUS,
        l1_establishes_fifo_queue_position=False,
        l1_equivalent_to_l2_order_by_order=False,
        sample_count=n,
        min_adequate_sample_count=MIN_ADEQUATE_L1_SAMPLES,
        sample_adequacy_status=adequacy,
        spread_bps_distribution=spread_dist,
        quote_freshness_seconds=fresh_dist,
        venue_depth_l1_summary=depth_summary,
        quote_gap_count=quote_gaps,
        funding_availability_ratio=round(funding_available / n, 6) if n > 0 else 0.0,
        data_completeness_mean=(
            round(sum(completeness_vals) / len(completeness_vals), 6)
            if completeness_vals
            else 0.0
        ),
        borrow_apr_sensitivity_bps=borrow_sensitivity,
        observed_trading_cost_bounds_bps=cost_bounds,
        identification_assumptions=[
            "L1 top-of-book snapshots observe quoted spread and top size only; they do NOT identify FIFO queue position.",
            "L1 snapshots are NOT equivalent to L2/L3 order-by-order book deltas or empirical fill receipts.",
            "Any fill-probability inference requires empirical venue fill logs and >= 1000 non-overlapping observations.",
            "G6_FULL_EXECUTION_PARITY_NOT_VERIFIED remains active until empirical execution parity is proven.",
        ],
    )
