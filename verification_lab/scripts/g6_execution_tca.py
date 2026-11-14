"""G6 - realistic execution costs: re-price each winning book, then stress it.

The audit's G6 row asks for four things a flat bps assumption cannot answer:

* each venue's VIP-0 schedule actually applied, per leg;
* funding at its real cadence, as a cash flow rather than a turn cost;
* no double counting of spread;
* net expectancy still positive at 2.0x fees, the structural stress multiple.

The lab's earlier figures charged a flat 6.0 bps per unit of turnover on every
hypothesis. That number is H1's own base fee from the audit's section 14.2 table,
applied to books it was never derived for; it omits spread, latency and impact,
and it cannot express H3 paying two different schedules on two legs. This script
replaces it with an explicitly additive model.

The statistical verdicts in G5 were reached on the flat-6.0 book, so every
hypothesis is priced at both ends of a measured spread band rather than at a
point estimate. The band exists because the only spread signal available without
an L2 book is a high-low estimator: it reads tens of bps on a liquid pair whose
real quoted spread is a few bps, so it enters as the ceiling, with the audit's
own liquid-pair anchor as the floor. A verdict that holds at both ends does not
depend on which end is right. A verdict that flips inside the band is the
finding, and is reported as one.
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

from verification_lab.execution import cost_model, fees, market, pricing  # noqa: E402
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
# Verbatim from the audit: the structural stress ladder, and the level at which
# net expectancy must still be positive.
STRESS_MULTIPLES = (1.0, 1.5, 2.0, 3.0)
EXPECTANCY_MULTIPLE = 2.0
FLAT_BPS_BEFORE = 6.0
# The only venue whose prices and funding were ingested. All four normalized
# datasets are Binance Vision; the Hyperliquid leg of the promised cross-check
# was never fetched.
INGESTED_VENUE = "binance"
FUNDING_HOURS_MEASURED = 8
RULES = "-" * 100


def spec_for(name: str) -> dict:
    """The legs and VIP-0 taker rates one hypothesis actually trades.

    Keyed by leg name rather than venue, because H3 puts two schedules on one
    exchange: 10 bps on its spot leg and 5 bps on its perp leg. Spot and perp
    carry half the pair weight each, since H3's weight is expressed per pair.
    """
    perp_bps = fees.venue(INGESTED_VENUE).taker_bps("perp")
    if name in ("H1", "H2"):
        return {
            "legs": [cost_model.Leg("perp", INGESTED_VENUE, 1.0)],
            "leg_fee_bps": {"perp": perp_bps},
            "order": "one perp leg at full book weight",
        }
    if name == "H3":
        return {
            "legs": [
                cost_model.Leg("spot", INGESTED_VENUE, 0.5),
                cost_model.Leg("perp", INGESTED_VENUE, 0.5),
            ],
            "leg_fee_bps": {
                "spot": fees.venue(INGESTED_VENUE).taker_bps("spot"),
                "perp": perp_bps,
            },
            "order": "two legs at half pair weight each: spot long, perp short",
        }
    raise KeyError(f"no execution spec for {name!r}")


def rebuild(name: str, params: dict, panel: run_grid.Panel) -> dict:
    """Rebuild the winning book exactly as G5 scored it, and nothing else.

    Nothing here searches: the parameters come from the sealed registry, so the
    book being priced is the book the gates judgement was made on.
    """
    if name == "H1":
        positions = h1.build_positions(panel.funding, **params)
        result = h1.backtest(positions, panel.perp_returns, panel.funding)
        perp_leg = positions
    elif name == "H2":
        positions = h2.build_positions(panel.perp_close, **params)
        result = h2.evaluate(positions, panel.perp_returns, panel.funding)
        perp_leg = positions
    elif name == "H3":
        positions = h3.build_positions(panel.basis, panel.funding, **params)
        result = h3.evaluate(
            positions, panel.perp_returns, panel.spot_returns, panel.funding
        )
        symbols = [c for c in positions.columns if c != "day"]
        # The carry pair holds the perp leg short at half the pair weight.
        # Passing the pair weight instead would flip the sign of the only cash
        # flow the strategy exists to collect.
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
    # The floor is the audit's half-spread alone. Latency slippage is charged as
    # its own component in the cost model, so folding it into the floor as well
    # would charge it twice -- the double counting the gate exists to forbid.
    band = spread_mod.band(
        values,
        floor_half_spread_bps=spread_mod.AUDIT_LIQUID_HALF_SPREAD_BPS,
    )
    band["bar_minutes"] = 240
    band["per_symbol_full_spread_bps"] = dict(sorted(values.items()))
    band["symbols_with_detectable_spread"] = sum(
        1 for row in estimates.values() if row["detectable"]
    )
    med_negative = [row["negative_fraction"] for row in estimates.values()
                    if row["negative_fraction"] is not None]
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
    """Per-day fee charge with every other component switched off.

    Spread, latency and impact are zeroed rather than estimated: this isolates
    the fee schedule so a rate comparison across venues is not contaminated by
    Binance-derived liquidity statistics.
    """
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
    """The same book charged each venue's published VIP-0 taker schedule.

    Fee only, and said so: spread and impact come from Binance bars, so a book
    "moved" to another venue is compared on the fee component alone.
    """
    rows = {}
    for venue_name in fees.venue_names():
        legs = (
            [
                cost_model.Leg("spot", venue_name, 0.5),
                cost_model.Leg("perp", venue_name, 0.5),
            ]
            if name == "H3"
            else [cost_model.Leg("perp", venue_name, 1.0)]
        )
        if not all(fees.venue(venue_name).available(leg.leg) for leg in legs):
            rows[venue_name] = {"priced": False, "reason": "venue publishes no such market"}
            continue
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
    """The two separate things "flips inside the band" can mean.

    The 2.0x gate is the audit's approval criterion, so it decides `g6_pass`.
    The sign of cumulative net at 1.0x is a different fact: a book whose edge is
    positive at the floor and negative at the ceiling has failed earlier than the
    gate that caught it, and reporting only the gate flag would let the two look
    identical. Both are returned so a report never has to pick one.
    """
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
        # Per-episode figures divide by however many contiguous runs the book
        # held, so the denominator travels with them: a book that enters once
        # and never exits has an "expectancy per trade" of one number.
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

    # The new model must be a drop-in for the flat 6.0 bps the gates were scored
    # on: same book, same traded notional, same cash. Otherwise the G5 verdicts
    # describe a different strategy than the one priced here.
    #
    # The flat rate is per unit of *portfolio* notional, while a leg only trades
    # its own notional_scale share of the book, so the equivalent leg rate is
    # 6.0/scale. H3 is why this matters: its two half-weight legs at 6.0 each
    # charge 6.0 bps on |dw|, while its own `evaluate` charges
    # turnover = |dw| * 2.0 at 6.0 bps, i.e. 12.0 bps per rebalance. Driving the
    # legs at 12.0 reproduces that, with neither side shifted to fit.
    probe_rates = {leg.leg: FLAT_BPS_BEFORE / leg.notional_scale for leg in legs}
    probe = fee_component(weights, legs, probe_rates)
    baseline = cost_model.flat_baseline_cost(result["turnover"], FLAT_BPS_BEFORE)
    reconciles = bool(np.allclose(probe, baseline, rtol=0.0, atol=1e-12))

    funding = market.funding_cashflow(panel.funding, run["perp_leg"])
    # The cash flow is recomputed independently of the strategy's own carry leg,
    # so the two only agree if they cover the same days in the same order. Since
    # the funding cashflow joins on the book's own day column, agreement of the
    # day vectors is what makes the comparison below meaningful at all.
    aligned = bool(
        list(run["perp_leg"]["day"]) == list(panel.funding["day"])
    )
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
        priced = pricing.price_book(
            gross,
            weights,
            positions,
            legs=legs,
            leg_fee_bps=spec["leg_fee_bps"],
            half_spread_bps_value=level,
            adv_usd=matrices["adv"],
            vol_daily=matrices["vol"],
            assumptions=assumptions,
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
        "winner_params": params,
        "winner_source": "artifacts/g5_statistical_validity.json",
        "g5_verdict": g5_entry["verdict"],
        "execution_spec": spec,
        "book": {
            "days": int(weights.shape[0]),
            "symbols": len(symbols),
            "cum_gross": round(float(np.nansum(gross)), 6),
            "lab_cum_cost_flat_6bps": round(float(np.nansum(baseline)), 6),
            "traded_notional_turns": round(float(np.nansum(trades)), 6),
            "mean_turnover_per_day": round(float(np.nanmean(result["turnover"])), 6),
            "flat_day_fraction": round(float(np.mean(trades <= 0.0)), 4),
            "mean_gross_exposure": round(float(np.nanmean(exposure)), 4),
            "max_gross_exposure": round(float(np.nanmax(exposure)), 4),
        },
        "reconciliation": {
            "flat_6bps_reproduces_lab_cost": reconciles,
            "probe_leg_fee_bps": probe_rates,
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
    panel = run_grid.build_panel()
    symbols = [c for c in panel.perp_close.columns if c != "day"]
    matrices = {
        "adv": market.as_matrix(
            market.adv_panel(pl.read_parquet(DATA / "perp_1d.parquet"), panel.perp_close["day"]),
            symbols,
        ),
        "vol": market.as_matrix(market.volatility_panel(panel.perp_returns), symbols),
    }
    n_days = len(panel.days)
    if matrices["adv"].shape != (n_days, len(symbols)):
        print("REFUSING: ADV panel is not aligned to the price panel", file=sys.stderr)
        return 2
    split = int(g5.get("methodology", {}).get("train_days", int(n_days * 0.7)))
    if not (0 < split < n_days):
        print("REFUSING: invalid train split day index for spread calibration", file=sys.stderr)
        return 2
    split_ts_ms = int(panel.days[split]) * loaders.DAY_MS
    perp_4h_train = pl.read_parquet(perp_4h_path).filter(pl.col("ts_ms") < split_ts_ms)
    band = measure_band(perp_4h_train)
    band["calibration_window"] = "train_only"
    band["calibration_train_days"] = split
    band["calibration_cutoff_ts_ms"] = split_ts_ms
    if band["n_symbols"] == 0 or band["symbols_with_detectable_spread"] == 0:
        print("REFUSING: no symbol produced a positive spread estimate", file=sys.stderr)
        return 2

    results = [
        evaluate(
            entry["hypothesis"],
            entry["winner_params"],
            panel,
            band,
            matrices,
            entry,
            split=split,
        )
        for entry in g5["hypotheses"]
    ]

    blockers = []
    for row in results:
        rec = row["reconciliation"]
        if not rec["flat_6bps_reproduces_lab_cost"]:
            blockers.append(
                f"{row['hypothesis']}: the model does not reproduce the flat-6bps lab cost"
            )
        if not rec["funding_days_aligned"]:
            blockers.append(
                f"{row['hypothesis']}: funding panel does not align with the book's days"
            )
        elif not rec["funding_cashflow_matches_strategy_carry"]:
            blockers.append(
                f"{row['hypothesis']}: funding cash flow disagrees with the strategy's carry leg"
            )
    if blockers:
        for line in blockers:
            print(f"REFUSING: {line}", file=sys.stderr)
        return 2

    payload = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "commit": subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True
        ).stdout.strip(),
        "scope": {
            "gate": "G6 - realistic execution costs",
            "requirement_transcribed": (
                "apply each venue's VIP-0 fees, funding at 1h/8h, without double counting "
                "spread, expecting a positive net return at 2.0x fees"
            ),
            "evidence_file": "artifacts/g6_execution_tca.json",
            "capital_usd": cost_model.DEFAULT_CAPITAL_USD,
            "books_repriced": [row["hypothesis"] for row in results],
            "prior_cost_basis": (
                f"a flat {FLAT_BPS_BEFORE} bps per unit of turnover on every hypothesis; each "
                "reconciliation block shows the new model reproducing that charge exactly when "
                "driven by fees alone"
            ),
        },
        "venue_fees": {
            "basis": fees.BASIS,
            "source": fees.SOURCE,
            "applied_to_ingested_data": INGESTED_VENUE,
            "side": "taker",
            "side_note": (
                "maker fills are refused rather than defaulted: this lab scores books on "
                "daily closes with no queue position, so a maker assumption has nothing "
                "behind it"
            ),
            "schedule": {
                name: {
                    "spot_taker_pct": (
                        None
                        if not fees.venue(name).available("spot")
                        else round(fees.venue(name).spot_taker * 100, 5)
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
            "discounts_not_applied": (
                "BNB 0.018/0.045 on perps and 0.075% spot, Bybit MNT 0.075% spot, Bybit "
                "Innovation Zone 0.200/0.200: the base VIP-0 rate is what a client holding "
                "no exchange token pays, and quoting the discounted tier would flatter "
                "every hypothesis in the same direction"
            ),
            "charged_on": "notional value, not posted margin",
            "funding_cadence": {
                name: fees.funding_cadence(name) for name in fees.venue_names()
            },
        },
        "spread_band": band,
        "cost_model": {
            "components": list(pricing.ATTRITION_ORDER),
            "no_double_counting": (
                "the audit's rule has two branches and the close-price branch binds here: "
                "there is no book and no fill, so half spread, latency slippage and "
                "volatility-dependent impact are added explicitly to the crossed price "
                "rather than assumed to be inside it"
            ),
            "notional_convention": (
                "traded notional is the signed difference |w_t - w_t-1| per leg, which is "
                "already per side, so a round trip appears as two units and is charged "
                "twice without the model doubling anything; H3's two legs each carry half "
                "the pair weight, so its two charges sum to one unit of pair notional per "
                "rebalance and its baseline is 12.0 bps per rebalance, not 6.0"
            ),
            "assumptions": {
                "latency_slippage_bps": cost_model.CostAssumptions().latency_slippage_bps,
                "impact_coefficient": cost_model.CostAssumptions().impact_coefficient,
                "capital_usd": cost_model.DEFAULT_CAPITAL_USD,
                "assumed_impact_bps_fallback": cost_model.CostAssumptions().assumed_impact_bps,
                "basis": cost_model.BASIS,
                "note": (
                    "the impact coefficient is the square-root law's slope; 1.0 is the "
                    "conservative upper end quoted for crypto pairs, and the 2.0x/3.0x rungs "
                    "are what test the answer against it being wrong"
                ),
            },
            "impact_fallback_cells": int(
                np.sum(
                    ~(
                        np.isfinite(matrices["adv"])
                        & (matrices["adv"] > 0.0)
                        & np.isfinite(matrices["vol"])
                    )
                )
            ),
            "stress_multiples": list(STRESS_MULTIPLES),
            "expectancy_gate_multiple": EXPECTANCY_MULTIPLE,
        },
        "market_state": {
            "adv_nan_fraction": round(float(np.mean(np.isnan(matrices["adv"]))), 4),
            "adv_median_usd": round(float(np.nanmedian(matrices["adv"])), 2),
            "vol_nan_fraction": round(float(np.mean(np.isnan(matrices["vol"]))), 4),
            "vol_median_daily": round(float(np.nanmedian(matrices["vol"])), 6),
            "note": (
                "both statistics are trailing and shifted one day, so an impact estimate "
                "never reads the volume or volatility of the day it prices"
            ),
        },
        "hypotheses": results,
        "methodology": {
            "periods_per_year": PERIODS,
            "verdict_rule": (
                "G6 passes for a hypothesis only if net expectancy per trade stays positive "
                "at 2.0x fees at BOTH ends of the spread band on both full sample and "
                "post-embargo locked_oos; the audit's ladder does not stop at 2.0x, so the "
                "full path is reported too"
            ),
            "superseded_basis": (
                "G5's verdicts were computed on the flat-6bps book. G6's ladder starts at the "
                "realistic schedule, so a hypothesis can pass one gate and fail the other; "
                "where that happens both verdicts are reported and neither is overridden"
            ),
            "not_implemented": [
                "FIFO L2 queue-position calibration against HftBacktest (the audit's HIGH (P1) "
                "blocker: the paper simulator has never been calibrated)",
                "accounting reconciliation against NautilusTrader v2.0.0rc9 trade by trade, "
                "and the <1 bps day-30 promotion criterion that depends on it",
                "Hyperliquid 1h funding: all four normalized datasets are Binance Vision, so "
                "the hourly cadence is transcribed and compared but not simulated; the planned "
                "Binance + Hyperliquid cross-check was not realised",
                "per-symbol rather than single-value half spread: a 24 bps half spread is not a "
                "credible quote for a major pair, so the estimate is carried as an upper bound "
                "and the band width is reported in place of a point estimate",
                "cross-venue spread and impact: spread and volatility come from Binance bars, "
                "so the venue comparison covers fees only",
                "operation cost allocation (founder time under 10 h/week is a constraint in the "
                "audit, not a per-trade charge) and borrow cost on the spot leg",
                "regime-conditional cost stress: costs are stressed across the whole sample, "
                "not per market regime",
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
    print(RULES)
    for row in results:
        low, high = row["at_floor"], row["at_ceiling"]
        print(
            f"{row['hypothesis']}  G5 {row['g5_verdict']:6s}  G6 "
            f"{'PASS' if row['g6_pass'] else 'FAIL'}"
            f"  gross {row['book']['cum_gross']:+.4f}"
            f"  funding {row['reconciliation']['funding_cum']:+.4f}"
        )
        print(
            f"     cost {low['cum_cost']:.4f} -> {high['cum_cost']:.4f}"
            f"  ({low['effective_bps_per_turn']} -> {high['effective_bps_per_turn']} bps/turn)"
            f"  net {low['cum_net']:+.4f} -> {high['cum_net']:+.4f}"
            f"  BE {low['break_even_multiple']}x -> {high['break_even_multiple']}x"
        )
        if row["band"]["verdict_flips_inside_band"]:
            print("     the 2.0x per-trade expectancy verdict flips inside the band")
        if row["band"]["net_sign_flips_inside_band"]:
            print(
                "     cumulative net changes sign inside the band at the realistic "
                "schedule (1.0x)"
            )
    print(RULES)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
