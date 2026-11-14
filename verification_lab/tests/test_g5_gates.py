"""The G5 report's decision logic, exercised against constructed outcomes.

The statistical core is tested separately; what is tested here is whether the
lab reaches the right verdict from a given set of numbers. That matters because
a wrong gate direction is invisible in the artifact -- the report would simply
say PASS, in the same format, with the same confidence.

Each test therefore drives a function with inputs whose correct answer is known
by construction: a synthetic spike must be flagged as a spike, a genuine
plateau must not be, a book held for three separate windows must count as three
trades, and a cost multiplier above break-even must turn cumulative return
negative.
"""

from __future__ import annotations

import importlib.util
import math
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


g5 = _load("g5_statistical_validity")


# --- PSR -------------------------------------------------------------------


def test_psr_rejects_a_short_record_with_a_modest_sharpe():
    """A 30-day record cannot establish a Sharpe of 1.0 at 95% confidence."""
    rng = np.random.default_rng(1)
    returns = rng.normal(0.001, 0.01, size=30)
    out = g5.psr(returns)
    assert "psr" in out
    assert out["psr"] < 0.95


def test_psr_accepts_a_long_record_with_a_large_sharpe():
    rng = np.random.default_rng(2)
    returns = rng.normal(0.004, 0.01, size=2000)
    out = g5.psr(returns)
    assert out["psr"] > 0.95


def test_psr_falls_as_the_benchmark_rises():
    """PSR is the probability of beating a benchmark, so raising it must lower it."""
    rng = np.random.default_rng(3)
    returns = rng.normal(0.002, 0.01, size=1000)
    low = g5.psr(returns, benchmark_sr_per_period=0.0)["psr"]
    high = g5.psr(returns, benchmark_sr_per_period=0.005)["psr"]
    assert high < low


def test_psr_flags_insufficient_and_degenerate_input():
    assert "note" in g5.psr(np.array([0.01, 0.02]))
    assert "note" in g5.psr(np.zeros(100))


def test_psr_reports_the_moments_it_used():
    """The correction must be visible, not implied: skew and kurtosis are reported."""
    rng = np.random.default_rng(4)
    out = g5.psr(rng.normal(0.0, 0.01, size=500))
    assert "skew" in out and "kurtosis" in out
    assert out["kurtosis"] == pytest.approx(3.0, abs=0.5)


# --- trade episodes --------------------------------------------------------


def test_trade_episodes_splits_contiguous_runs():
    """Two held windows separated by a flat day are two trades, not one."""
    positions = np.array(
        [
            [0.0],
            [1.0],
            [1.0],
            [0.0],
            [0.0],
            [1.0],
            [0.0],
        ]
    )
    assert g5.trade_episodes(positions) == [(1, 3), (5, 6)]


def test_trade_episodes_treats_any_symbol_as_an_open_book():
    """The episode is the book's position, so one live leg keeps it open."""
    positions = np.array(
        [
            [0.0, 0.0],
            [1.0, 0.0],
            [0.0, 1.0],
            [0.0, 0.0],
        ]
    )
    assert g5.trade_episodes(positions) == [(1, 3)]


def test_trade_episodes_include_a_run_touching_the_final_bar():
    """A position still open at the end has not been closed and must count."""
    positions = np.array([[0.0], [1.0], [1.0]])
    assert g5.trade_episodes(positions) == [(1, 3)]


def test_trade_episodes_on_an_always_flat_book_is_empty():
    assert g5.trade_episodes(np.zeros((10, 3))) == []


def test_trade_expectancy_averages_over_episodes_not_days():
    """Expectancy per trade must not silently become expectancy per day."""
    positions = np.array([[0.0], [1.0], [1.0], [0.0], [1.0], [0.0]])
    net = np.array([0.0, 0.01, 0.01, 0.0, 0.10, 0.0])
    out = g5.trade_expectancy(net, positions)
    assert out["n_trades"] == 2
    # Episode 1 totals 0.02, episode 2 totals 0.10 -> mean 0.06, not 0.12/2 days.
    assert out["expectancy"] == pytest.approx(0.06)
    # Episodes are (1,3) and (4,5): held 2 bars and 1 bar.
    assert out["mean_hold_days"] == pytest.approx(1.5)
    assert out["hit_rate"] == pytest.approx(1.0)


