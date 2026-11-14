"""The G6 execution model's arithmetic, exercised against constructed answers.

The statistical gates are tested elsewhere; what is at risk here is arithmetic
that can be wrong, plausible, and green at the same time. A cost model that
charges a round trip once halves every cost and passes every book. An impact
term that prices an unmeasured symbol at zero makes illiquidity free. A venue
comparison that silently omits the spot leg reports a carry pair as a single
perp trade. None of those raise an exception, so each is pinned to a number
worked out by hand.

The reconciliation tests are the load-bearing ones. G5's verdicts were reached
on a flat 6.0 bps book, so if the new model cannot reproduce that charge exactly
when driven by fees alone, the two reports describe different strategies and
neither verdict applies to the other.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import polars as pl
import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load(name: str):
    """Import a script module by path; the scripts are not a package."""
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


g6 = _load("g6_execution_tca")

cost_model = g6.cost_model
market = g6.market
pricing = g6.pricing
spread_mod = g6.spread_mod
fees = g6.fees


# --- traded notional -------------------------------------------------------


def test_a_sign_flip_crosses_a_full_unit_not_zero():
    """+0.5 to -0.5 reverses the position; |Δ|w|| would report no trade at all."""
    weights = np.array([[0.5], [-0.5]])
    traded = cost_model.traded_notional(weights, 1.0)
    assert traded[1, 0] == pytest.approx(1.0)


def test_entry_from_flat_is_charged_once_and_at_full_weight():
    weights = np.array([[0.0], [1.0], [1.0]])
    traded = cost_model.traded_notional(weights, 1.0)
    assert traded[:, 0].tolist() == pytest.approx([0.0, 1.0, 0.0])


def test_notional_scale_halves_a_two_leg_book():
    """H3's legs carry half the pair weight, so each crosses half the notional."""
    weights = np.array([[0.0], [1.0]])
    assert cost_model.traded_notional(weights, 0.5)[1, 0] == pytest.approx(0.5)


def test_stressed_turnover_sums_every_leg():
    """Two half-weight legs must total one unit, not half a unit and not two."""
    weights = np.array([[0.0], [1.0]])
    legs = [cost_model.Leg("spot", "binance", 0.5), cost_model.Leg("perp", "binance", 0.5)]
    assert cost_model.stressed_turnover(weights, legs)[1] == pytest.approx(1.0)


# --- fees ------------------------------------------------------------------


def test_one_leg_at_ten_bps_on_a_unit_trade_costs_ten_bps():
    weights = np.array([[0.0], [1.0]])
    cost = cost_model.daily_cost(
        weights,
        legs=[cost_model.Leg("perp", "binance", 1.0)],
        leg_fee_bps={"perp": 10.0},
        half_spread_bps_value=0.0,
        adv_usd=np.ones((2, 1)),
        vol_daily=np.zeros((2, 1)),
        assumptions=cost_model.CostAssumptions(
            latency_slippage_bps=0.0, impact_coefficient=0.0, assumed_impact_bps=0.0
        ),
    )
    assert float(np.nansum(cost["components"]["fee"])) == pytest.approx(10.0 / 1e4)


def test_leg_fees_are_keyed_by_leg_so_two_schedules_can_coexist():
    """H3 pays spot and perp rates on the same venue in the same rebalance."""
    weights = np.array([[1.0], [1.0]])
    cost = cost_model.daily_cost(
        weights,
        legs=[cost_model.Leg("spot", "binance", 0.5), cost_model.Leg("perp", "binance", 0.5)],
        leg_fee_bps={"spot": 10.0, "perp": 5.0},
        half_spread_bps_value=0.0,
        adv_usd=np.ones((2, 1)),
        vol_daily=np.zeros((2, 1)),
        assumptions=cost_model.CostAssumptions(
            latency_slippage_bps=0.0, impact_coefficient=0.0, assumed_impact_bps=0.0
        ),
    )
    # First rebalance trades 0.5 up each leg: 0.5*10 + 0.5*5 = 7.5 bps of pair notional.
    assert float(cost["total"][0]) == pytest.approx(7.5 / 1e4)


