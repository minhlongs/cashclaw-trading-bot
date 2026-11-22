# 11 — Release Readiness and Founder Decision

**Final Release Verdict:** **`READY_FOR_OWNER_QUANT_REVIEW`**
**§9 Falsification-First Decision:** **`REVISE_HYPOTHESIS`** (`H3_BASIS_CARRY_V2` under `PENDING_FRESH_OOS`)
**`H3_MAKER` Bot Runtime Applicability:** **`NOT_VERIFIED`** / **`ECONOMICALLY_DIFFERENT`**
**Governance Hold:** **`STOP AT FOUNDER REVIEW`** — Zero production, remote D1, live trading, G13, or G15 mutations permitted without explicit Founder sign-off.

## 1. Gate-by-Gate Verdict Summary

| Gate / Surface | Status | Key Evidence |
| --- | --- | --- |
| **Strategy Identity (§2 & §8)** | **`ECONOMICALLY_DIFFERENT`** (Gate **PASS**) | `h3-maker.ts` is 1-leg directional spot; blocked fail-closed by `evaluateStrategyIdentityGate()` (`34/34` tests) |
| **G2 — Data Provenance** | **Manifest PASS / Local Raw `BLOCKED_MISSING_DATA`** | `7,808` rows verified, `9/9` synthetic edge cases pass; 6 local parquet/snapshot files absent (`5` pytest blocked) |
| **G3 — Signal Determinism** | **`PASS_100_PCT_IDENTICAL`** | `20/20` process-restarted runs (20 PIDs, 2 Python 3.12 venvs), 1 SHA-256, zero LLM in path |
| **G4 — Causal Leakage** | **`PASS`** | `50/50` prefix-truncation invariance on both standalone & production `build_positions_maker`; `10/10` adversarial vectors caught |
| **G5 — Statistical Reproduction** | **DSR/Registry PASS / Empirical Null `BLOCKED_MISSING_DATA`** | `N=185` hash-chain verified; DSR `0.998774` vs `0.998772`; 3-trade holdout quarantined (`PENDING_FRESH_OOS`) |
| **G6 — Execution Economics** | **Oracle PASS / External Parity `NOT_VERIFIED`** | `10/10` Decimal failure modes `0.00000000` residual; Binance 2× OOS negative; Hyperliquid 2× thin; borrow APR turns negative at 5% (Binance) / 10% (Hyperliquid) |
| **G13 — Paper-Forward** | **Preserved Untouched (`OBSERVATION_ACTIVE_INCONCLUSIVE`)** | `elapsed_days: 0`, `genesis_utc: 2026-11-14T13:07:31.631351Z`, `live_trading_unlocked: false` |
| **G15 — Live Trading** | **LOCKED (`PAPER_ONLY`)** | `liveTradingUnlocked === false`, zero live order authority |

## 2. Founder Decision Options

### Option A — Approve `H3_BASIS_CARRY_V2` Prospective OOS + Venue Data Restoration (Recommended)
- Restore the 6 missing local parquet/snapshot files from the verified archive to clear `BLOCKED_MISSING_DATA` and execute empirical randomized-entry controls.
- Implement borrow APR and margin-liquidation modeling in Python Lab and `PaperForwardRunner` under `H3_BASIS_CARRY_V2`.
- Evaluate on an untouched prospective OOS window (`PENDING_FRESH_OOS`) with strict kill criteria (Report 09).

### Option B — Archive `H3_MAKER` Bot Runtime & Pivot to Hyperliquid-Only Research
- Deprecate/remove `src/tree/bot/strategies/h3-maker.ts` from bot runtime menus so directional spot execution is never conflated with two-leg basis carry.
- Restrict future basis-carry research exclusively to Hyperliquid (dropping Binance due to negative 2.0x OOS and 5% borrow APR sensitivity).

### Option C — Exit the H3 Basis-Carry Family
- Archive `H3_MAKER` and close `H3_BASIS_CARRY_V2` given low trade count (`n_trades=3` OOS), borrow APR vulnerability, and underperformance relative to the 4% APR cash-funding baseline (`+0.98%` vs `+6.35%`).

---
**STOP AT FOUNDER REVIEW.** Awaiting explicit owner quant decision on Option A, B, or C.