def test_episode_pnls_includes_exit_bar_closing_cost_in_expectancy_and_bootstrap():
    """Closing turnover falls on the first flat bar after an episode; omitting it halves cost."""
    from verification_lab.strategies.common import apply_costs

    # Two episodes: bars [1, 3) and [4, 5), returning to flat on bars 3 and 5.
    w = np.array([[0.0], [1.0], [1.0], [0.0], [1.0], [0.0]])
    r = np.array([[0.0], [0.001], [0.001], [0.0], [0.001], [0.0]])
    # Charge 100 bps per unit turnover so exit cost (0.01) dominates gross (0.002 / 0.001).
    booked = apply_costs(w, r, cost_bps_per_turn=100.0)
    # Full book net sum is (0.002 - 0.02) + (0.001 - 0.02) = -0.037.
    assert float(np.sum(booked["net"])) == pytest.approx(-0.037)
    exp = g5.trade_expectancy(booked["net"], w)
    assert exp["n_trades"] == 2
    # Episode 1: +0.002 - 0.01(entry) - 0.01(exit on bar 3) = -0.018
    # Episode 2: +0.001 - 0.01(entry) - 0.01(exit on bar 5) = -0.019 -> mean -0.0185
    assert exp["expectancy"] == pytest.approx(-0.0185)
    assert exp["hit_rate"] == pytest.approx(0.0)

    # Sparse bootstrap over episodes must also see negative episode PnLs, never omitting exit cost.
    many_w = np.tile(w, (20, 1))
    many_r = np.tile(r, (20, 1))
    many_booked = apply_costs(many_w, many_r, cost_bps_per_turn=100.0)
    boot = g5.block_bootstrap_ci(many_booked["net"], positions=many_w, n_boot=200, seed=7)
    assert "expectancy_per_trade" in boot
    assert boot["expectancy_per_trade"]["n_trades"] == 40
    assert boot["expectancy_per_trade"]["point"] == pytest.approx(
        float(np.mean(g5.episode_pnls(many_booked["net"], many_w)))
    )
    assert boot["expectancy_per_trade"]["point"] < 0.0


# --- drawdown / calmar -----------------------------------------------------


def test_max_drawdown_of_a_monotone_curve_is_zero():
    assert g5.max_drawdown(np.full(100, 0.001)) == pytest.approx(0.0)


def test_max_drawdown_measures_peak_to_trough_on_unit_notional():
    net = np.array([0.1, 0.1, -0.1, -0.1, 0.05])
    # Equity curve starting at 1.0: 1.1, 1.2, 1.1, 1.0, 1.05 -> peak 1.2, trough 1.0 -> 0.2 / 1.2.
    assert g5.max_drawdown(net) == pytest.approx(0.2 / 1.2)


def test_max_drawdown_is_positive_on_a_monotonic_loser_and_bounded_after_small_gain():
    # Monotonic loser from bar 0 must report positive 30% drawdown on unit notional, never 0.0.
    assert g5.max_drawdown(np.array([-0.1, -0.1, -0.1])) == pytest.approx(0.3)
    # Tiny +0.1% gain followed by -5% loss must be ~5.095%, never 5000%.
    dd = g5.max_drawdown(np.array([0.001, -0.05]))
    assert dd == pytest.approx(0.05 / 1.001)
    assert 0.0 < dd < 1.0


def test_compounded_max_drawdown_tracks_reinvested_equity_and_caps_total_wipeout():
    net = np.array([0.1, 0.1, -0.1, -0.1, 0.05])
    # Compounded equity: 1.1, 1.21, 1.089, 0.9801, 1.029105 -> (1.21 - 0.9801) / 1.21 = 0.19
    assert g5.compounded_max_drawdown(net) == pytest.approx(1.0 - 0.9 * 0.9)
    # Any single-bar loss <= -100% floors equity at 0.0 (100% max drawdown, never > 1.0).
    assert g5.compounded_max_drawdown(np.array([0.2, -1.5, 0.3])) == pytest.approx(1.0)
    assert g5.compounded_max_drawdown(np.array([])) == pytest.approx(0.0)