def test_maker_fills_are_refused_rather_than_defaulted():
    """No queue position exists in a close-price lab, so a maker rate has nothing behind it."""
    with pytest.raises(Exception):
        fees.per_side_bps([cost_model.Leg("perp", "binance", 1.0)], "binance", side="maker")


def test_bybit_perp_taker_is_dearer_than_binance_as_the_audit_states():
    binance = fees.venue("binance").taker_bps("perp")
    bybit = fees.venue("bybit").taker_bps("perp")
    assert bybit - binance == pytest.approx(0.5, abs=1e-9)


def test_hyperliquid_funding_is_hourly_and_everyone_else_eight_hourly():
    assert fees.venue("hyperliquid").funding_hours == 1
    assert all(
        fees.venue(name).funding_hours == 8
        for name in fees.venue_names()
        if name != "hyperliquid"
    )


# --- impact ----------------------------------------------------------------


def test_unmeasured_participation_falls_back_rather_than_pricing_illiquidity_free():
    """NaN ADV means the fraction is unknown, and unknown must not become zero cost."""
    part = np.array([np.nan, 0.001])
    bps = cost_model.impact_bps(
        part, np.array([0.02, 0.02]), coefficient=1.0, fallback_bps=2.0
    )
    assert bps[0] == pytest.approx(2.0)
    assert bps[1] > 0.0


def test_impact_rises_with_participation_and_with_volatility():
    base = cost_model.impact_bps(
        np.array([0.0001]), np.array([0.02]), coefficient=1.0, fallback_bps=2.0
    )[0]
    bigger = cost_model.impact_bps(
        np.array([0.0004]), np.array([0.02]), coefficient=1.0, fallback_bps=2.0
    )[0]
    faster = cost_model.impact_bps(
        np.array([0.0001]), np.array([0.04]), coefficient=1.0, fallback_bps=2.0
    )[0]
    assert bigger > base
    assert faster > base


def test_zero_participation_is_free():
    """A day on which nothing is traded must not be charged an impact term."""
    bps = cost_model.impact_bps(
        np.array([0.0]), np.array([0.02]), coefficient=1.0, fallback_bps=2.0
    )
    assert bps[0] == pytest.approx(0.0)


# --- the four components ---------------------------------------------------


def test_components_sum_to_the_total():
    weights = np.array([[0.0], [1.0], [0.0], [-1.0]])
    cost = cost_model.daily_cost(
        weights,
        legs=[cost_model.Leg("perp", "binance", 1.0)],
        leg_fee_bps={"perp": 5.0},
        half_spread_bps_value=4.0,
        adv_usd=np.full((4, 1), 1e8),
        vol_daily=np.full((4, 1), 0.03),
        assumptions=cost_model.CostAssumptions(),
    )
    parts = sum(float(np.nansum(v)) for v in cost["components"].values())
    assert parts == pytest.approx(float(np.nansum(cost["total"])), rel=1e-12)


def test_a_flat_book_costs_nothing():
    cost = cost_model.daily_cost(
        np.zeros((5, 2)),
        legs=[cost_model.Leg("perp", "binance", 1.0)],
        leg_fee_bps={"perp": 5.0},
        half_spread_bps_value=4.0,
        adv_usd=np.full((5, 2), 1e8),
        vol_daily=np.full((5, 2), 0.03),
        assumptions=cost_model.CostAssumptions(),
    )
    assert float(np.nansum(cost["total"])) == pytest.approx(0.0)


# --- reconciliation with the flat basis G5 scored --------------------------


