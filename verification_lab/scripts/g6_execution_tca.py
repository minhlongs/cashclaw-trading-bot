"""G6 - realistic execution costs, Decimal event-ledger parity & Hyperliquid cross-check.

Prices every hypothesis in `artifacts/g5_statistical_validity.json` (`H1`, `H2`, `H3`
on `CORE_19` and `H1_G1`, `H2_G1`, `H3_MAKER` on `SURVIVORSHIP_23`) across both ends
of the train-calibrated spread band without double counting spread, verifies `< 1 bps`
terminal & pathwise NAV parity against an independent `decimal.Decimal` order-and-funding
event ledger (`event_ledger_oracle.py`), and cross-checks Hyperliquid 1h historical
funding carry alongside empirical `l2Book` / `impactPxs` top-of-book snapshots.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from verification_lab.execution import (  # noqa: E402
    cost_model,
    event_ledger_oracle,
    fees,
    maker_queue,
    market,
    pricing,
)
from verification_lab.execution import spread as spread_mod  # noqa: E402
from verification_lab.runner import run_grid  # noqa: E402
from verification_lab.stats.core import sharpe_ratio  # noqa: E402
from verification_lab.strategies import h1_funding_carry as h1  # noqa: E402
from verification_lab.strategies import h2_tsmom as h2  # noqa: E402
from verification_lab.strategies import h3_basis_carry as h3  # noqa: E402
from verification_lab.strategies import loaders  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "artifacts"
G5 = OUT / "g5_statistical_validity.json"
DATA = REPO / "verification_lab" / "data" / "normalized"

PERIODS = 365
STRESS_MULTIPLES = (1.0, 1.5, 2.0, 3.0)
EXPECTANCY_MULTIPLE = 2.0
FLAT_BPS_BEFORE = 6.0
INGESTED_VENUE = "binance"
FUNDING_HOURS_MEASURED = 8
RULES = "-" * 100


def spec_for(name: str) -> dict:
    """The legs and VIP-0 schedules one hypothesis actually trades."""
    perp_bps = fees.venue(INGESTED_VENUE).taker_bps("perp")
    if name in ("H1", "H2", "H1_G1", "H2_G1"):
        return {
            "mode": "taker",
            "legs": [cost_model.Leg("perp", INGESTED_VENUE, 1.0)],
            "leg_fee_bps": {"perp": perp_bps},
            "order": "one perp leg at full book weight (VIP-0 taker)",
        }
    if name == "H3":
        return {
            "mode": "taker",
            "legs": [
                cost_model.Leg("spot", INGESTED_VENUE, 0.5),
                cost_model.Leg("perp", INGESTED_VENUE, 0.5),
            ],
            "leg_fee_bps": {
                "spot": fees.venue(INGESTED_VENUE).taker_bps("spot"),
                "perp": perp_bps,
            },
            "order": "two legs at half pair weight each: spot long, perp short (VIP-0 taker)",
        }
    if name == "H3_MAKER":
        return {
            "mode": "maker_fifo_queue",
            "legs": [
                cost_model.Leg("spot", INGESTED_VENUE, 0.5),
                cost_model.Leg("perp", INGESTED_VENUE, 0.5),
            ],
            "leg_fee_bps": {
                "spot": fees.venue(INGESTED_VENUE).maker_bps("spot"),
                "perp": fees.venue(INGESTED_VENUE).maker_bps("perp"),
            },
            "taker_fallback_fee_bps": {
                "spot": fees.venue(INGESTED_VENUE).taker_bps("spot"),
                "perp": perp_bps,
            },
            "queue_band": {
                "floor": {
                    "adverse_selection_bps": maker_queue.ADVERSE_SELECTION_FLOOR_BPS,
                    "p_leg_miss": maker_queue.LEG_MISS_FLOOR,
                },
                "ceiling": {
                    "adverse_selection_bps": maker_queue.ADVERSE_SELECTION_CEILING_BPS,
                    "p_leg_miss": maker_queue.LEG_MISS_CEILING,
                },
            },
            "order": (
                "two passive limit legs at half pair weight each with FIFO p_fill<1, "
                "adverse selection (1.5-3.0 bps), and p_leg_miss forced taker hedge"
            ),
        }
    raise KeyError(f"no execution spec for {name!r}")


def rebuild(name: str, params: dict, panel: run_grid.Panel) -> dict:
    """Rebuild the winning book exactly as G5 scored it, and nothing else."""
    if name == "H1":
        positions = h1.build_positions(panel.funding, **params)
        result = h1.backtest(positions, panel.perp_returns, panel.funding)
        perp_leg = positions
    elif name == "H1_G1":
        positions = h1.build_positions_g1(panel.funding, panel.perp_returns, **params)
        result = h1.backtest(positions, panel.perp_returns, panel.funding)
        perp_leg = positions
    elif name == "H2":
        positions = h2.build_positions(panel.perp_close, **params)
        result = h2.evaluate(positions, panel.perp_returns, panel.funding)
        perp_leg = positions
    elif name == "H2_G1":
        positions = h2.build_positions_g1(panel.perp_close, **params)
        result = h2.evaluate(positions, panel.perp_returns, panel.funding)
        perp_leg = positions
    elif name == "H3":
        positions = h3.build_positions(panel.basis, panel.funding, **params)
        result = h3.evaluate(
            positions, panel.perp_returns, panel.spot_returns, panel.funding
        )
        symbols = [c for c in positions.columns if c != "day"]
        perp_leg = positions.with_columns(
            [(-0.5 * pl.col(s)).alias(s) for s in symbols]
        )
    elif name == "H3_MAKER":
        positions = h3.build_positions_maker(panel.basis, panel.funding, **params)
        result = h3.evaluate_maker(
            positions, panel.perp_returns, panel.spot_returns, panel.funding
        )
        symbols = [c for c in positions.columns if c != "day"]
        perp_leg = positions.with_columns(
            [(-0.5 * pl.col(s)).alias(s) for s in symbols]
        )
    else:
        raise KeyError(f"unknown hypothesis {name!r}")
    return {"positions": positions, "result": result, "perp_leg": perp_leg}


def measure_band(perp_4h: pl.DataFrame) -> dict:
    """Measure the half-spread band from per-symbol 4h bars."""
    estimates: dict[str, dict] = {}
    ar_estimates: dict[str, dict] = {}
    has_close = "close" in perp_4h.columns
    for (symbol,), frame in perp_4h.group_by("symbol"):
        bars = frame.sort("ts_ms")
        high = bars["high"].to_numpy()
        low = bars["low"].to_numpy()
        estimates[symbol] = spread_mod.summarise(
            spread_mod.corwin_schultz(high, low)
        )
        if has_close:
            ar_estimates[symbol] = spread_mod.summarise(
                spread_mod.abdi_ranaldo(high, low, bars["close"].to_numpy())
            )
    values = {
        symbol: row["spread_bps"]
        for symbol, row in estimates.items()
        if row["spread_bps"] is not None
    }
    band = spread_mod.band(
        values,
        floor_half_spread_bps=spread_mod.AUDIT_LIQUID_HALF_SPREAD_BPS,
    )
    band["bar_minutes"] = 240
    band["per_symbol_full_spread_bps"] = dict(sorted(values.items()))
    band["symbols_with_detectable_spread"] = sum(
        1 for row in estimates.values() if row["detectable"]
    )
    med_negative = [
        row["negative_fraction"]
        for row in estimates.values()
        if row["negative_fraction"] is not None
    ]
    band["median_negative_fraction"] = (
        round(float(np.median(med_negative)), 4) if med_negative else None
    )
    if has_close:
        ar_values = {
            symbol: row["spread_bps"]
            for symbol, row in ar_estimates.items()
            if row["spread_bps"] is not None
        }
        ar_all = sorted(ar_values.values())
        ar_detectable = sorted(
            row["spread_bps"]
            for row in ar_estimates.values()
            if row["detectable"] and row["spread_bps"] is not None
        )
        band["abdi_ranaldo_cross_check"] = {
            "estimator": "Abdi-Ranaldo (2017) close-to-midrange",
            "n_symbols": len(ar_all),
            "symbols_with_detectable_spread": len(ar_detectable),
            "median_full_spread_bps": (
                round(float(np.median(ar_all)), 2) if ar_all else None
            ),
            "median_detectable_only_bps": (
                round(float(np.median(ar_detectable)), 2) if ar_detectable else None
            ),
            "max_full_spread_bps": (
                round(float(max(ar_all)), 2) if ar_all else None
            ),
            "per_symbol_full_spread_bps": dict(sorted(ar_values.items())),
        }
    else:
        band["abdi_ranaldo_cross_check"] = None
    return band


def fee_component(
    weights: np.ndarray, legs: list, rates: dict[str, float]
) -> np.ndarray:
    """Per-day fee charge with every other component switched off."""
    n_days = weights.shape[0]
    return cost_model.daily_cost(
        weights,
        legs=legs,
        leg_fee_bps=rates,
        half_spread_bps_value=0.0,
        adv_usd=np.ones((n_days, weights.shape[1])),
        vol_daily=np.zeros((n_days, weights.shape[1])),
        assumptions=cost_model.CostAssumptions(
            latency_slippage_bps=0.0, impact_coefficient=0.0, assumed_impact_bps=0.0
        ),
    )["total"]


def venue_fee_table(name: str, weights: np.ndarray) -> dict:
    """The same book charged each venue's published VIP-0 schedule."""
    rows = {}
    is_maker = name == "H3_MAKER"
    is_pair = name in ("H3", "H3_MAKER")
    for venue_name in fees.venue_names():
        legs = (
            [
                cost_model.Leg("spot", venue_name, 0.5),
                cost_model.Leg("perp", venue_name, 0.5),
            ]
            if is_pair
            else [cost_model.Leg("perp", venue_name, 1.0)]
        )
        if not all(fees.venue(venue_name).available(leg.leg) for leg in legs):
            rows[venue_name] = {"priced": False, "reason": "venue publishes no such market"}
            continue
        if is_maker:
            v = fees.venue(venue_name)
            miss = maker_queue.LEG_MISS_MID
            rates = {
                leg.leg: (1.0 - miss) * v.maker_bps(leg.leg) + miss * v.taker_bps(leg.leg)
                for leg in legs
            }
            rows[venue_name] = {
                "priced": True,
                "blended_maker_taker_bps_per_leg": {k: round(val, 4) for k, val in rates.items()},
                "maker_bps_per_leg": {leg.leg: v.maker_bps(leg.leg) for leg in legs},
                "cum_fee": round(float(np.nansum(fee_component(weights, legs, rates))), 6),
            }
        else:
            rates = {leg.leg: fees.venue(venue_name).taker_bps(leg.leg) for leg in legs}
            rows[venue_name] = {
                "priced": True,
                "taker_bps_per_leg": rates,
                "cum_fee": round(float(np.nansum(fee_component(weights, legs, rates))), 6),
            }
    base = rows[INGESTED_VENUE]["cum_fee"]
    for row in rows.values():
        if row["priced"]:
            row["delta_vs_ingested_venue"] = round(row["cum_fee"] - base, 6)
    return rows