def test_calmar_is_undefined_without_drawdown():
    assert math.isnan(g5.calmar(np.zeros(50)))


# --- cost stress -----------------------------------------------------------


def test_break_even_multiple_is_where_net_reaches_zero():
    """Above its break-even multiple a strategy must lose money; below, earn."""
    gross = np.full(400, 0.01)
    cost = np.full(400, 0.004)
    multiple = float(gross.sum() / cost.sum())
    assert multiple == pytest.approx(2.5)
    assert np.sum(gross - cost * (multiple * 0.9)) > 0
    assert np.sum(gross - cost * (multiple * 1.1)) < 0


# --- reality check ---------------------------------------------------------


def test_reality_check_cannot_reject_pure_noise():
    """With no edge in the family, the best-of-N must not look significant."""
    rng = np.random.default_rng(11)
    matrix = rng.normal(0.0, 0.01, size=(8, 1200))
    out = g5.white_reality_check(matrix, n_boot=300)
    assert out["p_value"] > 0.05
    assert out["verdict"] == "FAIL"


def test_reality_check_finds_a_genuine_edge():
    rng = np.random.default_rng(12)
    matrix = rng.normal(0.0, 0.01, size=(8, 1200))
    matrix[0] += 0.003
    out = g5.white_reality_check(matrix, n_boot=300)
    assert out["p_value"] < 0.05
    assert out["verdict"] == "PASS"


def test_reality_check_is_deterministic():
    rng = np.random.default_rng(13)
    matrix = rng.normal(0.0, 0.01, size=(6, 900))
    out_a = g5.white_reality_check(matrix, n_boot=200)
    out_b = g5.white_reality_check(matrix, n_boot=200)
    assert out_a["p_value"] == out_b["p_value"]
    # `observed_best_sharpe` must be annualised by sqrt(365), matching every other Sharpe in G5.
    expected_annual = max(
        float(matrix[s].mean() / matrix[s].std(ddof=1) * math.sqrt(g5.PERIODS))
        for s in range(matrix.shape[0])
    )
    assert out_a["observed_best_sharpe"] == pytest.approx(expected_annual, abs=1e-4)


# --- tail correlation ------------------------------------------------------


def test_tail_correlation_detects_a_shared_downside():
    """A book that falls with BTC on BTC's worst days must report a high rho."""
    rng = np.random.default_rng(14)
    btc = rng.normal(0.0, 0.03, size=2000)
    strat = 0.9 * btc + rng.normal(0.0, 0.002, size=2000)
    out = g5.tail_correlation(strat, btc)
    assert out["tail_correlation"] > 0.50


def test_tail_correlation_is_low_for_an_independent_book():
    rng = np.random.default_rng(15)
    btc = rng.normal(0.0, 0.03, size=2000)
    strat = rng.normal(0.0, 0.01, size=2000)
    out = g5.tail_correlation(strat, btc)
    assert abs(out["tail_correlation"]) < 0.30


# --- bootstrap -------------------------------------------------------------


def test_bootstrap_intervals_bracket_their_point_estimate():
    """A CI that excludes its own point estimate is not a CI."""
    rng = np.random.default_rng(16)
    net = rng.normal(0.0005, 0.01, size=1000)
    out = g5.block_bootstrap_ci(net, n_boot=400, block=20)
    for key in ("sharpe", "calmar", "annualised_net_return"):
        lo90, hi90 = out[key]["ci90"]
        lo95, hi95 = out[key]["ci95"]
        assert lo90 <= hi90 and lo95 <= hi95
        assert lo95 <= lo90 and hi95 >= hi90, "the 95% interval must contain the 90%"
        assert out[key]["point"] is not None
        assert lo95 <= out[key]["point"] <= hi95


def test_bootstrap_is_wider_on_a_shorter_record():
    """Less data must mean more uncertainty, not less."""
    rng = np.random.default_rng(17)
    short = g5.block_bootstrap_ci(rng.normal(0.0005, 0.01, 300), n_boot=400, block=20)
    long = g5.block_bootstrap_ci(rng.normal(0.0005, 0.01, 3000), n_boot=400, block=20)
    width_short = short["sharpe"]["ci95"][1] - short["sharpe"]["ci95"][0]
    width_long = long["sharpe"]["ci95"][1] - long["sharpe"]["ci95"][0]
    assert width_short > width_long


