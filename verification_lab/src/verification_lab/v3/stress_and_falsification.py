"""Execution cost stress suite (11 scenarios) and scientific falsification gate for V3.

Preserves G6_FULL_EXECUTION_PARITY_NOT_VERIFIED, counts full multiple-testing family
history (N >= 186, never resetting N to 1), and never uses old H3_MAKER p=0.00999.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
import math
import random

from .models import AllocationPolicy, VenueRouteSpec

BPS = Decimal("10000")
DAYS_PER_YEAR = Decimal("365")


@dataclass(frozen=True)
class StressScenarioResult:
    """Result of one execution-cost or tail-risk stress scenario."""

    scenario_id: str
    description: str
    evidence_basis: str  # "OBSERVED_VENUE_PUBLISHED" or "SYNTHETIC_STRESS_ASSUMPTION"
    friction_multiplier: Decimal
    gross_funding_usd: Decimal
    total_execution_cost_usd: Decimal
    opportunity_cost_usd: Decimal
    stress_shock_loss_usd: Decimal
    net_carry_after_opp_cost_usd: Decimal
    return_on_equity_pct: Decimal
    excess_over_cash_pct: Decimal
    perp_liquidation_breached: bool
    survives_positive_excess_carry: bool


def run_execution_stress_suite(
    spec: VenueRouteSpec,
    capital_usd: Decimal = Decimal("5000"),
    holding_days: int = 90,
    cash_benchmark_annual_bps: Decimal = Decimal("400"),
    policy: AllocationPolicy | None = None,
) -> tuple[StressScenarioResult, ...]:
    """Run all 11 mandated execution cost & tail-risk stress scenarios on a venue route."""
    pol = policy or AllocationPolicy()
    leg_notional = capital_usd * pol.spot_ratio
    perp_im = capital_usd * pol.perp_im_ratio
    perp_mm = leg_notional * spec.perp_maint_margin_rate
    horizon_frac = Decimal(holding_days) / DAYS_PER_YEAR

    base_fees = leg_notional * Decimal("2") * ((spec.spot_taker_fee_bps + spec.perp_taker_fee_bps) / BPS)
    spot_spread = (spec.spot_ask_usd - spec.spot_bid_usd) / spec.spot_price_usd
    perp_spread = (spec.perp_ask_usd - spec.perp_bid_usd) / spec.perp_price_usd
    base_spread = leg_notional * (spot_spread + perp_spread)
    # Include base slippage + market impact + adverse selection (5 bps round-trip synthetic floor)
    base_slippage_impact = leg_notional * (Decimal("5.0") / BPS)
    base_transfer = spec.cross_venue_transfer_fee_usd * Decimal("2")
    base_total_friction = base_fees + base_spread + base_slippage_impact + base_transfer

    base_funding = leg_notional * (spec.historical_mean_funding_bps / BPS) * horizon_frac
    opp_cost = capital_usd * (cash_benchmark_annual_bps / BPS) * horizon_frac
    # Apply the same annualized operational/wrapper haircut as capital_matrix.py so S01-S11 are strictly consistent.
    op_penalty_usd = leg_notional * (spec.operational_penalty_bps_annual / BPS) * horizon_frac

    def _make(
        sid: str,
        desc: str,
        basis: str,
        mult: Decimal,
        funding_usd: Decimal,
        shock_usd: Decimal,
        perp_upward_move_pct: Decimal = Decimal("0"),
    ) -> StressScenarioResult:
        exec_cost = base_total_friction * mult
        net_accounting = funding_usd - exec_cost - shock_usd - op_penalty_usd
        net_after_opp = net_accounting - opp_cost
        # Liquidation check: upward perp move drains perp_im
        perp_loss_from_rally = leg_notional * perp_upward_move_pct
        liq_breached = (perp_im - perp_loss_from_rally - (exec_cost / Decimal("2"))) <= perp_mm
        return StressScenarioResult(
            scenario_id=sid,
            description=desc,
            evidence_basis=basis,
            friction_multiplier=mult,
            gross_funding_usd=funding_usd,
            total_execution_cost_usd=exec_cost,
            opportunity_cost_usd=opp_cost,
            stress_shock_loss_usd=shock_usd,
            net_carry_after_opp_cost_usd=net_after_opp,
            return_on_equity_pct=(net_accounting / capital_usd) * Decimal("100"),
            excess_over_cash_pct=(net_after_opp / capital_usd) * Decimal("100"),
            perp_liquidation_breached=liq_breached,
            survives_positive_excess_carry=(net_after_opp > Decimal("0") and not liq_breached),
        )

    return (
        _make(
            "S01_BASE_VENUE_FEES",
            "Base venue-published taker fees + observed L1 spread + 5 bps slippage floor",
            "OBSERVED_VENUE_PUBLISHED_PLUS_SYNTHETIC_SLIPPAGE",
            Decimal("1.0"),
            base_funding,
            Decimal("0"),
        ),
        _make(
            "S02_FRICTION_1_5X",
            "1.5x full execution friction (fees + spread + slippage + impact)",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("1.5"),
            base_funding,
            Decimal("0"),
        ),
        _make(
            "S03_FRICTION_2X",
            "2.0x full execution friction (mandatory CashClaw G6 stress threshold)",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("2.0"),
            base_funding,
            Decimal("0"),
        ),
        _make(
            "S04_FRICTION_3X",
            "3.0x full execution friction (severe liquidity deterioration)",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("3.0"),
            base_funding,
            Decimal("0"),
        ),
        _make(
            "S05_ADVERSE_FUNDING_REVERSAL",
            "Sudden funding reversal to -1500 bps APR for 14 days then flat 0 bps",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("1.0"),
            -leg_notional * (Decimal("1500") / BPS) * (Decimal("14") / DAYS_PER_YEAR),
            Decimal("0"),
        ),
        _make(
            "S06_BASIS_DISLOCATION_5PCT",
            "Spot/perp 5% adverse basis dislocation (perp rallies +5% over spot)",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("1.5"),
            base_funding,
            leg_notional * Decimal("0.05"),
            perp_upward_move_pct=Decimal("0.05"),
        ),
        _make(
            "S07_BASIS_DISLOCATION_15PCT",
            "Spot/perp 15% adverse basis dislocation (extreme stress)",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("2.0"),
            base_funding,
            leg_notional * Decimal("0.15"),
            perp_upward_move_pct=Decimal("0.15"),
        ),
        _make(
            "S08_SEVERE_ONE_LEG_NON_FILL",
            "One-leg non-fill requiring emergency taker unwind at 150 bps adverse move",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("1.5"),
            Decimal("0"),
            leg_notional * Decimal("0.015"),
        ),
        _make(
            "S09_EXCHANGE_OUTAGE",
            "4-hour venue outage during 8% rally with emergency taker exit + 50 bps slip",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("2.0"),
            base_funding * Decimal("0.5"),
            leg_notional * Decimal("0.025"),
            perp_upward_move_pct=Decimal("0.08"),
        ),
        _make(
            "S10_WRAPPED_BTC_DEPEG_5PCT",
            "5% UBTC/wrapped-BTC discount vs native BTC oracle (0% on native CEX spot)",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("1.0"),
            base_funding,
            leg_notional * Decimal("0.05") if spec.is_wrapped_spot else Decimal("0"),
        ),
        _make(
            "S11_SHORT_PERP_LIQUIDATION_PRESSURE",
            "Rapid +25% BTC rally testing perp IM buffer before free-reserve top-up",
            "SYNTHETIC_STRESS_ASSUMPTION",
            Decimal("2.0"),
            base_funding * Decimal("0.5"),
            leg_notional * Decimal("0.03"),  # Forced liquidation penalty + re-hedge slip
            perp_upward_move_pct=Decimal("0.25"),
        ),
    )


@dataclass(frozen=True)
class FalsificationSummary:
    """Scientific falsification metrics comparing V3 against mandated controls."""

    dataset_provenance: str
    sample_days: int
    cumulative_family_trials_n: int
    v3_annualized_gross_return_pct: float
    v3_annualized_net_return_1x_pct: float
    v3_annualized_net_return_2x_pct: float
    v3_annualized_excess_over_cash_1x_pct: float
    v3_annualized_excess_over_cash_2x_pct: float
    cash_benchmark_annual_pct: float
    risk_matched_btc_bh_annual_pct: float
    funding_only_baseline_annual_pct: float
    v3_sharpe_1x_excess: float
    v3_sharpe_2x_excess: float
    v3_max_drawdown_pct: float
    v3_cvar_95_daily_pct: float
    deflated_sharpe_ratio_n_family: float
    randomized_entry_p_value: float
    positive_funding_day_ratio: float
    sample_adequacy_verdict: str
    g5_statistical_verdict: str


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_ppf_approx(p: float) -> float:
    """Acklam's rational approximation for standard normal inverse CDF."""
    if p <= 0.0 or p >= 1.0:
        raise ValueError("p must be in (0, 1)")
    a = [-3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02,
         1.383577518672690e02, -3.066479806614716e01, 2.506628277459239e00]
    b = [-5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02,
         6.680131188771972e01, -1.328068155288572e01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00,
         -2.549732539343734e00, 4.374664141464968e00, 2.938163982698783e00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00,
         3.754408661907416e00]
    plow = 0.02425
    phigh = 1.0 - plow
    if p < plow:
        q = math.sqrt(-2.0 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1.0)
    if p <= phigh:
        q = p - 0.5
        r = q * q
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1.0)
    q = math.sqrt(-2.0 * math.log(1.0 - p))
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1.0)


