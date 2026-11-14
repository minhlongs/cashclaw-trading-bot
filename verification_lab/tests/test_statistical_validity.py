"""Invariants the verification lab's conclusions rest on.

These are not coverage tests. Each one pins a property that, if broken, would
make a reported number wrong in the direction of looking better: a Sharpe that
rises with annualisation instead of with skill, a bootstrap that pretends to
have more independent observations than it does, a trial count that can be
deflated to flatter a winner, or a backtest that changes its answer when the
same data is loaded twice.
"""

from __future__ import annotations

import numpy as np
import pytest

from verification_lab.stats.core import (
    cpcv,
    deflated_sharpe,
    min_track_record_length,
    probability_of_backtest_overfitting,
    sharpe_ratio,
)


def test_sharpe_annualises_by_the_square_root_of_the_period_count():
    """Doubling the periods per year must scale the ratio by exactly sqrt(2)."""
    rng = np.random.default_rng(3)
    returns = rng.normal(0.001, 0.01, size=800)
    daily = sharpe_ratio(returns, 1)
    annual = sharpe_ratio(returns, 365)
    assert annual == pytest.approx(daily * np.sqrt(365), rel=1e-12)


def test_sharpe_estimator_is_unbiased_in_record_length():
    """A fixed per-day edge must give the same expected annual Sharpe at any T.

    A single draw cannot test this: at T=500 the annualised sampling error is
    sqrt(365/500), so two independent series legitimately differ by ~1 Sharpe.
    The property lives in the expectation, so it is measured over an ensemble,
    and the tolerance is the standard error of that ensemble mean.
    """
    rng = np.random.default_rng(3)
    seeds = 60
    short = np.array(
        [sharpe_ratio(rng.normal(0.001, 0.01, size=500), 365) for _ in range(seeds)]
    )
    long = np.array(
        [sharpe_ratio(rng.normal(0.001, 0.01, size=5000), 365) for _ in range(seeds)]
    )
    # Both ensembles estimate the same population ratio; their SEs differ in size
    # but the gap between means is bounded by the sum of the two standard errors.
    se_gap = np.sqrt(
        short.var(ddof=1) / seeds + long.var(ddof=1) / seeds
    )
    gap = abs(short.mean() - long.mean())
    assert gap < 3.0 * se_gap, (
        "annualised Sharpe drifted with record length, which would mean the "
        f"annualisation factor is wrong; short={short.mean():.3f} "
        f"long={long.mean():.3f} gap={gap:.3f} vs 3SE={3 * se_gap:.3f}"
    )


def test_deflated_sharpe_falls_as_trial_count_rises():
    """More search must mean more deflation, never less."""
    rng = np.random.default_rng(11)
    returns = rng.normal(0.0008, 0.01, size=1500)
    values = [
        deflated_sharpe(returns, n_trials=n, periods_per_year=365).dsr
        for n in (1, 10, 100, 1000)
    ]
    assert values == sorted(values, reverse=True), (
        "DSR must be monotonically non-increasing in the number of trials; "
        f"got {values}"
    )


def test_deflated_sharpe_rejects_pure_noise():
    """A driftless series with a large search behind it must not look significant."""
    rng = np.random.default_rng(5)
    noise = rng.normal(0.0, 0.01, size=1000)
    result = deflated_sharpe(noise, n_trials=500, periods_per_year=365)
    assert result.dsr < 0.95


def test_pbo_is_high_for_strategies_with_no_ranking_information():
    """Independent noise strategies must overfit: the in-sample winner is luck."""
    rng = np.random.default_rng(7)
    matrix = rng.normal(0.0, 0.01, size=(20, 1200))
    result = probability_of_backtest_overfitting(matrix)
    assert result["pbo"] > 0.30, (
        "with no real ranking information the in-sample winner should land in the "
        f"bottom half out of sample most of the time; got PBO {result['pbo']}"
    )


def test_pbo_is_low_when_one_strategy_genuinely_dominates():
    """A strategy with a real, stable edge must survive the same test."""
    rng = np.random.default_rng(13)
    matrix = rng.normal(0.0, 0.01, size=(20, 1200))
    matrix[0] += 0.002
    result = probability_of_backtest_overfitting(matrix)
    assert result["pbo"] < 0.30, (
        f"a genuinely dominant strategy must not be flagged as overfit; got {result['pbo']}"
    )