def band_flags(floor: dict, ceiling: dict) -> dict:
    floor_exp = bool(floor["net_expectancy_positive_at_2x"])
    ceiling_exp = bool(ceiling["net_expectancy_positive_at_2x"])
    floor_net_positive = float(floor["cum_net"]) > 0.0
    ceiling_net_positive = float(ceiling["cum_net"]) > 0.0
    return {
        "verdict_flips_inside_band": floor_exp != ceiling_exp,
        "net_sign_flips_inside_band": floor_net_positive != ceiling_net_positive,
        "gate_holds_at_both_ends": floor_exp and ceiling_exp,
    }


def _slice_priced(priced: pricing.PricedBook, s: slice) -> pricing.PricedBook:
    gross_s = priced.gross[s]
    cost_s = priced.cost[s]
    return pricing.PricedBook(
        gross=gross_s,
        cost=cost_s,
        components={k: v[s] for k, v in priced.components.items()},
        days=int(gross_s.size),
    )


def _summarise_end(
    priced: pricing.PricedBook,
    positions: np.ndarray,
    trades: np.ndarray,
    level: float,
) -> dict:
    rungs = pricing.ladder(priced, positions, STRESS_MULTIPLES)
    gated = rungs[f"{EXPECTANCY_MULTIPLE}x"]
    return {
        "half_spread_bps": level,
        "cum_cost": round(float(np.nansum(priced.cost)), 6),
        "cum_net": rungs["1.0x"]["cum_net"],
        "sharpe": rungs["1.0x"]["sharpe"],
        "n_trades": rungs["1.0x"]["n_trades"],
        "expectancy_per_trade": rungs["1.0x"]["expectancy_per_trade"],
        "mean_hold_days": rungs["1.0x"]["mean_hold_days"],
        "effective_bps_per_turn": pricing.bps_per_turn(priced, trades),
        "break_even_multiple": rungs["1.0x"]["break_even_multiple"],
        "share_of_cost": pricing.share_of_cost(priced),
        "attrition": pricing.attrition(priced),
        "cost_stress": rungs,
        "net_expectancy_positive_at_2x": gated["expectancy_positive"],
        "net_positive_at_2x": gated["net_positive"],
    }