def test_bootstrap_is_reproducible_for_a_fixed_seed():
    rng = np.random.default_rng(18)
    net = rng.normal(0.0005, 0.01, size=800)
    a = g5.block_bootstrap_ci(net, n_boot=300, seed=99)
    b = g5.block_bootstrap_ci(net, n_boot=300, seed=99)
    assert a["sharpe"]["ci95"] == b["sharpe"]["ci95"]


def test_bootstrap_needs_enough_data_to_resample_blocks():
    assert "note" in g5.block_bootstrap_ci(np.zeros(30), n_boot=100, block=20)


def test_bootstrap_decouples_calmar_infinity_from_sharpe_and_return_cis():
    """Zero-drawdown series have Calmar=+inf on every resample; Sharpe and return CIs must survive."""
    rng = np.random.default_rng(2026)
    positive_only = rng.uniform(0.0005, 0.003, size=300)
    out = g5.block_bootstrap_ci(positive_only, n_boot=200, block=20, seed=42)
    assert out["n_bootstrap"] == 200
    assert out["sharpe"]["n_valid"] == 200
    assert out["sharpe"]["ci95"][0] is not None and out["sharpe"]["ci95"][1] is not None
    assert out["annualised_net_return"]["n_valid"] == 200
    assert out["annualised_net_return"]["ci95"][0] > 0.0
    # Calmar is +inf on every positive zero-drawdown resample -> gracefully reports None, never IndexError.
    assert out["calmar"]["n_valid"] == 0
    assert out["calmar"]["point"] is None
    assert out["calmar"]["ci90"] == [None, None]
    assert out["calmar"]["ci95"] == [None, None]
    assert out["calmar"]["median"] is None


def test_g4_negative_control_flags_positive_noise_mean_above_two_se(monkeypatch):
    """A positive mean Sharpe > 2*SE on driftless noise must fail even when < 0.75."""
    import importlib.util
    from pathlib import Path

    script = Path(__file__).resolve().parents[1] / "scripts" / "g4_leakage_audit.py"
    spec = importlib.util.spec_from_file_location("g4_leakage_audit_test", script)
    assert spec is not None and spec.loader is not None
    g4 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(g4)

    monkeypatch.setattr(g4, "NOISE_SEEDS", list(range(10)))
    monkeypatch.setattr(g4, "_noise_panel", lambda seed: seed)

    # Construct deterministic low-variance seed Sharpes around +0.40 (< 0.75, > 2*SE) for H1,
    # and symmetric zero-mean Sharpes for H2/H3.
    def fake_run_all(seed: int) -> dict:
        alt = 1.0 if seed % 2 == 0 else -1.0
        # Alternating +/-0.01 around mean +0.00021 -> SR ~= 0.40 +/- 0.01 across seeds (SE ~0.003).
        leaked = np.where(np.arange(800) % 2 == 0, 0.01, -0.01) + 0.00021 + 0.00001 * alt
        clean = np.where(np.arange(800) % 2 == 0, 0.01, -0.01) + 0.00005 * alt
        return {
            "H1": {"gross": leaked, "net": leaked},
            "H2": {"gross": clean, "net": clean},
            "H3": {"gross": clean, "net": clean},
        }

    monkeypatch.setattr(g4, "_run_all", fake_run_all)
    nc = g4.negative_control()
    assert 0.30 < nc["H1"]["gross_sharpe"]["mean"] < 0.75
    assert nc["H1"]["verdict"] == "EDGE-FROM-NOISE"
    assert nc["H2"]["verdict"] == "PASS"
    assert nc["H3"]["verdict"] == "PASS"


# --- sparse diagnostic -----------------------------------------------------


def test_sparse_diagnostic_counts_flat_days():
    net = np.zeros(100)
    net[:20] = 0.01
    out = g5.sparse_diagnostic(net)
    assert out["days"] == 100
    assert out["flat_days"] == 80
    assert out["flat_fraction"] == pytest.approx(0.80)
    assert out["sparse"] is True


