# 06 — G5 Independent Statistical Reproduction Audit

**Artifact:** `artifacts/g5_independent_statistical_audit.json` (SHA-256 `c9dd053d277c235ff247048bff6bcf0f7d97777b523c7cf450644654bdfa6848`)
**Audit Script:** `verification_lab/scripts/audit_g5_statistical_reproduction.py`
**Verdict:** `registry_integrity_pass: true` | `dsr_reproduction_pass: true` | `exposed_holdout_quarantined: true` | `empirical_randomized_entry_status: BLOCKED_MISSING_DATA` | `prospective_status: PENDING_FRESH_OOS`

## 1. Hash-Chained Trial Registry Integrity (`N = 185`)

Audited `artifacts/trial_registry.jsonl` (SHA-256 `37ee9db5c0bf0aba14558b5d370dc2fb42c3455a56dfa7d134727206c0c1373d`):
- `total_trials: 185` (`completed: 185`), `seq_contiguous_1_to_N: true`, `first_bad_seq: null`
- `hash_chain_verified: true`, `head_hash: dc6c8ec2c63203175fc5ca26bd85a0170abda71228fbb74bd0932cf1cc027236`
- `zero_invisible_deletions_confirmed: true`
- Family counts: `H1: 30`, `H1_G1: 32`, `H2: 15`, `H2_G1: 24`, `H3: 48`, `H3_MAKER: 36` (`Σ = 185`)
- Hypothesis verdicts: **5 REJECT** (`H1`, `H2`, `H3`, `H1_G1`, `H2_G1`), **1 PASS** (`H3_MAKER`)

## 2. Independent Bailey & Lopez de Prado DSR and PBO Verification

| Metric | Committed (`g5_statistical_validity.json`) | Independent Recomputation | Delta |
| --- | --- | --- | --- |
| `n_trials_deflated` | `185` | `185` | `0` |
| `expected_max_sharpe` | `4.7672` | `4.7672` | `0.0000` |
| `DSR` (committed variance `0.0082938`) | `0.998772` | `0.998774` | `2e-06` (`dsr_verified: true`) |
| `DSR` (registry `ddof=1`, var `0.0082692583`) | `0.998772` | `0.998868` | `+9.6e-05` |
| `DSR` (registry `ddof=0`, var `0.0082245596`) | `0.998772` | `0.999023` | `+0.000251` |
| `PBO` (`16` splits, `36` strategies, `300` combos, `1,491` obs) | `0.033333` | `0.033333` | `0.0000` |
| CPCV (`28` paths, `purge=1`, `embargo=30`, `365/yr`) | mean `6.4615`, std `3.0305`, p05 `0.6561`, p95 `9.8976` | Verified | — |

## 3. Exposed Holdout Quarantine (`n_trades = 3`)

The committed `H3_MAKER` holdout window (`579` days, `embargo_days: 60`) contains only **`n_trades = 3`** (`sharpe: 2.3476`, `cum_net: 0.0098`, `break_even_multiple: 3.2037`). Because 3 trades over 579 days is severely underpowered and has already been inspected, it is **formally quarantined** (`exposed_holdout_quarantined: true`) and cannot be reused as fresh OOS.

## 4. Randomized Entry Controls and Risk-Matched Baselines

- **Empirical Randomized Entry:** `BLOCKED_MISSING_DATA` (`raw_daily_returns_availability: BLOCKED_MISSING_DATA_LOCAL_PARQUET`).
- **Synthetic Gaussian Regime Null Control (`n_controls: 1,000`, `seed: 20261122`, `SYNTHETIC_SOFTWARE_TEST_FIXTURE`):** `null_mean_sharpe: -0.026`, `null_p95_sharpe: 1.3882`, `exceed_count: 1`, `p_value: 0.001998` against observed OOS Sharpe `2.3476`. Calibration check confirmed positive drift detection (`observed_sharpe: 2.4559`, `p_value: 0.012987`).
- **Risk-Matched Baselines (`579d` window):**
  - `h3_maker_oos_cum_net`: `0.0098` (`+0.98%`)
  - `risk_matched_buy_and_hold_cum`: `0.003331` (`+0.33%`)
  - `cash_funding_baseline_4pct_apr_cum`: `0.063452` (`+6.35%`) — notably, a simple 4% APR cash-funding baseline materially outperformed `H3_MAKER` OOS cumulative net return over the 579-day window.

## 5. Prospective Registration (`H3_BASIS_CARRY_V2`)

Any revised strategy must be evaluated under `prospective_strategy_id: "H3_BASIS_CARRY_V2"` with `prospective_oos_status: "PENDING_FRESH_OOS"` on untouched post-quarantine data.