def _price_hypothesis_at_end(
    name: str,
    gross: np.ndarray,
    weights: np.ndarray,
    positions: np.ndarray,
    spec: dict,
    level: float,
    end_label: str,
    matrices: dict,
    assumptions: cost_model.CostAssumptions,
    *,
    venue_override: str | None = None,
) -> pricing.PricedBook:
    legs = spec["legs"]
    venue_name = venue_override or INGESTED_VENUE
    if spec.get("mode") == "maker_fifo_queue":
        qb = spec["queue_band"][end_label]
        q_assump = maker_queue.MakerQueueAssumptions(
            p_fill=1.0,
            adverse_selection_bps=qb["adverse_selection_bps"],
            p_leg_miss=qb["p_leg_miss"],
        )
        m_cost = maker_queue.maker_daily_cost(
            weights,
            legs=legs,
            venue_name=venue_name,
            taker_half_spread_bps=level,
            adv_usd=matrices["adv"],
            vol_daily=matrices["vol"],
            assumptions=assumptions,
            queue=q_assump,
        )
        return pricing.PricedBook(
            gross=np.asarray(gross, dtype=float),
            cost=m_cost["total"],
            components=m_cost["components"],
            days=m_cost["days"],
        )
    leg_rates = (
        {leg.leg: fees.venue(venue_name).taker_bps(leg.leg) for leg in legs}
        if venue_override is not None
        else spec["leg_fee_bps"]
    )
    return pricing.price_book(
        gross,
        weights,
        positions,
        legs=legs,
        leg_fee_bps=leg_rates,
        half_spread_bps_value=level,
        adv_usd=matrices["adv"],
        vol_daily=matrices["vol"],
        assumptions=assumptions,
    )


