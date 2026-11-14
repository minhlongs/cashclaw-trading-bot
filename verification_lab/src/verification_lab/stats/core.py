"""Multiple-testing statistics for strategy evaluation.

Everything here assumes the caller supplies the true number of trials. That is
the point: the audit's central statistical objection is that a Sharpe ratio was
quoted without the search that produced it. A function that quietly assumed
n_trials=1 would reproduce the exact error being audited, so n_trials is a
required argument everywhere.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

EULER_GAMMA = 0.5772156649015329


def sharpe_ratio(returns: np.ndarray, periods_per_year: int, ddof: int = 1) -> float:
    """Annualised Sharpe of a periodic return series, risk-free assumed zero."""
    r = np.asarray(returns, dtype=float)
    r = r[~np.isnan(r)]
    if r.size < 2:
        return float("nan")
    sd = r.std(ddof=ddof)
    if sd == 0:
        return float("nan")
    return float(r.mean() / sd * math.sqrt(periods_per_year))


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_ppf(p: float) -> float:
    """Acklam's rational approximation; adequate for p in (1e-9, 1-1e-9)."""
    if not 0.0 < p < 1.0:
        raise ValueError("p must be in (0,1)")
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
         3.754408661907416e+00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)


@dataclass(frozen=True)
class DeflatedSharpe:
    observed_sr: float
    expected_max_sr: float
    dsr: float
    n_trials: int
    n_observations: int
    sr_std_error: float
    passes_95: bool
    threshold: str


def _mertens_variance_factor(r: np.ndarray, sr_per_period: float) -> float:
    """Non-normality variance multiplier 1 - skew*SR + ((kurt - 1)/4)*SR^2 (Mertens 2002).

    `sr_per_period` must be in per-period units (matching `r`), never annualised:
    annualising before squaring would inflate the `SR^2` term by `periods_per_year`.
    """
    sd = float(r.std(ddof=1))
    if sd <= 0.0:
        return 1.0
    z = (r - float(r.mean())) / sd
    skew = float(np.mean(z**3))
    kurt = float(np.mean(z**4))
    return max(1e-12, 1.0 - skew * sr_per_period + ((kurt - 1.0) / 4.0) * (sr_per_period**2))


def deflated_sharpe(
    returns: np.ndarray,
    *,
    n_trials: int,
    periods_per_year: int,
    trial_sr_variance: float | None = None,
    confidence: float = 0.95,
) -> DeflatedSharpe:
    """Bailey & Lopez de Prado (2014) Deflated Sharpe Ratio.

    PSR/SR0 form: the observed per-period Sharpe is compared against the maximum
    per-period Sharpe expected across `n_trials` trials under Mertens' skew/kurtosis
    standard error, then reported in annualised Sharpe units. `trial_sr_variance` is
    the variance of per-period Sharpe ratios across the searched trials; when not
    supplied, a fallback of `1.0 / T` is used.
    """
    r = np.asarray(returns, dtype=float)
    r = r[~np.isnan(r)]
    t = r.size
    if t < 30:
        raise ValueError(f"need at least 30 observations, got {t}")
    if n_trials < 1:
        raise ValueError("n_trials must be >= 1")
    sd = float(r.std(ddof=1))
    if sd == 0.0:
        return DeflatedSharpe(
            observed_sr=0.0,
            expected_max_sr=0.0,
            dsr=0.0,
            n_trials=n_trials,
            n_observations=int(t),
            sr_std_error=float("nan"),
            passes_95=False,
            threshold=f"DSR >= {confidence}",
        )

    sr_per_period = float(r.mean()) / sd
    annual_scale = math.sqrt(periods_per_year)
    sr_annual = sr_per_period * annual_scale

    var_per_period = 1.0 / t if trial_sr_variance is None else max(0.0, float(trial_sr_variance))
    # Expected maximum of n_trials standard normals, scaled by per-period trial SR std.
    if n_trials == 1:
        expected_max_z = 0.0
    else:
        expected_max_z = (
            (1 - EULER_GAMMA) * _norm_ppf(1 - 1.0 / n_trials)
            + EULER_GAMMA * _norm_ppf(1 - 1.0 / (n_trials * math.e))
        )
    sr0_per_period = expected_max_z * math.sqrt(var_per_period)
    sr0_annual = sr0_per_period * annual_scale

    # Mertens (2002) / Bailey & Lopez de Prado (2014) per-period SE, annualised once.
    mertens = _mertens_variance_factor(r, sr_per_period)
    se_per_period = math.sqrt(mertens / (t - 1))
    se_annual = se_per_period * annual_scale

    z = (sr_per_period - sr0_per_period) / se_per_period if se_per_period > 0 else float("nan")
    dsr = _norm_cdf(z)

    return DeflatedSharpe(
        observed_sr=sr_annual,
        expected_max_sr=sr0_annual,
        dsr=dsr,
        n_trials=n_trials,
        n_observations=int(t),
        sr_std_error=se_annual,
        passes_95=bool(dsr >= confidence),
        threshold=f"DSR >= {confidence}",
    )