def test_pbo_is_deterministic_for_a_fixed_matrix():
    """The same matrix must give the same number every time it is scored."""
    rng = np.random.default_rng(17)
    matrix = rng.normal(0.0, 0.01, size=(10, 800))
    runs = [probability_of_backtest_overfitting(matrix)["pbo"] for _ in range(3)]
    assert len(set(runs)) == 1, f"PBO varied across identical inputs: {runs}"


def test_cpcv_returns_a_distribution_not_a_single_path():
    """CPCV exists to give a distribution of Sharpe across paths; one path is a bug."""
    rng = np.random.default_rng(19)
    matrix = rng.normal(0.0005, 0.01, size=(6, 900))
    result = cpcv(matrix)
    assert result["n_paths"] > 1
    assert len(result["mean_path_sharpe"]) == matrix.shape[0]


def test_cpcv_path_sharpe_carries_real_dispersion():
    """A degenerate zero-width distribution would make every interval meaningless."""
    rng = np.random.default_rng(23)
    matrix = rng.normal(0.0005, 0.01, size=(6, 900))
    result = cpcv(matrix)
    assert any(v > 0 for v in result["std_path_sharpe"])


@pytest.mark.parametrize("n_splits", [3, 5])
def test_pbo_refuses_an_odd_split_count(n_splits: int):
    """CSCV needs complementary halves; an odd split cannot form them."""
    matrix = np.zeros((4, 400))
    with pytest.raises(ValueError):
        probability_of_backtest_overfitting(matrix, n_splits=n_splits)


def test_pbo_refuses_a_single_strategy():
    """Overfitting is a question about a family; one candidate has no family."""
    with pytest.raises(ValueError):
        probability_of_backtest_overfitting(np.zeros((1, 400)))


def test_deflated_sharpe_se_and_min_trl_are_coherent_in_per_period_units():
    """Mertens SE must be computed in per-period units and annualised once, matching MinTRL."""
    rng = np.random.default_rng(29)
    # Heavy-tailed skewed returns where annualising before squaring SR would explode SE by 365x.
    returns = rng.standard_t(df=5, size=1400) * 0.01 + 0.0012
    trial_var = 0.0004  # empirical variance of per-period trial Sharpes
    ds = deflated_sharpe(
        returns,
        n_trials=93,
        periods_per_year=365,
        trial_sr_variance=trial_var,
        confidence=0.95,
    )
    # Annualised SE around sqrt(365 / 1399) ~ 0.51 (never ~ 10-30 from double annualisation).
    assert 0.35 < ds.sr_std_error < 1.0
    min_trl = min_track_record_length(
        returns,
        n_trials=93,
        periods_per_year=365,
        trial_sr_variance=trial_var,
        confidence=0.95,
    )
    assert (returns.size >= min_trl) == ds.passes_95


def test_cpcv_annualises_fold_sharpes_and_purges_embargoes_fold_boundaries():
    """CPCV must report annualised Sharpes and drop boundary bars inside purge/embargo."""
    rng = np.random.default_rng(31)
    base = rng.normal(0.0006, 0.01, size=(3, 800))
    daily_cpcv = cpcv(base, n_groups=8, n_test_groups=2, purge=1, embargo=5, periods_per_year=1)
    annual_cpcv = cpcv(base, n_groups=8, n_test_groups=2, purge=1, embargo=5, periods_per_year=365)
    np.testing.assert_allclose(
        annual_cpcv["mean_path_sharpe"],
        np.array(daily_cpcv["mean_path_sharpe"]) * np.sqrt(365),
        rtol=1e-12,
    )

    # Plant extreme spikes strictly on interior fold boundaries inside [b0, b0 + embargo) and [b1 - purge, b1).
    # With purge=2 and embargo=6, interior test-after-train and test-before-train boundary bars are dropped.
    blocks = np.array_split(np.arange(800), 8)
    poisoned = base.copy()
    # Test combo (1, 6): block 1 follows train block 0 and precedes train block 2.
    b0 = int(blocks[1][0])
    b1 = int(blocks[1][-1]) + 1
    poisoned[:, b0 : b0 + 4] = -50.0
    poisoned[:, b1 - 2 : b1] = -50.0
    unpurged = cpcv(poisoned, n_groups=8, n_test_groups=2, purge=0, embargo=0, periods_per_year=365)
    purged = cpcv(poisoned, n_groups=8, n_test_groups=2, purge=2, embargo=6, periods_per_year=365)
    # When block 1 is in the test fold, unpurged absorbs the -50 shock while purged excludes it.
    assert purged["mean_path_sharpe"][0] > unpurged["mean_path_sharpe"][0] + 0.2