def test_probe_rates_scale_by_notional_so_one_leg_and_two_legs_reconcile():
    """The probe must reproduce the charge G5 actually made, not some other one.

    The flat rate was per unit of *book* turnover, and a leg trades only its own
    `notional_scale` share of the book, so the equivalent leg rate is 6.0/scale.
    For one full leg that reproduces 6.0 bps on |dw| directly.

    A pair is the case worth pinning, because the two conventions differ there.
    H3's own `evaluate` sums |dw| and multiplies by 2 to model two legs, then
    charges a flat 6.0 bps: an effective 12.0 bps per unit of pair turnover, when
    charging each half-leg 6.0 bps of its own traded notional would come to 6.0.
    The old lab's number is the ×2 one, so reproducing it is what a drop-in
    requires; the expected value here is deliberately 2*|dw| and not |dw|.
    Whether ×2 is the right way to price two legs is a separate question, and G6
    answers it by charging each leg its own venue schedule instead.
    """
    weights = np.array([[0.0], [1.0], [1.0]])
    one_leg = [cost_model.Leg("perp", "binance", 1.0)]
    pair = [cost_model.Leg("spot", "binance", 0.5), cost_model.Leg("perp", "binance", 0.5)]

    for legs, lab_multiple in ((one_leg, 1.0), (pair, 2.0)):
        turnover = cost_model.stressed_turnover(weights, legs)
        baseline = cost_model.flat_baseline_cost(turnover * lab_multiple, g6.FLAT_BPS_BEFORE)
        probe = g6.fee_component(
            weights,
            legs,
            {leg.leg: g6.FLAT_BPS_BEFORE / leg.notional_scale for leg in legs},
        )
        assert np.allclose(probe, baseline, rtol=0.0, atol=1e-12), legs

    # Both leg sets trade the same |dw| in portfolio units; the pair pays more
    # only because the old lab billed it twice, not because it traded twice.
    assert float(np.nansum(cost_model.stressed_turnover(weights, one_leg))) == pytest.approx(
        float(np.nansum(cost_model.stressed_turnover(weights, pair)))
    )


def test_probe_rates_differ_per_leg_configuration():
    """One full leg probes at 6.0 bps; two half legs probe at 12.0 each."""
    one = {leg.leg: g6.FLAT_BPS_BEFORE / leg.notional_scale for leg in g6.spec_for("H1")["legs"]}
    two = {leg.leg: g6.FLAT_BPS_BEFORE / leg.notional_scale for leg in g6.spec_for("H3")["legs"]}
    assert one == {"perp": pytest.approx(6.0)}
    assert two == {"spot": pytest.approx(12.0), "perp": pytest.approx(12.0)}


def test_fee_component_is_fee_only():
    """A venue comparison must not be polluted by spread, latency or impact."""
    weights = np.array([[0.0], [1.0]])
    legs = [cost_model.Leg("perp", "binance", 1.0)]
    charged = g6.fee_component(weights, legs, {"perp": 5.0})
    assert float(np.nansum(charged)) == pytest.approx(5.0 / 1e4)


# --- funding ---------------------------------------------------------------


def test_long_perp_pays_positive_funding():
    days = pl.Series("day", [1, 2])
    positions = pl.DataFrame({"day": days, "BTC": [1.0, 1.0]})
    funding = pl.DataFrame({"day": days, "BTC": [0.001, 0.001]})
    cash = market.funding_cashflow(funding, positions)
    assert np.allclose(cash, [-0.001, -0.001])


def test_short_perp_collects_positive_funding():
    days = pl.Series("day", [1, 2])
    positions = pl.DataFrame({"day": days, "BTC": [-0.5, -0.5]})
    funding = pl.DataFrame({"day": days, "BTC": [0.001, 0.001]})
    cash = market.funding_cashflow(funding, positions)
    assert np.allclose(cash, [0.0005, 0.0005])


def test_funding_does_not_square_the_position():
    """A same-name join would read the weight twice and price -w*w instead of -w*f."""
    days = pl.Series("day", [1])
    positions = pl.DataFrame({"day": days, "BTC": [2.0]})
    funding = pl.DataFrame({"day": days, "BTC": [0.5]})
    cash = market.funding_cashflow(funding, positions)
    assert cash[0] == pytest.approx(-1.0)


def test_a_missing_funding_day_raises_instead_of_being_priced_at_zero():
    """A left join keeps every book day, so a gap shows up as a null, not a short row."""
    positions = pl.DataFrame({"day": pl.Series("day", [1, 2, 3]), "BTC": [1.0, 1.0, 1.0]})
    funding = pl.DataFrame({"day": pl.Series("day", [1]), "BTC": [0.001]})
    with pytest.raises(ValueError, match="no funding observation"):
        market.funding_cashflow(funding, positions)