def run_scientific_falsification(
    daily_funding_rates: list[float],
    daily_btc_returns: list[float],
    dataset_provenance: str = "HASH_RECORDED_UNVERIFIED",
    spot_ratio: float = 0.60,
    cash_benchmark_annual: float = 0.04,
    round_trip_cost_1x_on_leg: float = 0.0033,  # ~33 bps RT (fees+spread+slippage)
    rebalances_per_year: float = 4.0,
    prior_family_trials: int = 186,
    new_v3_trials: int = 15,  # 3 routes x 5 capital tiers counted honestly
    seed: int = 20261123,
) -> FalsificationSummary:
    """Evaluate V3 cash-funded carry against cash, risk-matched BTC, funding-only, and random entry.

    Uses Bailey & Lopez de Prado Deflated Sharpe Ratio (DSR) at cumulative N = prior + new trials.
    """
    n = min(len(daily_funding_rates), len(daily_btc_returns))
    if n < 30:
        raise ValueError(f"Need at least 30 daily observations, got {n}")

    rf_daily = cash_benchmark_annual / 365.0
    cost_daily_1x = (spot_ratio * round_trip_cost_1x_on_leg * rebalances_per_year) / 365.0
    cost_daily_2x = 2.0 * cost_daily_1x

    # Simple causal 30d rolling funding threshold (> 8% APR = 0.08/365 daily)
    entry_thresh = 0.08 / 365.0
    gross_daily: list[float] = []
    net_1x_daily: list[float] = []
    net_2x_daily: list[float] = []
    excess_1x_daily: list[float] = []
    excess_2x_daily: list[float] = []
    funding_only_daily: list[float] = []
    signals: list[int] = []

    for i in range(30, n):
        # Strictly causal: rolling mean of days [i-30 .. i-1], applied to day i
        roll_mean = sum(daily_funding_rates[i - 30 : i]) / 30.0
        active = 1 if roll_mean > entry_thresh else 0
        signals.append(active)
        f_i = daily_funding_rates[i]
        funding_only_daily.append(spot_ratio * f_i)
        # When active: earn funding on 60% leg; when inactive: hold cash (0 funding, 0 trading cost)
        g_i = spot_ratio * f_i if active else 0.0
        n1_i = g_i - (cost_daily_1x if active else 0.0)
        n2_i = g_i - (cost_daily_2x if active else 0.0)
        gross_daily.append(g_i)
        net_1x_daily.append(n1_i)
        net_2x_daily.append(n2_i)
        excess_1x_daily.append(n1_i - rf_daily)
        excess_2x_daily.append(n2_i - rf_daily)

    m = len(net_1x_daily)

    def _mean(xs: list[float]) -> float:
        return sum(xs) / len(xs)

    def _std(xs: list[float]) -> float:
        mu = _mean(xs)
        var = sum((x - mu) ** 2 for x in xs) / max(1, len(xs) - 1)
        return math.sqrt(var)

    sr_1x = (_mean(excess_1x_daily) / _std(excess_1x_daily)) * math.sqrt(365.0) if _std(excess_1x_daily) > 0 else 0.0
    sr_2x = (_mean(excess_2x_daily) / _std(excess_2x_daily)) * math.sqrt(365.0) if _std(excess_2x_daily) > 0 else 0.0

    # Max drawdown & 95% daily CVaR on 1x net series
    eq = 1.0
    peak = 1.0
    max_dd = 0.0
    for r in net_1x_daily:
        eq *= (1.0 + r)
        peak = max(peak, eq)
        max_dd = max(max_dd, (peak - eq) / peak)

    sorted_r = sorted(net_1x_daily)
    tail_k = max(1, int(0.05 * m))
    cvar_95 = _mean(sorted_r[:tail_k]) * 100.0

    # Risk-matched BTC Buy-and-Hold (scaled to match V3 daily volatility)
    btc_slice = daily_btc_returns[30:n]
    btc_vol = _std(btc_slice)
    v3_vol = _std(net_1x_daily)
    vol_scale = (v3_vol / btc_vol) if btc_vol > 0 else 0.0
    btc_rm_annual = _mean(btc_slice) * vol_scale * 365.0 * 100.0

    # Deflated Sharpe Ratio (DSR) at cumulative family N
    n_family = prior_family_trials + new_v3_trials
    euler_gamma = 0.5772156649
    # Expected max Sharpe under null across n_family trials (annualized scale)
    z1 = _norm_ppf_approx(1.0 - 1.0 / n_family)
    z2 = _norm_ppf_approx(1.0 - 1.0 / (n_family * math.e))
    sr_star_daily = ((1.0 - euler_gamma) * z1 + euler_gamma * z2) / math.sqrt(m)
    sr_obs_daily = sr_1x / math.sqrt(365.0)
    dsr_z = (sr_obs_daily - sr_star_daily) * math.sqrt(m - 1)
    dsr = _norm_cdf(dsr_z)

    # Randomized-entry control (500 permutations preserving active-day count)
    rng = random.Random(seed)
    obs_mean_excess = _mean(excess_1x_daily)
    ge_count = 0
    n_perm = 500
    f_slice = daily_funding_rates[30:n]
    for _ in range(n_perm):
        perm_sig = signals[:]
        rng.shuffle(perm_sig)
        perm_ex = [
            (spot_ratio * f_slice[k] - cost_daily_1x if perm_sig[k] else 0.0) - rf_daily
            for k in range(m)
        ]
        if _mean(perm_ex) >= obs_mean_excess:
            ge_count += 1
    p_val = (ge_count + 1) / (n_perm + 1)

    pos_ratio = sum(1 for x in f_slice if x > 0) / m
    ann_ex_1x = _mean(excess_1x_daily) * 365.0 * 100.0
    ann_ex_2x = _mean(excess_2x_daily) * 365.0 * 100.0

    adequacy = (
        "INSUFFICIENT_PROVENANCE_UNVERIFIED_HISTORICAL_ONLY"
        if dataset_provenance != "HASH_MATCH_TRUSTED_MANIFEST"
        else "HISTORICAL_ADEQUATE_PROSPECTIVE_OOS_STILL_REQUIRED"
    )
    if ann_ex_2x <= 0.0 or dsr < 0.95 or p_val > 0.05:
        g5_verdict = "FALSIFIED_OR_INSUFFICIENT_EXCESS_CARRY"
    else:
        g5_verdict = "CANDIDATE_REQUIRES_UNTOUCHED_PROSPECTIVE_OOS"

    return FalsificationSummary(
        dataset_provenance=dataset_provenance,
        sample_days=m,
        cumulative_family_trials_n=n_family,
        v3_annualized_gross_return_pct=_mean(gross_daily) * 365.0 * 100.0,
        v3_annualized_net_return_1x_pct=_mean(net_1x_daily) * 365.0 * 100.0,
        v3_annualized_net_return_2x_pct=_mean(net_2x_daily) * 365.0 * 100.0,
        v3_annualized_excess_over_cash_1x_pct=ann_ex_1x,
        v3_annualized_excess_over_cash_2x_pct=ann_ex_2x,
        cash_benchmark_annual_pct=cash_benchmark_annual * 100.0,
        risk_matched_btc_bh_annual_pct=btc_rm_annual,
        funding_only_baseline_annual_pct=_mean(funding_only_daily) * 365.0 * 100.0,
        v3_sharpe_1x_excess=sr_1x,
        v3_sharpe_2x_excess=sr_2x,
        v3_max_drawdown_pct=max_dd * 100.0,
        v3_cvar_95_daily_pct=cvar_95,
        deflated_sharpe_ratio_n_family=dsr,
        randomized_entry_p_value=p_val,
        positive_funding_day_ratio=pos_ratio,
        sample_adequacy_verdict=adequacy,
        g5_statistical_verdict=g5_verdict,
    )