def evaluate(
    name: str,
    params: dict,
    panel: run_grid.Panel,
    band: dict,
    matrices: dict,
    g5_entry: dict,
    *,
    split: int | None = None,
) -> dict:
    """Price one hypothesis at both band ends and under the full stress ladder."""
    run = rebuild(name, params, panel)
    result = run["result"]
    symbols = [c for c in run["positions"].columns if c != "day"]
    spec = spec_for(name)
    legs = spec["legs"]

    weights = run["positions"].select(symbols).cast(pl.Float64).to_numpy()
    positions = np.nan_to_num(weights, nan=0.0)
    gross = np.asarray(result["gross"], dtype=float)
    trades = cost_model.stressed_turnover(weights, legs)
    exposure = np.nansum(np.abs(positions), axis=1)

    if name == "H3_MAKER":
        per_leg_mid = maker_queue.blended_pair_bps_per_leg(INGESTED_VENUE)
        g5_bps_per_leg_turn = 0.25 * (per_leg_mid["spot"] + per_leg_mid["perp"])
        probe_rates = per_leg_mid
        baseline = cost_model.flat_baseline_cost(result["turnover"], g5_bps_per_leg_turn)
    else:
        g5_bps_per_leg_turn = FLAT_BPS_BEFORE
        probe_rates = {leg.leg: FLAT_BPS_BEFORE / leg.notional_scale for leg in legs}
        baseline = cost_model.flat_baseline_cost(result["turnover"], FLAT_BPS_BEFORE)

    probe = fee_component(weights, legs, probe_rates)
    reconciles = bool(np.allclose(probe, baseline, rtol=0.0, atol=1e-12))

    delisted_last_days: dict[str, int] = {}
    if getattr(panel, "universe", "CORE_19") == "SURVIVORSHIP_23":
        for dsym in loaders.DELISTED_4:
            if dsym in panel.perp_close.columns:
                non_null = panel.perp_close.select(["day", dsym]).drop_nulls()
                if non_null.height > 0:
                    delisted_last_days[dsym] = int(non_null["day"].max())

    funding = market.funding_cashflow(
        panel.funding,
        run["perp_leg"],
        delisted_last_active_days=delisted_last_days or None,
    )
    aligned = bool(list(run["perp_leg"]["day"]) == list(panel.funding["day"]))
    carry = result.get("carry_leg")
    carry_arr = None
    if carry is None:
        carry_reconciles = False
    else:
        carry_arr = np.asarray(carry, dtype=float)
        carry_reconciles = bool(
            carry_arr.shape == funding.shape
            and np.allclose(funding, carry_arr, rtol=0.0, atol=1e-12)
        )

    assumptions = cost_model.CostAssumptions()
    ends = {}
    priced_by_label: dict[str, pricing.PricedBook] = {}
    for label, level in (
        ("floor", band["floor_half_spread_bps"]),
        ("ceiling", band["ceiling_half_spread_bps"]),
    ):
        priced = _price_hypothesis_at_end(
            name, gross, weights, positions, spec, level, label, matrices, assumptions
        )
        priced_by_label[label] = priced
        ends[label] = _summarise_end(priced, positions, trades, level)

    flags = band_flags(ends["floor"], ends["ceiling"])

    locked_oos_block = None
    if split is not None:
        embargo_days = int(
            (g5_entry.get("locked_oos") or {}).get(
                "embargo_days", 2 * int(params.get("lookback", 0))
            )
        )
        oos_slice = slice(int(split) + embargo_days, None)
        oos_positions = positions[oos_slice]
        oos_trades = trades[oos_slice]
        oos_ends = {
            label: _summarise_end(
                _slice_priced(priced_by_label[label], oos_slice),
                oos_positions,
                oos_trades,
                band[f"{label}_half_spread_bps"],
            )
            for label in ("floor", "ceiling")
        }
        oos_flags = band_flags(oos_ends["floor"], oos_ends["ceiling"])
        locked_oos_block = {
            "days": int(oos_positions.shape[0]),
            "embargo_days": embargo_days,
            "cum_gross": round(float(np.nansum(gross[oos_slice])), 6),
            "traded_notional_turns": round(float(np.nansum(oos_trades)), 6),
            "band": oos_flags,
            "g6_pass": bool(oos_flags["gate_holds_at_both_ends"]),
            "at_floor": oos_ends["floor"],
            "at_ceiling": oos_ends["ceiling"],
        }

    g6_pass = (
        bool(flags["gate_holds_at_both_ends"] and locked_oos_block["g6_pass"])
        if locked_oos_block is not None
        else bool(flags["gate_holds_at_both_ends"])
    )

    out = {
        "hypothesis": name,
        "panel_universe": getattr(panel, "universe", "CORE_19"),
        "winner_params": params,
        "winner_source": "artifacts/g5_statistical_validity.json",
        "g5_verdict": g5_entry["verdict"],
        "execution_spec": spec,
        "book": {
            "days": int(weights.shape[0]),
            "symbols": len(symbols),
            "cum_gross": round(float(np.nansum(gross)), 6),
            "lab_cum_cost_flat_6bps": round(float(np.nansum(baseline)), 6),
            "g5_baseline_bps_per_leg_turn": round(float(g5_bps_per_leg_turn), 4),
            "traded_notional_turns": round(float(np.nansum(trades)), 6),
            "mean_turnover_per_day": round(float(np.nanmean(result["turnover"])), 6),
            "flat_day_fraction": round(float(np.mean(trades <= 0.0)), 4),
            "mean_gross_exposure": round(float(np.nanmean(exposure)), 4),
            "max_gross_exposure": round(float(np.nanmax(exposure)), 4),
        },
        "reconciliation": {
            "flat_6bps_reproduces_lab_cost": reconciles,
            "probe_leg_fee_bps": {k: round(v, 6) for k, v in probe_rates.items()},
            "modelled_cum_cost_at_flat_6bps": round(float(np.nansum(probe)), 10),
            "lab_cum_cost_at_flat_6bps": round(float(np.nansum(baseline)), 10),
            "funding_days_aligned": bool(aligned),
            "funding_cashflow_matches_strategy_carry": carry_reconciles,
            "funding_cum": round(float(np.nansum(funding)), 6),
            "strategy_carry_cum": (
                None if carry_arr is None else round(float(np.nansum(carry_arr)), 6)
            ),
            "note": (
                "funding is the cash flow each strategy already books, recomputed from "
                "the position and funding panels independently; it is reported, not "
                "charged again"
            ),
        },
        "funding": {
            "hours_declared_by_venue": fees.venue(INGESTED_VENUE).funding_hours,
            "hours_in_ingested_data": FUNDING_HOURS_MEASURED,
            "charged_as": "cash flow on held notional, never per unit of turnover",
            "cum": round(float(np.nansum(funding)), 6),
            "sharpe_of_funding_leg": round(sharpe_ratio(funding, PERIODS), 4),
        },
        "venue_fee_comparison": venue_fee_table(name, weights),
        "band": {
            **flags,
            "basis": (
                f"net expectancy per trade at {EXPECTANCY_MULTIPLE}x fees, at both ends "
                "of the measured spread band"
            ),
            "sign_flip_basis": (
                "sign of cumulative net at the realistic schedule, i.e. at 1.0x, at "
                "both ends of the band"
            ),
        },
        "g6_pass": g6_pass,
        "full_sample_g6_pass": bool(flags["gate_holds_at_both_ends"]),
        "at_floor": ends["floor"],
        "at_ceiling": ends["ceiling"],
    }
    if locked_oos_block is not None:
        out["locked_oos"] = locked_oos_block
    return out