def test_a_flat_book_needs_no_funding_rate():
    """No position means no cash flow, so a missing rate on a flat day is not an error."""
    positions = pl.DataFrame({"day": pl.Series("day", [1, 2]), "BTC": [1.0, 0.0]})
    funding = pl.DataFrame({"day": pl.Series("day", [1]), "BTC": [0.001]})
    cash = market.funding_cashflow(funding, positions)
    assert np.allclose(cash, [-0.001, 0.0])


def test_funding_is_a_cash_flow_not_a_turn_cost():
    """A book that holds still forever is charged nothing per turn, yet accrues funding."""
    days = pl.Series("day", [1, 2, 3])
    positions = pl.DataFrame({"day": days, "BTC": [1.0, 1.0, 1.0]})
    funding = pl.DataFrame({"day": days, "BTC": [0.001, 0.001, 0.001]})
    cash = market.funding_cashflow(funding, positions)
    traded = cost_model.stressed_turnover(
        positions.select(["BTC"]).to_numpy(), [cost_model.Leg("perp", "binance", 1.0)]
    )
    assert float(np.nansum(traded)) == pytest.approx(1.0)
    assert float(np.nansum(cash)) == pytest.approx(-0.003)


# --- spread band -----------------------------------------------------------


def test_band_never_puts_the_ceiling_below_the_floor():
    """A noisy estimator reading below the audit anchor must not widen the band downward."""
    band = spread_mod.band({"A": 0.5, "B": 1.0}, floor_half_spread_bps=4.0)
    assert band["ceiling_half_spread_bps"] == pytest.approx(4.0)
    assert band["width_multiple"] == pytest.approx(1.0)


def test_band_ceiling_is_half_the_median_full_spread():
    """A reported spread is round-trip; crossing to one side costs half of it."""
    band = spread_mod.band({"A": 20.0, "B": 40.0, "C": 60.0}, floor_half_spread_bps=4.0)
    assert band["median_full_spread_bps"] == pytest.approx(40.0)
    assert band["ceiling_half_spread_bps"] == pytest.approx(20.0)
    assert band["floor_half_spread_bps"] == pytest.approx(4.0)
    assert band["width_multiple"] == pytest.approx(5.0)


def test_band_ignores_symbols_without_an_estimate():
    band = spread_mod.band({"A": 20.0, "B": None}, floor_half_spread_bps=4.0)
    assert band["n_symbols"] == 1
    assert band["median_full_spread_bps"] == pytest.approx(20.0)


def test_band_with_no_estimates_collapses_to_the_floor():
    band = spread_mod.band({}, floor_half_spread_bps=4.0)
    assert band["n_symbols"] == 0
    assert band["ceiling_half_spread_bps"] == pytest.approx(4.0)


def test_summarise_keeps_the_sign_of_a_negative_median_and_clamps_bps_to_zero():
    """A bar series with no detectable spread clamps spread_bps to 0.0 while keeping signed bps^2."""
    out = spread_mod.summarise(np.array([-1e-8, -2e-8, 3e-8]))
    assert out["detectable"] is False
    assert out["spread_bps"] == pytest.approx(0.0)
    # -1e-8 in fraction^2 equals -1.0 in bps^2 (scaled by 1e8, not 1e4).
    assert out["signed_median_bps2"] == pytest.approx(-1.0)
    assert out["negative_fraction"] == pytest.approx(2 / 3, abs=1e-4)


def test_band_retains_zero_clamped_symbols_instead_of_biasing_cross_sectional_median():
    """Clamped 0.0-bps symbols must stay in the universe median rather than conditioning on >0."""
    band = spread_mod.band({"BTC": 0.0, "ETH": 0.0, "ALT": 40.0}, floor_half_spread_bps=3.0)
    assert band["n_symbols"] == 3
    assert band["median_full_spread_bps"] == pytest.approx(0.0)
    assert band["ceiling_half_spread_bps"] == pytest.approx(3.0)


# --- ladder and attrition --------------------------------------------------


def _book(gross_last: float = 1.0) -> "pricing.PricedBook":
    gross = np.zeros(10)
    gross[-1] = gross_last
    cost = np.full(10, 0.05)
    components = {
        "fee": np.full(10, 0.02),
        "half_spread": np.full(10, 0.01),
        "latency_slippage": np.full(10, 0.01),
        "volatility_impact": np.full(10, 0.01),
    }
    return pricing.PricedBook(gross=gross, cost=cost, components=components, days=10)