def test_sparse_diagnostic_does_not_flag_a_continuously_invested_book():
    rng = np.random.default_rng(19)
    out = g5.sparse_diagnostic(rng.normal(0.0, 0.01, size=500))
    assert out["sparse"] is False


# --- rejection rules -------------------------------------------------------


def _hypothesis(
    *,
    dsr: float = 0.99,
    pbo: float = 0.05,
    psr_oos: float = 0.99,
    rc_p: float = 0.01,
    plateau: str = "PLATEAU",
    worst_probe: str = "plus20",
    worst_drop_pct: float = 5.0,
    break_even: float = 4.0,
    oos_sharpe: float = 1.2,
    cum_net_2x: float = 0.3,
    tail_corr: float | None = None,
) -> dict:
    """A hypothesis result shaped like the one `evaluate_hypothesis` builds.

    The `gates` block is produced by the real `build_gates` rather than written
    by hand: if the fixture hard-coded `pass` flags, a gate pointing the wrong
    way would agree with itself and the tests below would stay green.
    """
    rc = {"p_value": rc_p, "verdict": "PASS" if rc_p < 0.05 else "FAIL"}
    plateau_block = {
        "verdict": plateau,
        "worst_probe": worst_probe,
        "worst_drop_pct": worst_drop_pct,
    }
    result = {
        "hypothesis": "H2",
        "deflated_sharpe": {
            "dsr": dsr,
            "observed_sharpe": 1.0,
            "expected_max_sharpe_under_null": 0.4,
        },
        "n_trials_full_recorded": 93,
        "pbo": {"pbo": pbo},
        "white_reality_check": rc,
        "psr_locked_oos": {"psr": psr_oos},
        "parameter_plateau": plateau_block,
        "break_even_multiple": break_even,
        "locked_oos": {"sharpe": oos_sharpe, "cum_net": 0.2},
        "cost_stress": {"2.0x": {"cum_net": cum_net_2x}},
    }
    result["gates"] = g5.build_gates(dsr, pbo, psr_oos, rc, plateau_block, break_even)
    if tail_corr is not None:
        result["btc_tail_correlation"] = {"tail_correlation": tail_corr}
    return result


def test_gates_take_scalars_not_the_statistic_objects():
    """`build_gates` is called from `evaluate_hypothesis` with live objects in reach.

    Passing `DeflatedSharpe` instead of its `.dsr` raises TypeError inside round()
    at report time -- after the whole search has run. Pinning the argument type
    here keeps that mistake from reaching a 93-trial run again.
    """
    rc = {"p_value": 0.01, "verdict": "PASS"}
    plateau = {"verdict": "PLATEAU", "worst_probe": "plus20", "worst_drop_pct": 5.0}
    gates = g5.build_gates(0.97, 0.01, 0.98, rc, plateau, 4.0)
    assert gates["dsr"] == {"value": 0.97, "min": g5.DSR_MIN, "pass": True}

    class _Statistic:
        dsr = 0.97

    with pytest.raises(TypeError):
        g5.build_gates(_Statistic(), 0.01, 0.98, rc, plateau, 4.0)


def test_a_clean_hypothesis_has_no_rejection_reasons():
    assert g5.rejection_reasons("H2", _hypothesis()) == []


def test_pbo_at_or_above_the_audit_threshold_rejects():
    """0.1523 is the audit's number; the comparison must include it."""
    assert any("PBO" in r for r in g5.rejection_reasons("H2", _hypothesis(pbo=g5.PBO_REJECT_AT)))
    below = _hypothesis(pbo=g5.PBO_REJECT_AT - 1e-6)
    assert g5.rejection_reasons("H2", below) == []


def test_dsr_below_the_gate_rejects():
    low = _hypothesis(dsr=0.9499)
    assert any("DSR" in r for r in g5.rejection_reasons("H2", low))
    assert g5.rejection_reasons("H2", _hypothesis(dsr=g5.DSR_MIN)) == []


def test_plateau_spike_rejects():
    spike = _hypothesis(plateau="SPIKE", worst_probe="plus20", worst_drop_pct=40.0)
    reasons = g5.rejection_reasons("H2", spike)
    assert any("spike" in r.lower() for r in reasons)
    assert any("40.0" in r for r in reasons), "the offending neighbour must be named"