def _build_event_ledger_parity(
    g5_entries: list[dict],
    panels: dict[str, run_grid.Panel],
    matrices_by_u: dict[str, dict],
    band: dict,
    funding_events_raw: pl.DataFrame,
) -> dict:
    """Run independent Decimal order-and-funding ledger oracle across every hypothesis."""
    assumptions = cost_model.CostAssumptions()
    floor_spread = float(band["floor_half_spread_bps"])
    rows: dict[str, dict] = {}

    for entry in g5_entries:
        name = entry["hypothesis"]
        u_key = "SURVIVORSHIP_23" if name in ("H1_G1", "H2_G1", "H3_MAKER") else "CORE_19"
        panel = panels[u_key]
        mats = matrices_by_u[u_key]
        run = rebuild(name, entry["winner_params"], panel)
        symbols = [c for c in run["positions"].columns if c != "day"]
        weights = run["positions"].select(symbols).cast(pl.Float64).to_numpy()
        positions = np.nan_to_num(weights, nan=0.0)
        gross = np.asarray(run["result"]["gross"], dtype=float)
        spec = spec_for(name)
        priced_floor = _price_hypothesis_at_end(
            name, gross, weights, positions, spec, floor_spread, "floor", mats, assumptions
        )
        vec_net = priced_floor.gross - priced_floor.cost

        has_spot = name in ("H3", "H3_MAKER")
        if name == "H3_MAKER":
            miss = maker_queue.LEG_MISS_FLOOR
            adv_bps = maker_queue.ADVERSE_SELECTION_FLOOR_BPS
            v = fees.venue(INGESTED_VENUE)
            leg_fee_bps = {
                leg: (1.0 - miss) * v.maker_bps(leg) + miss * v.taker_bps(leg)
                for leg in ("spot", "perp")
            }
            spr_bps = {leg: (1.0 - miss) * adv_bps + miss * floor_spread for leg in ("spot", "perp")}
            lat_bps = {leg: miss * assumptions.latency_slippage_bps for leg in ("spot", "perp")}
        else:
            leg_fee_bps = dict(spec["leg_fee_bps"])
            spr_bps = {leg.leg: floor_spread for leg in spec["legs"]}
            lat_bps = {leg.leg: assumptions.latency_slippage_bps for leg in spec["legs"]}

        f_events = funding_events_raw
        if u_key == "SURVIVORSHIP_23":
            # Apply the exact delisted last_active_ts_ms cutoff on raw 8h events.
            f_events = funding_events_raw.filter(
                (~pl.col("is_delisted").fill_null(False))
                | (pl.col("ts_ms") < pl.col("last_active_ts_ms"))
            )

        oracle = event_ledger_oracle.run_decimal_ledger(
            positions=run["positions"],
            perp_close=panel.perp_close,
            spot_close=panel.spot_close if has_spot else None,
            has_spot_leg=has_spot,
            funding_events=f_events,
            vec_net=vec_net,
            leg_fee_bps=leg_fee_bps,
            half_spread_bps_per_leg=spr_bps,
            latency_bps_per_leg=lat_bps,
            adv_usd=mats["adv"],
            vol_daily=mats["vol"],
            capital_usd=assumptions.capital_usd,
            impact_coefficient=assumptions.impact_coefficient,
            fallback_impact_bps=assumptions.assumed_impact_bps,
        )
        rows[name] = oracle

    all_pass = all(r["passes_1bps_gate"] for r in rows.values())
    max_disc = max(r["terminal_nav_discrepancy_bps"] for r in rows.values()) if rows else 0.0
    return {
        "oracle": "verification_lab.execution.event_ledger_oracle.run_decimal_ledger",
        "precision_digits": 50,
        "funding_event_cadence_hours": 8,
        "tolerance_bps": 1.0,
        "all_pass_1bps_gate": bool(all_pass),
        "max_terminal_nav_discrepancy_bps": round(max_disc, 8),
        "by_hypothesis": rows,
    }