def test_ladder_net_falls_monotonically_with_the_multiple():
    positions = np.zeros((10, 1))
    positions[-1, 0] = 1.0
    rungs = pricing.ladder(_book(), positions)
    nets = [rungs[f"{m}x"]["cum_net"] for m in pricing.RUNG_MULTIPLES]
    assert nets == sorted(nets, reverse=True)
    assert all(a > b for a, b in zip(nets, nets[1:]))


def test_break_even_multiple_is_gross_over_base_cost():
    positions = np.zeros((10, 1))
    positions[-1, 0] = 1.0
    rungs = pricing.ladder(_book(gross_last=1.0), positions)
    # gross 1.0, base cost 0.5 -> break-even at 2.0x.
    assert rungs["1.0x"]["break_even_multiple"] == pytest.approx(2.0)


def test_attrition_is_cumulative_and_ends_at_the_full_model():
    rows = pricing.attrition(_book())
    assert [r["component"] for r in rows] == list(pricing.ATTRITION_ORDER)
    cums = [r["cum_cost"] for r in rows]
    assert cums == sorted(cums)
    assert cums[-1] == pytest.approx(0.5)


def test_attrition_names_the_component_that_flips_the_verdict():
    """Gross 0.45 against cumulative costs 0.2/0.3/0.4/0.5: only the last rung sinks it."""
    book = _book(gross_last=0.45)
    rows = pricing.attrition(book)
    assert [r["cum_net"] > 0.0 for r in rows] == [True, True, True, False]
    assert [r["flips_the_verdict"] for r in rows] == [False, False, False, True]


def test_attrition_names_only_the_first_failing_rung():
    """A book sunk by fees alone is not also "decided" by spread, latency and impact."""
    rows = pricing.attrition(_book(gross_last=0.1))
    assert [r["flips_the_verdict"] for r in rows] == [True, False, False, False]


def test_share_of_cost_reports_none_for_a_zero_charge():
    empty = pricing.PricedBook(
        gross=np.zeros(3),
        cost=np.zeros(3),
        components={name: np.zeros(3) for name in pricing.ATTRITION_ORDER},
        days=3,
    )
    assert set(pricing.share_of_cost(empty).values()) == {None}


def test_bps_per_turn_is_none_when_nothing_is_traded():
    book = _book()
    assert pricing.bps_per_turn(book, np.zeros(10)) is None


# --- the two flip flags ----------------------------------------------------


def _end(cum_net: float, expectancy_positive: bool) -> dict:
    return {
        "cum_net": cum_net,
        "net_expectancy_positive_at_2x": expectancy_positive,
    }


def test_gate_flip_and_sign_flip_are_reported_separately():
    """H2's case: net stays positive, only the 2.0x expectancy fails at the ceiling."""
    flags = g6.band_flags(_end(1.0, True), _end(0.5, False))
    assert flags["verdict_flips_inside_band"] is True
    assert flags["net_sign_flips_inside_band"] is False
    assert flags["gate_holds_at_both_ends"] is False


def test_a_book_that_goes_negative_flips_both_ways_when_the_gate_also_flips():
    flags = g6.band_flags(_end(0.7, True), _end(-0.2, False))
    assert flags["verdict_flips_inside_band"] is True
    assert flags["net_sign_flips_inside_band"] is True


def test_a_book_negative_at_both_ends_passes_neither_gate_and_does_not_flip():
    """H3's case: the G5 PASS book is under water at 1.0x once spread is added."""
    flags = g6.band_flags(_end(0.08, False), _end(-0.06, False))
    assert flags["verdict_flips_inside_band"] is False
    assert flags["net_sign_flips_inside_band"] is True
    assert flags["gate_holds_at_both_ends"] is False


def test_a_book_that_passes_at_both_ends_flips_nothing():
    flags = g6.band_flags(_end(1.0, True), _end(0.4, True))
    assert flags == {
        "verdict_flips_inside_band": False,
        "net_sign_flips_inside_band": False,
        "gate_holds_at_both_ends": True,
    }