def min_track_record_length(
    returns: np.ndarray,
    *,
    n_trials: int,
    periods_per_year: int,
    target_sr_annual: float | None = None,
    confidence: float = 0.95,
    trial_sr_variance: float | None = None,
) -> float:
    """MinTRL in observations (days for daily series): count needed so DSR >= `confidence`.

    Uses the same Mertens skew/kurtosis adjustment and per-period `trial_sr_variance`
    as `deflated_sharpe`, so `t >= min_track_record_length(...)` iff `dsr >= confidence`.
    Returns inf when the target Sharpe does not exceed the deflated benchmark SR0.
    """
    r = np.asarray(returns, dtype=float)
    r = r[~np.isnan(r)]
    if r.size < 2 or float(r.std(ddof=1)) == 0.0:
        return float("inf")
    annual_scale = math.sqrt(periods_per_year)
    sr_obs_p = float(r.mean() / r.std(ddof=1))
    sr_annual = sr_obs_p * annual_scale
    if target_sr_annual is None:
        target_sr_annual = sr_annual

    var_per_period = 1.0 / r.size if trial_sr_variance is None else max(0.0, float(trial_sr_variance))
    if n_trials <= 1:
        expected_max_z = 0.0
    else:
        expected_max_z = (
            (1 - EULER_GAMMA) * _norm_ppf(1 - 1.0 / n_trials)
            + EULER_GAMMA * _norm_ppf(1 - 1.0 / (n_trials * math.e))
        )
    sr0_p = expected_max_z * math.sqrt(var_per_period)
    sr_p = target_sr_annual / annual_scale

    excess_p = sr_p - sr0_p
    if excess_p <= 0:
        return float("inf")

    z_alpha = _norm_ppf(confidence)
    mertens = _mertens_variance_factor(r, sr_p)
    n_obs = 1.0 + mertens * (z_alpha / excess_p) ** 2
    return float(n_obs)