def _build_hyperliquid_cross_check(
    g5_entries: list[dict],
    panels: dict[str, run_grid.Panel],
    matrices_by_u: dict[str, dict],
    split: int,
) -> dict:
    """Cross-check Hyperliquid empirical L1/impact spreads and historical 1h funding carry."""
    hl_quotes_path = DATA / "hyperliquid_l1_quotes.parquet"
    hl_fund_path = DATA / "hyperliquid_funding_1h.parquet"
    if not hl_quotes_path.exists() or not hl_fund_path.exists():
        return {"available": False, "reason": "hyperliquid parquet files missing"}

    hl_quotes = pl.read_parquet(hl_quotes_path).sort("symbol")
    hl_fund_1h = pl.read_parquet(hl_fund_path).sort(["symbol", "ts_ms"])

    l1_half = hl_quotes["l1_half_spread_bps"].to_numpy()
    imp_half = hl_quotes["impact_half_spread_bps"].to_numpy()
    emp_imp_median_half_bps = float(np.median(imp_half))
    emp_l1_median_half_bps = float(np.median(l1_half))

    # Re-price every hypothesis on Hyperliquid VIP-0 schedule + empirical impact half-spread
    # (substituting `emp_imp_median_half_bps` once in place of the 3.0 bps floor: zero double counting!).
    assumptions = cost_model.CostAssumptions()
    hl_repriced: dict[str, dict] = {}
    for entry in g5_entries:
        name = entry["hypothesis"]
        u_key = "SURVIVORSHIP_23" if name in ("H1_G1", "H2_G1", "H3_MAKER") else "CORE_19"
        panel = panels[u_key]
        mats = matrices_by_u[u_key]
        run = rebuild(name, entry["winner_params"], panel)
        symbols = [c for c in run["positions"].columns if c != "day"]
        weights = run["positions"].select(symbols).cast(pl.Float64).to_numpy()
        positions = np.nan_to_num(weights, nan=0.0)
        gross = np.asarray(run["result"]["gross"], dtype=float)
        spec = spec_for(name)
        trades = cost_model.stressed_turnover(weights, spec["legs"])

        priced_hl = _price_hypothesis_at_end(
            name,
            gross,
            weights,
            positions,
            spec,
            emp_imp_median_half_bps,
            "floor",
            mats,
            assumptions,
            venue_override="hyperliquid",
        )
        embargo_days = int((entry.get("locked_oos") or {}).get("embargo_days", 2 * int(entry["winner_params"]["lookback"])))
        oos_s = slice(int(split) + embargo_days, None)
        full_end = _summarise_end(priced_hl, positions, trades, round(emp_imp_median_half_bps, 4))
        oos_end = _summarise_end(
            _slice_priced(priced_hl, oos_s),
            positions[oos_s],
            trades[oos_s],
            round(emp_imp_median_half_bps, 4),
        )
        hl_repriced[name] = {
            "full_sample_1x_cum_net": full_end["cum_net"],
            "full_sample_break_even_multiple": full_end["break_even_multiple"],
            "full_sample_2x_positive": full_end["net_expectancy_positive_at_2x"],
            "locked_oos_1x_cum_net": oos_end["cum_net"],
            "locked_oos_break_even_multiple": oos_end["break_even_multiple"],
            "locked_oos_2x_positive": oos_end["net_expectancy_positive_at_2x"],
        }

    # Historical 1h funding carry cross-check on the overlapping coins (`2024-10 .. 2026-10`).
    hl_daily = (
        hl_fund_1h.with_columns((pl.col("ts_ms") // loaders.DAY_MS).alias("day"))
        .sort(["symbol", "day", "ts_ms"])
        .group_by(["symbol", "day"], maintain_order=True)
        .agg(
            pl.col("funding_rate").sum().alias("hl_funding_daily"),
            pl.col("funding_rate").len().alias("n_hours"),
        )
        .sort(["symbol", "day"])
    )
    hl_syms = sorted(hl_daily["symbol"].unique().to_list())
    panel_core = panels["CORE_19"]
    min_hl_day = int(hl_daily["day"].min())
    max_hl_day = int(hl_daily["day"].max())
    sub_days = panel_core.perp_close.filter(
        (pl.col("day") >= min_hl_day) & (pl.col("day") <= max_hl_day)
    )["day"]

    hl_wide_raw = hl_daily.pivot(
        values="hl_funding_daily", index="day", on="symbol", aggregate_function="first"
    ).sort("day")
    hl_funding_wide = (
        pl.DataFrame({"day": sub_days})
        .join(hl_wide_raw, on="day", how="left")
        .sort("day")
        .select(["day", *hl_syms])
    )
    bn_funding_wide = panel_core.funding.filter(
        (pl.col("day") >= min_hl_day) & (pl.col("day") <= max_hl_day)
    ).select(["day", *hl_syms])
    sub_perp_close = panel_core.perp_close.filter(
        (pl.col("day") >= min_hl_day) & (pl.col("day") <= max_hl_day)
    ).select(["day", *hl_syms])
    sub_perp_rets = panel_core.perp_returns.filter(
        (pl.col("day") >= min_hl_day) & (pl.col("day") <= max_hl_day)
    ).select(["day", *hl_syms])

    # Per-symbol correlation & annualised mean funding comparison.
    per_coin_funding_cmp: dict[str, dict] = {}
    for sym in hl_syms:
        h_arr = hl_funding_wide[sym].cast(pl.Float64).to_numpy()
        b_arr = bn_funding_wide[sym].cast(pl.Float64).to_numpy()
        valid = np.isfinite(h_arr) & np.isfinite(b_arr)
        corr = (
            float(np.corrcoef(h_arr[valid], b_arr[valid])[0, 1])
            if int(np.sum(valid)) >= 10 and np.std(h_arr[valid]) > 0 and np.std(b_arr[valid]) > 0
            else float("nan")
        )
        per_coin_funding_cmp[sym] = {
            "days": int(np.sum(valid)),
            "daily_corr": round(corr, 4) if np.isfinite(corr) else None,
            "hyperliquid_ann_rate_pct": round(float(np.nanmean(h_arr[valid]) * 365 * 100), 3),
            "binance_ann_rate_pct": round(float(np.nanmean(b_arr[valid]) * 365 * 100), 3),
        }

    # Run H1 winner params on Hyperliquid 1h funding vs Binance 8h funding on exact 10-coin window,
    # and score both on the post-embargo `locked_oos` days (`day >= panel_core.days[split + 6]`).
    h1_entry = next(e for e in g5_entries if e["hypothesis"] == "H1")
    h1_params = h1_entry["winner_params"]
    oos_start_day = int(panel_core.days[split + 2 * int(h1_params["lookback"])])
    sub_day_arr = sub_perp_close["day"].to_numpy()
    oos_mask = sub_day_arr >= oos_start_day

    pos_hl = h1.build_positions(hl_funding_wide, **h1_params)
    res_hl = h1.backtest(pos_hl, sub_perp_rets, hl_funding_wide, cost_bps_per_turn=4.5 + emp_imp_median_half_bps + 1.0)
    pos_bn = h1.build_positions(bn_funding_wide, **h1_params)
    res_bn = h1.backtest(pos_bn, sub_perp_rets, bn_funding_wide, cost_bps_per_turn=5.0 + 3.0 + 1.0)

    # Verify 1h funding cadence directly in the Decimal event-ledger oracle!
    n_sub = len(sub_day_arr)
    dummy_adv = np.full((n_sub, len(hl_syms)), 1e12)
    dummy_vol = np.zeros((n_sub, len(hl_syms)))
    hl_1h_oracle = event_ledger_oracle.run_decimal_ledger(
        positions=pos_hl,
        perp_close=sub_perp_close,
        funding_events=hl_fund_1h,
        vec_net=res_hl["net"],
        leg_fee_bps={"perp": 4.5},
        half_spread_bps_per_leg={"perp": emp_imp_median_half_bps},
        latency_bps_per_leg={"perp": 1.0},
        adv_usd=dummy_adv,
        vol_daily=dummy_vol,
        impact_coefficient=0.0,
        fallback_impact_bps=0.0,
    )

    return {
        "available": True,
        "empirical_l1_and_impact_quotes": {
            "data_nature": (
                "point_in_time_empirical_top_of_book_snapshot (l2Book + metaAndAssetCtxs impactPxs); "
                "NOT historical L2 tick replay — historical 1h series is fundingHistory below"
            ),
            "n_overlapping_coins": int(hl_quotes.height),
            "median_l1_half_spread_bps": round(emp_l1_median_half_bps, 4),
            "p90_l1_half_spread_bps": round(float(np.percentile(l1_half, 90)), 4),
            "max_l1_half_spread_bps": round(float(np.max(l1_half)), 4),
            "median_impact_half_spread_bps": round(emp_imp_median_half_bps, 4),
            "p90_impact_half_spread_bps": round(float(np.percentile(imp_half, 90)), 4),
            "max_impact_half_spread_bps": round(float(np.max(imp_half)), 4),
            "per_symbol_impact_half_spread_bps": {
                r["symbol"]: round(float(r["impact_half_spread_bps"]), 4)
                for r in hl_quotes.iter_rows(named=True)
            },
            "no_double_counting_note": (
                "When pricing close-price books at Hyperliquid's empirical impactPxs half-spread, "
                "impact_half_spread_bps replaces the 3.0 bps floor once and is never added twice."
            ),
            "hypotheses_repriced_at_hl_vip0_and_empirical_impact_spread": hl_repriced,
        },
        "historical_1h_funding_carry_cross_check": {
            "data_nature": "historical_1h_series (paginated Hyperliquid fundingHistory, 24 settlements/day)",
            "coins": hl_syms,
            "n_hourly_events": int(hl_fund_1h.height),
            "window_days": int(n_sub),
            "locked_oos_days_in_window": int(np.sum(oos_mask)),
            "per_coin_daily_funding_comparison": per_coin_funding_cmp,
            "h1_carry_on_10coin_overlap": {
                "params": h1_params,
                "hyperliquid_1h": {
                    "full_window_sharpe": round(sharpe_ratio(res_hl["net"], PERIODS), 4),
                    "full_window_cum_net": round(float(np.nansum(res_hl["net"])), 6),
                    "full_window_cum_carry": round(float(res_hl["cum_carry"]), 6),
                    "locked_oos_sharpe": round(sharpe_ratio(res_hl["net"][oos_mask], PERIODS), 4),
                    "locked_oos_cum_net": round(float(np.nansum(res_hl["net"][oos_mask])), 6),
                    "locked_oos_break_even_multiple": round(
                        float(np.nansum(res_hl["gross"][oos_mask]) / max(1e-12, np.nansum(res_hl["cost"][oos_mask]))),
                        4,
                    ),
                },
                "binance_8h_same_10coins": {
                    "full_window_sharpe": round(sharpe_ratio(res_bn["net"], PERIODS), 4),
                    "full_window_cum_net": round(float(np.nansum(res_bn["net"])), 6),
                    "full_window_cum_carry": round(float(res_bn["cum_carry"]), 6),
                    "locked_oos_sharpe": round(sharpe_ratio(res_bn["net"][oos_mask], PERIODS), 4),
                    "locked_oos_cum_net": round(float(np.nansum(res_bn["net"][oos_mask])), 6),
                    "locked_oos_break_even_multiple": round(
                        float(np.nansum(res_bn["gross"][oos_mask]) / max(1e-12, np.nansum(res_bn["cost"][oos_mask]))),
                        4,
                    ),
                },
            },
            "decimal_1h_event_ledger_parity": hl_1h_oracle,
        },
    }


def main() -> int:
    if not G5.exists():
        print(
            "REFUSING: artifacts/g5_statistical_validity.json missing; there are no "
            "sealed winners to price",
            file=sys.stderr,
        )
        return 2
    perp_4h_path = DATA / "perp_4h.parquet"
    if not perp_4h_path.exists():
        print(
            "REFUSING: perp_4h.parquet missing; the spread band cannot be measured",
            file=sys.stderr,
        )
        return 2

    g5 = json.loads(G5.read_text())
    panel_core = run_grid.build_panel("CORE_19")
    panel_surv = run_grid.build_panel("SURVIVORSHIP_23")
    panels = {"CORE_19": panel_core, "SURVIVORSHIP_23": panel_surv}

    perp_1d_df = pl.read_parquet(DATA / "perp_1d.parquet").filter(pl.col("volume") > 0.0)
    matrices_by_u: dict[str, dict] = {}
    for u_key, p in panels.items():
        syms = [c for c in p.perp_close.columns if c != "day"]
        matrices_by_u[u_key] = {
            "adv": market.as_matrix(
                market.adv_panel(perp_1d_df.filter(pl.col("symbol").is_in(syms)), p.perp_close["day"]),
                syms,
            ),
            "vol": market.as_matrix(market.volatility_panel(p.perp_returns), syms),
        }

    n_days = len(panel_core.days)
    split = int(g5.get("methodology", {}).get("train_days", int(n_days * 0.7)))
    if not (0 < split < n_days):
        print("REFUSING: invalid train split day index for spread calibration", file=sys.stderr)
        return 2
    split_ts_ms = int(panel_core.days[split]) * loaders.DAY_MS
    perp_4h_train = (
        pl.read_parquet(perp_4h_path)
        .filter((pl.col("ts_ms") < split_ts_ms) & (pl.col("symbol").is_in(list(loaders.CORE_19))))
    )
    band = measure_band(perp_4h_train)
    band["calibration_window"] = "train_only"
    band["calibration_train_days"] = split
    band["calibration_cutoff_ts_ms"] = split_ts_ms
    if band["n_symbols"] == 0 or band["symbols_with_detectable_spread"] == 0:
        print("REFUSING: no symbol produced a positive spread estimate", file=sys.stderr)
        return 2

    results = []
    for entry in g5["hypotheses"]:
        h_name = entry["hypothesis"]
        u_key = "SURVIVORSHIP_23" if h_name in ("H1_G1", "H2_G1", "H3_MAKER") else "CORE_19"
        results.append(
            evaluate(
                h_name,
                entry["winner_params"],
                panels[u_key],
                band,
                matrices_by_u[u_key],
                entry,
                split=split,
            )
        )

    blockers = []
    for row in results:
        rec = row["reconciliation"]
        if not rec["flat_6bps_reproduces_lab_cost"]:
            blockers.append(
                f"{row['hypothesis']}: the model does not reproduce the G5 baseline cost"
            )
        if not rec["funding_days_aligned"]:
            blockers.append(
                f"{row['hypothesis']}: funding panel does not align with the book's days"
            )
        elif not rec["funding_cashflow_matches_strategy_carry"]:
            blockers.append(
                f"{row['hypothesis']}: funding cash flow disagrees with the strategy's carry leg"
            )

    funding_events_raw = pl.read_parquet(DATA / "funding.parquet")
    parity = _build_event_ledger_parity(
        g5["hypotheses"], panels, matrices_by_u, band, funding_events_raw
    )
    if not parity["all_pass_1bps_gate"]:
        blockers.append(
            f"event_ledger_parity failed <1 bps NAV gate (max={parity['max_terminal_nav_discrepancy_bps']} bps)"
        )

    hl_cross = _build_hyperliquid_cross_check(g5["hypotheses"], panels, matrices_by_u, split)
    if hl_cross.get("available") and not hl_cross["historical_1h_funding_carry_cross_check"]["decimal_1h_event_ledger_parity"]["passes_1bps_gate"]:
        blockers.append("Hyperliquid 1h Decimal event-ledger parity failed <1 bps gate")

    if blockers:
        for line in blockers:
            print(f"REFUSING: {line}", file=sys.stderr)
        return 2

    hl_ingested = bool(hl_cross.get("available"))
    mats_core = matrices_by_u["CORE_19"]
    payload = {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True
        ).stdout.strip(),
        "scope": {
            "gate": "G6 - realistic execution costs, Decimal accounting parity & Hyperliquid cross-check",
            "requirement_transcribed": (
                "apply each venue's VIP-0 fees, funding at 1h/8h, without double counting "
                "spread, expecting a positive net return at 2.0x fees, with <1 bps independent "
                "event-driven ledger parity"
            ),
            "evidence_file": "artifacts/g6_execution_tca.json",
            "capital_usd": cost_model.DEFAULT_CAPITAL_USD,
            "books_repriced": [row["hypothesis"] for row in results],
            "prior_cost_basis": (
                f"a flat {FLAT_BPS_BEFORE} bps per unit of turnover on taker grids and 8.90 bps "
                "calibrated pair-turn midpoint on H3_MAKER; each reconciliation block proves exact reproduction"
            ),
        },
        "venue_fees": {
            "basis": fees.BASIS,
            "source": fees.SOURCE,
            "applied_to_ingested_data": INGESTED_VENUE,
            "side": "taker for H1/H2/H3/H1_G1/H2_G1; calibrated FIFO maker+adverse-selection+leg-miss for H3_MAKER",
            "side_note": (
                "uncalibrated raw maker fills remain refused in fees.per_side_bps(..., side='maker'); "
                "H3_MAKER uses explicit FIFO partial fill (p_fill<1), adverse selection (1.5-3.0 bps), "
                "and forced emergency taker fallback (p_leg_miss=0.15-0.25)"
            ),
            "schedule": {
                name: {
                    "spot_maker_pct": (
                        None
                        if not fees.venue(name).available("spot")
                        else round(fees.venue(name).spot_maker * 100, 5)
                    ),
                    "spot_taker_pct": (
                        None
                        if not fees.venue(name).available("spot")
                        else round(fees.venue(name).spot_taker * 100, 5)
                    ),
                    "perp_maker_pct": (
                        None
                        if not fees.venue(name).available("perp")
                        else round(fees.venue(name).perp_maker * 100, 5)
                    ),
                    "perp_taker_pct": (
                        None
                        if not fees.venue(name).available("perp")
                        else round(fees.venue(name).perp_taker * 100, 5)
                    ),
                    "funding_hours": fees.venue(name).funding_hours,
                }
                for name in fees.venue_names()
            },
            "notes": fees.VENUE_NOTES,
            "charged_on": "notional value, not posted margin",
            "funding_cadence": {
                name: fees.funding_cadence(name, hyperliquid_ingested=hl_ingested)
                for name in fees.venue_names()
            },
        },
        "spread_band": band,
        "cost_model": {
            "components": list(pricing.ATTRITION_ORDER),
            "no_double_counting": (
                "OHLCV close-price branch binds: for taker orders, half-spread, latency slippage, "
                "and volatility impact are added once; for H3_MAKER passive fills, half-spread is "
                "NOT charged on passive fills (which pay adverse_selection_bps instead) and only "
                "the p_leg_miss forced-taker fallback crosses half-spread"
            ),
            "assumptions": {
                "latency_slippage_bps": cost_model.CostAssumptions().latency_slippage_bps,
                "impact_coefficient": cost_model.CostAssumptions().impact_coefficient,
                "capital_usd": cost_model.DEFAULT_CAPITAL_USD,
                "assumed_impact_bps_fallback": cost_model.CostAssumptions().assumed_impact_bps,
                "basis": cost_model.BASIS,
            },
            "impact_fallback_cells": int(
                np.sum(
                    ~(
                        np.isfinite(mats_core["adv"])
                        & (mats_core["adv"] > 0.0)
                        & np.isfinite(mats_core["vol"])
                    )
                )
            ),
            "stress_multiples": list(STRESS_MULTIPLES),
            "expectancy_gate_multiple": EXPECTANCY_MULTIPLE,
        },
        "market_state": {
            "adv_nan_fraction": round(float(np.mean(np.isnan(mats_core["adv"]))), 4),
            "adv_median_usd": round(float(np.nanmedian(mats_core["adv"])), 2),
            "vol_nan_fraction": round(float(np.mean(np.isnan(mats_core["vol"]))), 4),
            "vol_median_daily": round(float(np.nanmedian(mats_core["vol"])), 6),
        },
        "event_ledger_parity": parity,
        "hyperliquid_cross_check": hl_cross,
        "hypotheses": results,
        "methodology": {
            "periods_per_year": PERIODS,
            "verdict_rule": (
                "G6 passes for a hypothesis only if net expectancy per trade stays positive "
                "at 2.0x fees at BOTH ends of the spread band on both full sample and "
                "post-embargo locked_oos"
            ),
            "not_implemented": [
                "tick-level L3 HftBacktest order-book replay (H3_MAKER models calibrated analytic FIFO p_fill, adverse selection, and p_leg_miss bounds on daily closes)",
                "borrow cost on the spot leg (cash-funded long spot needs zero borrow, though margin-efficiency differs)",
            ],
        },
    }

    target = OUT / "g6_execution_tca.json"
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n")

    print(f"wrote {target.relative_to(REPO)}")
    print(
        f"band: floor {band['floor_half_spread_bps']} bps -> ceiling "
        f"{band['ceiling_half_spread_bps']} bps (x{band['width_multiple']}, "
        f"{band['n_symbols']} symbols)"
    )
    print(
        f"event_ledger_parity: all_pass={parity['all_pass_1bps_gate']} "
        f"max_discrepancy={parity['max_terminal_nav_discrepancy_bps']:.8f} bps"
    )
    print(RULES)
    for row in results:
        low, high = row["at_floor"], row["at_ceiling"]
        oos = row.get("locked_oos", {})
        print(
            f"{row['hypothesis']:8s}  G5 {row['g5_verdict']:6s}  G6 "
            f"{'PASS' if row['g6_pass'] else 'FAIL'}"
            f"  gross {row['book']['cum_gross']:+.4f}"
            f"  OOS_G6={'PASS' if oos.get('g6_pass') else 'FAIL'}"
        )
        print(
            f"     full BE {low['break_even_multiple']}x -> {high['break_even_multiple']}x"
            f"  | OOS BE {oos['at_floor']['break_even_multiple']}x -> {oos['at_ceiling']['break_even_multiple']}x"
        )
    print(RULES)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