# --- execution spec --------------------------------------------------------


def test_h1_and_h2_are_priced_on_one_full_perp_leg():
    spec = g6.spec_for("H1")
    assert len(spec["legs"]) == 1
    assert spec["legs"][0].notional_scale == pytest.approx(1.0)
    assert spec["leg_fee_bps"]["perp"] == fees.venue("binance").taker_bps("perp")


def test_h3_is_priced_on_two_half_legs_at_two_different_rates():
    spec = g6.spec_for("H3")
    scales = sum(leg.notional_scale for leg in spec["legs"])
    assert scales == pytest.approx(1.0)
    # Binance spot taker 10 bps against its 5 bps perp: two schedules, one venue.
    assert spec["leg_fee_bps"]["spot"] - spec["leg_fee_bps"]["perp"] == pytest.approx(5.0)


def test_an_unknown_hypothesis_has_no_spec():
    with pytest.raises(KeyError):
        g6.spec_for("H4")


# --- market panels ---------------------------------------------------------


def test_adv_and_volatility_never_read_the_day_they_price():
    """Both statistics are shifted forward, so day t is priced on data through t-1.

    Day 5 is the jump. Its own estimate must still be the quiet one from day 4;
    the jump may only appear on day 6. That second half matters: an estimator
    that never responded at all would also pass a "did not move" assertion.
    """
    days = pl.Series("day", [1, 2, 3, 4, 5, 6, 7])
    returns = pl.DataFrame({"day": days, "A": [0.0, 0.0, 0.01, -0.02, 0.01, 0.5, 0.0]})
    vol = market.volatility_panel(returns, window=2)
    quiet = vol["A"][4]
    assert vol["A"][5] == pytest.approx(quiet)
    assert vol["A"][6] > 10.0 * quiet


def test_volatility_panel_is_aligned_to_the_return_days():
    days = pl.Series("day", [1, 2, 3])
    returns = pl.DataFrame({"day": days, "A": [0.01, 0.02, 0.03]})
    vol = market.volatility_panel(returns, window=2)
    assert vol.height == 3
    assert vol["day"].to_list() == [1, 2, 3]


def test_as_matrix_puts_nulls_where_a_symbol_has_no_observation():
    frame = pl.DataFrame({"day": [1, 2], "A": [1.0, None], "B": [None, 2.0]})
    m = market.as_matrix(frame, ["A", "B", "C"])
    assert m.shape == (2, 3)
    assert np.isnan(m[1, 0]) and m[0, 0] == pytest.approx(1.0)
    assert np.all(np.isnan(m[:, 2]))


def test_measured_band_floor_is_the_audit_half_spread_alone():
    """Latency is its own cost component; folding it into the floor charges it twice."""
    rng = np.random.default_rng(7)
    n = 200
    close = 100.0 * np.exp(np.cumsum(rng.normal(0.0, 0.002, n)))
    frame = pl.DataFrame(
        {
            "symbol": ["AAAUSDT"] * n,
            "ts_ms": np.arange(n, dtype=np.int64) * 14_400_000,
            "high": close * 1.004,
            "low": close * 0.996,
        }
    )
    band = g6.measure_band(frame)
    assert band["floor_half_spread_bps"] == pytest.approx(
        spread_mod.AUDIT_LIQUID_HALF_SPREAD_BPS
    )
    assert band["abdi_ranaldo_cross_check"] is None