def test_reality_check_failure_rejects():
    failed = _hypothesis(rc_p=0.2)
    assert any("reality" in r.lower() for r in g5.rejection_reasons("H2", failed))


def test_break_even_below_the_cost_survival_bar_rejects():
    thin = _hypothesis(break_even=g5.COST_STRESS_MULTIPLE - 0.01)
    assert any("break-even" in r.lower() for r in g5.rejection_reasons("H2", thin))


def test_h1_net_sharpe_floor_binds_only_h1():
    """The 0.80 floor is H1's own clause, not a universal one."""
    weak = _hypothesis(oos_sharpe=0.5, cum_net_2x=-0.1)
    assert any("out-of-sample Sharpe" in r for r in g5.rejection_reasons("H1", weak))
    assert g5.rejection_reasons("H2", _hypothesis(oos_sharpe=0.5, cum_net_2x=0.1)) == []


def test_h1_two_times_cost_must_stay_profitable():
    """The audit words this as a sign test at 2.0x, separate from the Sharpe floor."""
    losing = _hypothesis(cum_net_2x=-0.001)
    assert any("2.0" in r for r in g5.rejection_reasons("H1", losing))
    assert g5.rejection_reasons("H2", _hypothesis(cum_net_2x=-0.001)) == []


def test_h1_tail_correlation_ceiling_is_exclusive_at_fifty_percent():
    at = _hypothesis(tail_corr=g5.H1_TAIL_CORR_MAX)
    assert g5.rejection_reasons("H1", at) == []
    over = _hypothesis(tail_corr=g5.H1_TAIL_CORR_MAX + 0.01)
    assert any("tail" in r.lower() for r in g5.rejection_reasons("H1", over))


def test_h1_without_a_tail_measurement_does_not_reject():
    """An absent cross-check is not a failed one; it is simply not run."""
    assert g5.rejection_reasons("H1", _hypothesis(tail_corr=None)) == []


def test_rejection_reasons_name_every_failing_clause():
    """A rejected hypothesis must report all its failures, not just the first.

    Stopping at the first failure would tell an analyst to fix one clause, re-run,
    and discover the next -- on a nine-clause rule that is a slow way to learn a
    hypothesis is dead. All three universal gates and both H1 clauses fail below,
    and each must appear.
    """
    bad = _hypothesis(
        dsr=0.2,
        pbo=0.9,
        psr_oos=0.1,
        rc_p=0.9,
        plateau="SPIKE",
        break_even=0.5,
        oos_sharpe=0.1,
        cum_net_2x=-0.2,
        tail_corr=0.9,
    )
    reasons = g5.rejection_reasons("H1", bad)
    joined = " | ".join(reasons).lower()
    for clause in ("dsr", "pbo", "psr", "reality check", "spike", "break-even", "tail correlation"):
        assert clause in joined, f"{clause} clause missing from {reasons}"
    assert len(reasons) == 9, f"expected every clause to fire, got {reasons}"


def test_plateau_check_perturbs_each_parameter_individually_and_jointly(monkeypatch):
    """Multi-parameter grids must probe one-at-a-time nudges as well as joint corners."""
    seen: list[dict] = []

    def fake_rerun(name: str, panel, params: dict, train_slice: slice):
        del name, panel
        seen.append(dict(params))
        return (np.full(200, 0.002) + np.arange(200) * 1e-6)[train_slice]

    monkeypatch.setattr(g5, "plateau_rerun", fake_rerun)
    params = {"lookback": 10, "entry_annual_bps": 300.0, "exit_annual_bps": 150.0}
    out = g5.plateau_check("H3", None, params, base_train_sr=2.0, split=140)

    tags = [p["probe"] for p in out["probes"]]
    assert tags == [
        "lookback_minus20",
        "lookback_plus20",
        "entry_annual_bps_minus20",
        "entry_annual_bps_plus20",
        "exit_annual_bps_minus20",
        "exit_annual_bps_plus20",
        "all_minus20",
        "all_plus20",
    ]
    # Single-parameter probes leave the other two parameters untouched.
    by_tag = {p["probe"]: p["params"] for p in out["probes"]}
    assert by_tag["lookback_minus20"] == {
        "lookback": 8,
        "entry_annual_bps": 300.0,
        "exit_annual_bps": 150.0,
    }
    assert by_tag["entry_annual_bps_plus20"] == {
        "lookback": 10,
        "entry_annual_bps": 360.0,
        "exit_annual_bps": 150.0,
    }


