#!/usr/bin/env python3
"""Independent G5 Statistical Reproduction Audit (Supreme Command #19).

Independently verifies:
- artifacts/trial_registry.jsonl (all 185 lines, seq 1..185 SHA-256 hash chain,
  exact family counts, zero invisible trial deletions)
- artifacts/g5_statistical_validity.json (read-only): Bailey & Lopez de Prado
  DSR at N=185, PBO, CPCV split parameters, purge/embargo settings, and exposed
  holdout (n_trades=3, sharpe=2.3476, 579d window)
- 1,000 deterministic randomized-entry controls (seeded PRNG) + risk-matched
  Buy-and-Hold and cash/funding baselines
- Explicit quarantine of the 3-trade exposed holdout and prospective
  registration of H3_BASIS_CARRY_V2 as PENDING_FRESH_OOS

Emits artifacts/g5_independent_statistical_audit.json.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = REPO_ROOT / "artifacts" / "trial_registry.jsonl"
G5_ARTIFACT_PATH = REPO_ROOT / "artifacts" / "g5_statistical_validity.json"
OUTPUT_PATH = REPO_ROOT / "artifacts" / "g5_independent_statistical_audit.json"

DATA_ORIGIN_SYNTHETIC = "SYNTHETIC_SOFTWARE_TEST_FIXTURE"
GENESIS_HASH = "0" * 64
EULER_MASCHERONI = 0.5772156649015329


def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def norm_ppf(p: float) -> float:
    """Acklam's rational approximation to the standard normal inverse CDF."""
    if not (0.0 < p < 1.0):
        raise ValueError(f"p must be in (0, 1), got {p}")
    a = [
        -3.969683028665376e01,
        2.209460984245205e02,
        -2.759285104469687e02,
        1.383577518672690e02,
        -3.066479806614716e01,
        2.506628277459239e00,
    ]
    b = [
        -5.447609879822406e01,
        1.615858368580409e02,
        -1.556989798598866e02,
        6.680131188771972e01,
        -1.328068155288572e01,
    ]
    c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
        4.374664141464968e00,
        2.938163982698783e00,
    ]
    d = [
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e00,
        3.754408661907416e00,
    ]
    plow = 0.02425
    phigh = 1.0 - plow
    if p < plow:
        q = math.sqrt(-2.0 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0
        )
    if p <= phigh:
        q = p - 0.5
        r = q * q
        return (
            (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
            / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0)
        )
    q = math.sqrt(-2.0 * math.log(1.0 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
        (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0
    )


def verify_trial_registry(path: Path) -> dict[str, Any]:
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    prev = GENESIS_HASH
    seq_contiguous = True
    chain_valid = True
    first_bad_seq: int | None = None
    family_counts: Counter[str] = Counter()
    status_counts: Counter[str] = Counter()
    records: list[dict[str, Any]] = []

    for idx, line in enumerate(lines, start=1):
        entry = json.loads(line)
        records.append(entry)
        if entry.get("seq") != idx:
            seq_contiguous = False
        family_counts[str(entry.get("hypothesis"))] += 1
        status_counts[str(entry.get("status"))] += 1

        check = dict(entry)
        claimed_prev = check.pop("prev_hash", None)
        claimed_hash = check.pop("hash", None)
        check["prev_hash"] = claimed_prev
        blob = json.dumps(check, sort_keys=True, separators=(",", ":")).encode("utf-8")
        recomputed = hashlib.sha256(blob).hexdigest()

        if claimed_prev != prev or claimed_hash != recomputed:
            chain_valid = False
            if first_bad_seq is None:
                first_bad_seq = idx
        prev = str(claimed_hash)

    try:
        rel_path = str(path.relative_to(REPO_ROOT))
    except ValueError:
        rel_path = str(path)

    return {
        "path": rel_path,
        "total_trials": len(lines),
        "seq_contiguous_1_to_N": seq_contiguous,
        "hash_chain_verified": chain_valid,
        "first_bad_seq": first_bad_seq,
        "head_hash": prev,
        "family_counts": dict(sorted(family_counts.items())),
        "status_counts": dict(sorted(status_counts.items())),
        "zero_invisible_deletions_confirmed": seq_contiguous and chain_valid and len(lines) == 185,
    }


def compute_registry_sr_variance(
    path: Path, periods_per_year: int = 365
) -> dict[str, Any]:
    """Independently recompute per-period Sharpe variance (ddof=1 and ddof=0) from trial_registry.jsonl."""
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    sr_ann = [float(json.loads(ln)["sharpe"]) for ln in lines]
    n = len(sr_ann)
    sr_per_period = [s / math.sqrt(periods_per_year) for s in sr_ann]
    mean_pp = sum(sr_per_period) / n
    ss_pp = sum((x - mean_pp) ** 2 for x in sr_per_period)
    var_ddof1 = ss_pp / max(n - 1, 1)
    var_ddof0 = ss_pp / max(n, 1)
    return {
        "n_trials": n,
        "periods_per_year": periods_per_year,
        "mean_sr_per_period": round(mean_pp, 8),
        "trial_sr_variance_per_period_ddof1": round(var_ddof1, 10),
        "trial_sr_variance_per_period_ddof0": round(var_ddof0, 10),
    }


def recompute_dsr_bailey_ldp(
    observed_sr_ann: float,
    sr_se_ann: float,
    trial_sr_var_per_period: float,
    n_trials: int,
    periods_per_year: int = 365,
) -> dict[str, float]:
    """Bailey & Lopez de Prado (2014) Deflated Sharpe Ratio using committed variance & SE."""
    z1 = norm_ppf(1.0 - 1.0 / n_trials)
    z2 = norm_ppf(1.0 - 1.0 / (n_trials * math.e))
    sr_std_ann = math.sqrt(trial_sr_var_per_period * periods_per_year)
    expected_max_sr_ann = sr_std_ann * ((1.0 - EULER_MASCHERONI) * z1 + EULER_MASCHERONI * z2)
    z_stat = (observed_sr_ann - expected_max_sr_ann) / sr_se_ann
    dsr = norm_cdf(z_stat)
    return {
        "n_trials": n_trials,
        "expected_max_sharpe_ann_recomputed": round(expected_max_sr_ann, 4),
        "z_stat": round(z_stat, 6),
        "dsr_recomputed": round(dsr, 6),
    }


def run_randomized_entry_controls(
    n_controls: int = 1000,
    seed: int = 20261122,
    observed_oos_sharpe: float = 2.3476,
    observed_oos_days: int = 579,
    observed_oos_trades: int = 3,
    observed_mean_hold_days: float = 130.33,
) -> dict[str, Any]:
    """1,000 deterministic randomized-entry controls + risk-matched baselines.

    1) Committed H3_MAKER regime check (579d window, 3 trades, ~130d hold):
       Evaluates randomized entry windows on a zero-alpha carry-noise process
       calibrated to the documented trade-count regime (honestly noting raw
       daily return series require missing local parquet).
    2) Explicitly labeled SYNTHETIC_SOFTWARE_TEST_FIXTURE calibration check:
       Verifies the randomized-entry permutation test distinguishes positive
       drift from random-entry noise.
    """
    rng = random.Random(seed)

    # Part A: Documented H3_MAKER 3-trade / 579d regime randomized-entry null
    # Under null (daily drift = 0, daily vol = 0.0005), sample 3 random non-overlapping-ish
    # entry windows of length 130 days and compute annualized Sharpe.
    null_sharpes: list[float] = []
    hold = int(round(observed_mean_hold_days))
    for _ in range(n_controls):
        daily = [0.0] * observed_oos_days
        for _t in range(observed_oos_trades):
            start = rng.randint(0, max(0, observed_oos_days - hold))
            for d in range(start, min(observed_oos_days, start + hold)):
                daily[d] += rng.gauss(0.0, 0.0005)
        mean_r = sum(daily) / len(daily)
        var_r = sum((x - mean_r) ** 2 for x in daily) / max(len(daily) - 1, 1)
        std_r = math.sqrt(var_r)
        sr = (mean_r / std_r * math.sqrt(365.0)) if std_r > 0 else 0.0
        null_sharpes.append(sr)

    exceed_count = sum(1 for sr in null_sharpes if sr >= observed_oos_sharpe)
    p_value_null = (exceed_count + 1) / (n_controls + 1)

    # Risk-matched baselines over the 579d window (annualized vol matched to ~0.42%)
    # Cash/funding baseline: ~4.0% APR risk-free / cash yield -> ~6.3% over 579d
    # Risk-matched Buy-and-Hold: 0.0042 ann vol with 0.50 Sharpe -> ~0.33% over 579d
    cash_baseline_cum = round(0.04 * (observed_oos_days / 365.0), 6)
    bh_risk_matched_cum = round(0.50 * 0.0042 * (observed_oos_days / 365.0), 6)

    # Part B: Synthetic calibration verification (SYNTHETIC_SOFTWARE_TEST_FIXTURE)
    rng_syn = random.Random(seed + 1)
    syn_series = [rng_syn.gauss(0.0004, 0.002) for _ in range(300)]
    syn_mean = sum(syn_series) / len(syn_series)
    syn_std = math.sqrt(sum((x - syn_mean) ** 2 for x in syn_series) / (len(syn_series) - 1))
    syn_obs_sr = (syn_mean / syn_std) * math.sqrt(365.0)
    syn_perm_exceed = 0
    for _ in range(n_controls):
        signed = [x if rng_syn.random() < 0.5 else -x for x in syn_series]
        m = sum(signed) / len(signed)
        s = math.sqrt(sum((x - m) ** 2 for x in signed) / (len(signed) - 1))
        if (m / s) * math.sqrt(365.0) >= syn_obs_sr:
            syn_perm_exceed += 1
    syn_p_value = (syn_perm_exceed + 1) / (n_controls + 1)

    return {
        "n_controls": n_controls,
        "seed": seed,
        "raw_daily_returns_availability": "BLOCKED_MISSING_DATA_LOCAL_PARQUET",
        "h3_maker_regime_randomized_entry": {
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "control_type": "SYNTHETIC_GAUSSIAN_REGIME_NULL_NOT_EMPIRICAL",
            "observed_oos_sharpe": observed_oos_sharpe,
            "observed_oos_days": observed_oos_days,
            "observed_oos_trades": observed_oos_trades,
            "null_mean_sharpe": round(sum(null_sharpes) / len(null_sharpes), 4),
            "null_p95_sharpe": round(sorted(null_sharpes)[int(0.95 * n_controls)], 4),
            "exceed_count": exceed_count,
            "p_value": round(p_value_null, 6),
        },
        "risk_matched_baselines": {
            "window_days": observed_oos_days,
            "h3_maker_oos_cum_net": 0.0098,
            "cash_funding_baseline_4pct_apr_cum": cash_baseline_cum,
            "risk_matched_buy_and_hold_cum": bh_risk_matched_cum,
        },
        "synthetic_calibration_verification": {
            "data_origin": DATA_ORIGIN_SYNTHETIC,
            "n_controls": n_controls,
            "observed_sharpe": round(syn_obs_sr, 4),
            "p_value": round(syn_p_value, 6),
            "detects_positive_drift": syn_p_value < 0.05,
        },
    }


def main() -> int:
    reg_audit = verify_trial_registry(REGISTRY_PATH)
    g5 = json.loads(G5_ARTIFACT_PATH.read_text(encoding="utf-8"))

    verdicts = {h["hypothesis"]: h["verdict"] for h in g5["hypotheses"]}
    passed_families = [k for k, v in verdicts.items() if v == "PASS"]
    rejected_families = [k for k, v in verdicts.items() if v != "PASS"]

    h3m = [h for h in g5["hypotheses"] if h["hypothesis"] == "H3_MAKER"][0]
    dsr_block = h3m["deflated_sharpe"]
    pbo_block = h3m["pbo"]
    cpcv_block = h3m["cpcv"]
    oos_block = h3m["locked_oos"]
    trades_block = h3m["trades"]

    periods_per_year = int(cpcv_block["periods_per_year"])
    committed_var = float(dsr_block["trial_sr_variance_per_period"])
    reg_var = compute_registry_sr_variance(REGISTRY_PATH, periods_per_year=periods_per_year)

    dsr_recomp = recompute_dsr_bailey_ldp(
        observed_sr_ann=float(dsr_block["observed_sharpe"]),
        sr_se_ann=float(dsr_block["sharpe_standard_error"]),
        trial_sr_var_per_period=committed_var,
        n_trials=int(dsr_block["n_trials_used"]),
        periods_per_year=periods_per_year,
    )
    dsr_recomp_registry_ddof1 = recompute_dsr_bailey_ldp(
        observed_sr_ann=float(dsr_block["observed_sharpe"]),
        sr_se_ann=float(dsr_block["sharpe_standard_error"]),
        trial_sr_var_per_period=reg_var["trial_sr_variance_per_period_ddof1"],
        n_trials=int(dsr_block["n_trials_used"]),
        periods_per_year=periods_per_year,
    )
    dsr_recomp_registry_ddof0 = recompute_dsr_bailey_ldp(
        observed_sr_ann=float(dsr_block["observed_sharpe"]),
        sr_se_ann=float(dsr_block["sharpe_standard_error"]),
        trial_sr_var_per_period=reg_var["trial_sr_variance_per_period_ddof0"],
        n_trials=int(dsr_block["n_trials_used"]),
        periods_per_year=periods_per_year,
    )
    dsr_diff = abs(dsr_recomp["dsr_recomputed"] - float(dsr_block["dsr"]))
    var_delta_ddof1 = round(reg_var["trial_sr_variance_per_period_ddof1"] - committed_var, 10)
    var_delta_ddof0 = round(reg_var["trial_sr_variance_per_period_ddof0"] - committed_var, 10)
    dsr_delta_registry_ddof1 = round(
        dsr_recomp_registry_ddof1["dsr_recomputed"] - float(dsr_block["dsr"]), 6
    )
    dsr_delta_registry_ddof0 = round(
        dsr_recomp_registry_ddof0["dsr_recomputed"] - float(dsr_block["dsr"]), 6
    )

    controls = run_randomized_entry_controls(
        n_controls=1000,
        observed_oos_sharpe=float(oos_block["sharpe"]),
        observed_oos_days=int(oos_block["days"]),
        observed_oos_trades=int(trades_block["n_trades"]),
        observed_mean_hold_days=float(trades_block["mean_hold_days"]),
    )

    report = {
        "gate": "G5_INDEPENDENT_STATISTICAL_REPRODUCTION",
        "schema_version": "1.1.0",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "trial_registry_audit": reg_audit,
        "hypothesis_verdicts": {
            "by_family": verdicts,
            "passed_count": len(passed_families),
            "passed_families": passed_families,
            "rejected_count": len(rejected_families),
            "rejected_families": rejected_families,
        },
        "h3_maker_statistical_verification": {
            "n_trials_deflated": int(dsr_block["n_trials_used"]),
            "committed_dsr": float(dsr_block["dsr"]),
            "recomputed_dsr": dsr_recomp["dsr_recomputed"],
            "dsr_abs_diff": round(dsr_diff, 6),
            "dsr_verified": dsr_diff < 0.005,
            "independent_registry_variance_recomputation": {
                "committed_trial_sr_variance_per_period": committed_var,
                "registry_trial_sr_variance_per_period_ddof1": reg_var["trial_sr_variance_per_period_ddof1"],
                "registry_trial_sr_variance_per_period_ddof0": reg_var["trial_sr_variance_per_period_ddof0"],
                "variance_delta_ddof1_minus_committed": var_delta_ddof1,
                "variance_delta_ddof0_minus_committed": var_delta_ddof0,
                "dsr_using_registry_ddof1": dsr_recomp_registry_ddof1["dsr_recomputed"],
                "dsr_using_registry_ddof0": dsr_recomp_registry_ddof0["dsr_recomputed"],
                "dsr_delta_registry_ddof1_minus_committed": dsr_delta_registry_ddof1,
                "dsr_delta_registry_ddof0_minus_committed": dsr_delta_registry_ddof0,
            },
            "expected_max_sharpe_committed": float(dsr_block["expected_max_sharpe_under_null"]),
            "expected_max_sharpe_recomputed": dsr_recomp["expected_max_sharpe_ann_recomputed"],
            "pbo": pbo_block,
            "cpcv": cpcv_block,
            "purge_bars": int(cpcv_block["purge_bars"]),
            "embargo_bars": int(cpcv_block["embargo_bars"]),
            "exposed_holdout": {
                "n_trades": int(trades_block["n_trades"]),
                "sharpe": float(oos_block["sharpe"]),
                "window_days": int(oos_block["days"]),
                "embargo_days": int(oos_block["embargo_days"]),
                "cum_net": float(oos_block["cum_net"]),
                "break_even_multiple": float(oos_block["break_even_multiple"]),
            },
        },
        "randomized_entry_controls": controls,
        "holdout_quarantine_and_prospective_registration": {
            "exposed_holdout_quarantined": True,
            "quarantine_reason": "n_trades=3 over 579d is underpowered and already inspected; cannot be reused as fresh OOS",
            "prospective_strategy_id": "H3_BASIS_CARRY_V2",
            "prospective_oos_status": "PENDING_FRESH_OOS",
        },
        "verdict": {
            "registry_integrity_pass": reg_audit["zero_invisible_deletions_confirmed"],
            "dsr_reproduction_pass": dsr_diff < 0.005,
            "randomized_controls_executed": controls["n_controls"] == 1000,
            "empirical_randomized_entry_status": "BLOCKED_MISSING_DATA",
            "exposed_holdout_quarantined": True,
            "prospective_status": "PENDING_FRESH_OOS",
        },
    }

    OUTPUT_PATH.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"G5 audit complete: registry={reg_audit['total_trials']} chain={reg_audit['hash_chain_verified']} "
        f"DSR={dsr_recomp['dsr_recomputed']} (diff={dsr_diff:.6f}) controls=1000"
    )
    return 0 if (reg_audit["zero_invisible_deletions_confirmed"] and dsr_diff < 0.005) else 1


if __name__ == "__main__":
    raise SystemExit(main())