def probability_of_backtest_overfitting(
    returns_matrix: np.ndarray, n_splits: int = 16, seed: int = 7
) -> dict:
    """CSCV-style PBO (Bailey et al. 2016).

    Splits the time axis into n_splits contiguous blocks, enumerates
    complementary in-sample/out-of-sample combinations, picks the in-sample
    winner on Sharpe and checks whether it lands in the bottom half of
    out-of-sample. PBO is the frequency of that failure.
    """
    m = np.asarray(returns_matrix, dtype=float)
    if m.ndim != 2:
        raise ValueError("returns_matrix must be strategies x periods")
    n_strats, t = m.shape
    if n_splits % 2:
        raise ValueError("n_splits must be even")
    if t < n_splits * 2:
        raise ValueError("not enough observations for the requested split count")
    if n_strats < 2:
        raise ValueError("need at least 2 strategies")

    blocks = np.array_split(np.arange(t), n_splits)
    combos = []
    from itertools import combinations
    for idx in combinations(range(n_splits), n_splits // 2):
        combos.append(idx)
    rng = np.random.default_rng(seed)
    if len(combos) > 300:
        pick = rng.choice(len(combos), size=300, replace=False)
        combos = [combos[i] for i in pick]

    logits = []
    for idx in combos:
        is_idx = np.concatenate([blocks[i] for i in idx])
        oos_idx = np.concatenate([blocks[i] for i in range(n_splits) if i not in idx])
        is_sr = np.array([_sr(m[s, is_idx]) for s in range(n_strats)])
        oos_sr = np.array([_sr(m[s, oos_idx]) for s in range(n_strats)])
        winner = int(np.nanargmax(is_sr))
        rank = int(np.sum(oos_sr <= oos_sr[winner]))  # 1 = worst
        omega = rank / n_strats
        omega = min(max(omega, 1e-6), 1 - 1e-6)
        logits.append(math.log(omega / (1 - omega)))

    logits = np.array(logits)
    return {
        "pbo": float(np.mean(logits <= 0)),
        "n_combinations": int(len(logits)),
        "n_splits": int(n_splits),
        "n_strategies": int(n_strats),
        "n_observations": int(t),
    }


def _sr(x: np.ndarray) -> float:
    sd = x.std(ddof=1)
    return float("nan") if sd == 0 else float(x.mean() / sd)


def cpcv(
    returns_matrix: np.ndarray,
    n_groups: int = 8,
    n_test_groups: int = 2,
    seed: int = 11,
    *,
    purge: int = 1,
    embargo: int = 0,
    periods_per_year: int = 365,
) -> dict:
    """Combinatorial purged cross-validation annualised path Sharpe distribution.

    At every boundary between a test block and a train block, `purge` observations
    on both sides of the split point are removed to break return overlap, and
    `embargo` observations immediately following the boundary (`test` bars right
    after `train`, and `train` bars right after `test`) are removed so trailing
    feature state cannot leak across folds. Fold Sharpes are annualised by
    `sqrt(periods_per_year)`.
    """
    from itertools import combinations

    m = np.asarray(returns_matrix, dtype=float)
    n_strats, t = m.shape
    if n_test_groups >= n_groups:
        raise ValueError("n_test_groups must be < n_groups")
    if purge < 0 or embargo < 0:
        raise ValueError("purge and embargo must be >= 0")
    blocks = np.array_split(np.arange(t), n_groups)
    rng = np.random.default_rng(seed)
    all_combos = list(combinations(range(n_groups), n_test_groups))
    if len(all_combos) > 200:
        all_combos = [all_combos[i] for i in rng.choice(len(all_combos), 200, replace=False)]

    annual_scale = math.sqrt(periods_per_year)
    test_set_cache: set[int]
    paths = []
    for idx in all_combos:
        test_set_cache = set(idx)
        train_keep = np.ones(t, dtype=bool)
        test_keep = np.ones(t, dtype=bool)
        for i in idx:
            block = blocks[i]
            if block.size == 0:
                continue
            b0 = int(block[0])
            b1 = int(block[-1]) + 1
            # Boundary where a train block precedes this test block:
            if i > 0 and (i - 1) not in test_set_cache:
                if purge > 0:
                    train_keep[max(0, b0 - purge) : b0] = False
                post_gap = max(purge, embargo)
                if post_gap > 0:
                    test_keep[b0 : min(t, b0 + post_gap)] = False
            # Boundary where this test block precedes a train block:
            if (i + 1) < n_groups and (i + 1) not in test_set_cache:
                if purge > 0:
                    test_keep[max(0, b1 - purge) : b1] = False
                post_gap = max(purge, embargo)
                if post_gap > 0:
                    train_keep[b1 : min(t, b1 + post_gap)] = False

        raw_test = np.concatenate([blocks[i] for i in idx])
        raw_train = np.concatenate([blocks[i] for i in range(n_groups) if i not in test_set_cache])
        test_idx = raw_test[test_keep[raw_test]]
        train_idx = raw_train[train_keep[raw_train]]
        if train_idx.size < 30 or test_idx.size < 30:
            continue
        paths.append([_sr(m[s, test_idx]) * annual_scale for s in range(n_strats)])

    arr = np.array(paths)
    if arr.size == 0:
        raise ValueError("no valid CPCV folds remained after purging/embargo")
    return {
        "n_paths": int(arr.shape[0]),
        "n_groups": int(n_groups),
        "n_test_groups": int(n_test_groups),
        "purge_bars": int(purge),
        "embargo_bars": int(embargo),
        "periods_per_year": int(periods_per_year),
        "mean_path_sharpe": [float(np.nanmean(arr[:, s])) for s in range(n_strats)],
        "std_path_sharpe": [float(np.nanstd(arr[:, s])) for s in range(n_strats)],
        "p05_path_sharpe": [float(np.nanpercentile(arr[:, s], 5)) for s in range(n_strats)],
        "p95_path_sharpe": [float(np.nanpercentile(arr[:, s], 95)) for s in range(n_strats)],
    }
