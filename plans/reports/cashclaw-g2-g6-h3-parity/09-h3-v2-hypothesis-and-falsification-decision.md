# 09 — `H3_BASIS_CARRY_V2` Hypothesis and Falsification-First Decision (§9)

**Falsification-First Decision:** **`REVISE_HYPOTHESIS`** (not `BUILD_OFFLINE_CANDIDATE`)
**Candidate ID:** `H3_BASIS_CARRY_V2`
**Research Status:** `PENDING_FRESH_OOS` | `paper_forward_allowed: false` | `live_order_authority: false` | `exposed_holdout_quarantined: true`

## 1. Rationale for `REVISE_HYPOTHESIS`

Advancing directly to `BUILD_OFFLINE_CANDIDATE` is rejected on five empirical and structural grounds:
1. **Missing Raw Data:** Six local parquet/snapshot files are absent (`BLOCKED_MISSING_DATA`), blocking empirical randomized-entry testing and full parquet replay.
2. **Negative Binance 2.0x OOS Economics:** Binance locked OOS expectancy at 2.0x cost is negative at both floor (`-0.000002`, BE `1.9992x`) and ceiling (`-0.000762`, BE `1.7236x`).
3. **Thin Hyperliquid 2.0x OOS Margin:** Hyperliquid locked OOS at 2.0x ceiling is barely positive (`+0.000071`, BE `2.0304x`) and turns negative at 3.0x (`-0.002269`), on only `n_trades = 3`.
4. **Borrow Cost Sensitivity:** Under realistic venue-calibrated funding APR, Binance turns net-negative at `5%` borrow APR (`-$47.76`) and Hyperliquid turns net-negative at `10%` borrow APR (`-$21.85`), while neither the Python Lab nor G13 Harness models borrow financing.
5. **Unmodeled Margin Liquidation & Underperformance vs Cash Baseline:** Neither production research code nor G13 models short-perp margin liquidation (`G6-FM-10`), and `H3_MAKER` OOS cumulative net return (`+0.98%`) trailed a 4% APR cash-funding baseline (`+6.35%`) over the 579-day window.

## 2. Formal `H3_BASIS_CARRY_V2` Specification & Prospective Protocol

Before `H3_BASIS_CARRY_V2` can be promoted to `BUILD_OFFLINE_CANDIDATE` or paper-forward observation:
- **Venue Scope:** Hyperliquid primary (or explicit net-of-borrow hurdle exceeding venue borrow APR + 2.0x execution cost).
- **Mandatory Cost Model Additions:** Explicit borrow/financing APR accrual and short-perp maintenance-margin liquidation guard in both Python Lab and TypeScript `PaperForwardRunner`.
- **Strategy Identity Gate:** Must pass `evaluateStrategyIdentityGate()` with `ECONOMICALLY_IDENTICAL` and `oosStatus: 'UNTOUCHED_FRESH_OOS'`.
- **Prospective Fresh OOS:** Must be evaluated on an untouched post-quarantine OOS window (`PENDING_FRESH_OOS`), never reusing the quarantined 3-trade `H3_MAKER` holdout.

## 3. Concrete Kill / Exit Criteria

`H3_BASIS_CARRY_V2` must be immediately archived (`ARCHIVED_FALSIFIED`) if any of the following occur on restored empirical data or fresh OOS:
- Fresh OOS `n_trades < 15` (underpowered sample).
- Deflated Sharpe Ratio `DSR < 0.95` across cumulative `trial_registry.jsonl` (`N >= 185 + new_trials`).
- Net expectancy at `2.0x` cost ceiling `<= 0` after realistic venue borrow APR (`>= 5%` Binance / `>= 5%` Hyperliquid).
- Empirical randomized-entry `p_value >= 0.05` on restored daily returns.
- Net cumulative return trails the risk-matched 4% APR cash-funding baseline over the fresh OOS window.