def test_measure_band_attaches_abdi_ranaldo_cross_check_when_close_present():
    """When 4h bars carry closes, measure_band reports unbiased Abdi-Ranaldo across all symbols."""
    rng = np.random.default_rng(17)
    n = 200
    close_a = 100.0 * np.exp(np.cumsum(rng.normal(0.0, 0.01, n)))
    # Symbol A: close alternates at high/low extremes -> positive AR spread.
    # Symbol B: tight trending range -> negative AR s2 clamped to 0.0 bps.
    close_b = 100.0 * np.exp(np.linspace(0.0, 0.2, n))
    frame = pl.concat(
        [
            pl.DataFrame(
                {
                    "symbol": ["AAAUSDT"] * n,
                    "ts_ms": np.arange(n, dtype=np.int64) * 14_400_000,
                    "high": close_a * 1.005,
                    "low": close_a * 0.995,
                    "close": np.where(np.arange(n) % 2 == 0, close_a * 1.005, close_a * 0.995),
                }
            ),
            pl.DataFrame(
                {
                    "symbol": ["BBBUSDT"] * n,
                    "ts_ms": np.arange(n, dtype=np.int64) * 14_400_000,
                    "high": close_b * 1.0001,
                    "low": close_b * 0.9999,
                    "close": close_b,
                }
            ),
        ]
    )
    band = g6.measure_band(frame)
    ar = band["abdi_ranaldo_cross_check"]
    assert ar is not None
    assert ar["n_symbols"] == 2
    assert ar["symbols_with_detectable_spread"] == 1
    assert ar["median_full_spread_bps"] < ar["median_detectable_only_bps"]


def test_g6_evaluate_enforces_locked_oos_gate_when_split_is_supplied():
    """A book profitable in train that bleeds in post-embargo locked OOS must fail g6_pass."""
    from verification_lab.runner import run_grid

    days = 200
    split = 120
    day_s = pl.Series("day", list(range(days)))
    # Price rises across both windows so H2 momentum stays long, while injected returns
    # earn +0.02/day in train (days 0..119) and lose -0.01/day in OOS (days 120..199).
    px = np.concatenate(
        [
            100.0 * np.exp(np.linspace(0.0, 1.2, split)),
            100.0 * np.exp(1.2) * np.exp(np.linspace(0.01, 0.8, days - split)),
        ]
    )
    close_df = pl.DataFrame({"day": day_s, "BTCUSDT": px})
    rets_arr = np.concatenate([np.full(split, 0.02), np.full(days - split, -0.01)])
    rets_df = pl.DataFrame({"day": day_s, "BTCUSDT": rets_arr})
    zero_df = pl.DataFrame({"day": day_s, "BTCUSDT": np.zeros(days)})
    panel = run_grid.Panel(
        perp_close=close_df,
        perp_returns=rets_df,
        spot_close=close_df,
        spot_returns=rets_df,
        funding=zero_df,
        basis=zero_df,
    )
    matrices = {
        "adv": np.full((days, 1), 1e9),
        "vol": np.full((days, 1), 0.02),
    }
    spread_band = {
        "floor_half_spread_bps": 3.0,
        "ceiling_half_spread_bps": 4.0,
    }
    g5_entry = {
        "verdict": "PASS",
        "winner_params": {"lookback": 10, "target_vol_annual": 0.25},
        "winner_train": {"mean_daily_turnover": 0.05},
    }
    out = g6.evaluate(
        "H2",
        g5_entry["winner_params"],
        panel,
        spread_band,
        matrices,
        g5_entry,
        split=split,
    )
    # Full sample is positive because train dominates, while locked_oos is negative -> g6_pass False.
    assert out["at_floor"]["cum_net"] > 0.0
    assert out["locked_oos"]["embargo_days"] == 20
    assert out["locked_oos"]["at_floor"]["cum_net"] < 0.0
    assert out["locked_oos"]["g6_pass"] is False
    assert out["g6_pass"] is False


def test_volatility_panel_preserves_nulls_and_impact_falls_back_on_missing_vol():
    """Pre-listing null returns must keep null volatility and trigger fallback_bps, not 0 bps."""
    days = pl.Series("day", list(range(12)))
    rets = pl.DataFrame(
        {
            "day": days,
            "LATE": [None] * 8 + [0.01, -0.02, 0.015, -0.01],
        }
    )
    vol = market.volatility_panel(rets, window=5)
    # Pre-listing bars and bars before 5 valid return samples must remain null, never 0.0.
    assert all(v is None for v in vol["LATE"].to_list()[:12])

    # Missing volatility with positive participation must charge fallback_bps, not zero.
    charged = cost_model.impact_bps(
        np.array([[0.01, 0.0]]),
        np.array([[np.nan, 0.02]]),
        coefficient=1.0,
        fallback_bps=2.0,
    )
    assert charged[0, 0] == pytest.approx(2.0)
    assert charged[0, 1] == pytest.approx(0.0)