def test_evaluate_hypothesis_enforces_embargo_and_train_only_selection(monkeypatch):
    """Selection diagnostics (PBO/CPCV/WRC/DSR) must be invariant to locked-OOS returns,
    and locked OOS must exclude 2 * winner_lookback embargo days after split."""
    from verification_lab.runner import run_grid

    monkeypatch.setattr(
        g5,
        "plateau_check",
        lambda _name, _panel, _params, _base_train_sr, _split: {
            "verdict": "PLATEAU",
            "worst_probe": "all_plus20",
            "worst_drop_pct": 5.0,
            "probes": [],
        },
    )

    rng = np.random.default_rng(123)
    days = 600
    split = 420
    lookbacks = [10, 15, 20, 30]

    def make_runs(oos_corruption: float) -> list[dict]:
        runs = []
        base_rng = np.random.default_rng(123)
        for i, lb in enumerate(lookbacks):
            train_gross = base_rng.normal(0.0005 * (i + 1), 0.01, size=split)
            oos_gross = base_rng.normal(0.0003, 0.01, size=days - split) + oos_corruption
            gross = np.concatenate([train_gross, oos_gross])
            cost = np.full(days, 0.0001)
            net = gross - cost
            pos = pl.DataFrame({"day": range(days), "BTCUSDT": np.ones(days) * 0.5})
            runs.append(
                {
                    "params": {"lookback": lb, "target_vol_annual": 0.25},
                    "net": net,
                    "positions": pos,
                    "result": {
                        "net": net,
                        "gross": gross,
                        "cost": cost,
                        "turnover": np.full(days, 0.05),
                        "mean_turnover": 0.05,
                        "break_even_multiple": 2.5,
                    },
                }
            )
        return runs

    btc_arr = rng.normal(0.0, 0.02, size=days)
    dummy_btc = pl.DataFrame({"day": range(days), "BTCUSDT": btc_arr})
    panel = run_grid.Panel(
        perp_close=dummy_btc,
        perp_returns=dummy_btc,
        spot_close=dummy_btc,
        spot_returns=dummy_btc,
        funding=dummy_btc,
        basis=dummy_btc,
    )

    clean = g5.evaluate_hypothesis("H1", make_runs(0.0), 93, split, btc_arr, panel)
    shocked = g5.evaluate_hypothesis("H1", make_runs(-0.25), 93, split, btc_arr, panel)

    winner_lb = int(clean["winner_params"]["lookback"])
    assert clean["locked_oos"]["embargo_days"] == 2 * winner_lb
    assert clean["locked_oos"]["days"] == (days - split) - 2 * winner_lb
    # Selection diagnostics must be bit-identical regardless of OOS outcomes.
    assert clean["deflated_sharpe"] == shocked["deflated_sharpe"]
    assert clean["pbo"] == shocked["pbo"]
    assert clean["cpcv"] == shocked["cpcv"]
    assert clean["white_reality_check"] == shocked["white_reality_check"]
    assert clean["locked_oos"]["cum_net"] != shocked["locked_oos"]["cum_net"]
    # Survival gates (break-even, 2.0x cost stress, tail correlation) must bind on locked_oos,
    # so corrupting OOS flips break_even_multiple < 2.0 and cum_net_2x < 0 even when train is rich.
    assert shocked["locked_oos"]["break_even_multiple"] < 0.0
    assert shocked["gates"]["break_even_cost_multiple"]["value"] < 0.0
    assert shocked["cost_stress"]["2.0x"]["cum_net"] < 0.0
    assert any("break-even" in r.lower() for r in shocked["rejection_reasons"])
    assert any("2.0" in r for r in shocked["rejection_reasons"])
    assert clean["btc_tail_correlation"]["n"] == clean["locked_oos"]["days"]
