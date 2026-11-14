# Orchestration Report — Issue #63 (H3_MAKER Millisecond L2/aggTrades Calibration, H1/H2/H3 Archival & Gate G13 Day-0 Clock)

- **Date:** 2026-11-14
- **Branch:** `feat/h3-maker-l2-calibration-g13-and-archive` (based on `origin/main` `3d56c1e`)
- **Issue Resolved:** `#63` (Millisecond L2/aggTrades FIFO queue calibration for `H3_MAKER`, formal `ARCHIVED_FALSIFIED` freeze of `H1/H2/H3/H1_G1/H2_G1`, SHA-256 `SignedStrategySpec`, pure Open-Core TypeScript `PaperForwardRunner` & `< 15 bps/mo` `TrackingErrorReconciler`, and Gate G13 Day-0 observation launch)
- **Safety Posture:** `PAPER/BACKTEST ONLY` — `liveTradingUnlocked = false`, `G15` human sign-off remains `HARD-LOCKED`, `elapsed_days = 0 / 60` (`OBSERVATION_ACTIVE_INCONCLUSIVE`).

## 1. Outcome Summary

1. **Millisecond L2 `bookDepth` + `perp/spot aggTrades` FIFO Queue & Adverse-Selection Calibration (`artifacts/h3_maker_tick_queue_calibration.json`, `artifacts/g6_execution_tca.json`):**
   - Replayed `1,966,007` millisecond trade prints (`1,076,706` perp + `889,301` spot `aggTrades`) and `19,895` L2 `bookDepth` snapshots across `21` `.CHECKSUM`-verified `data.binance.vision` archives (`--offline` deterministic).
   - **Train calibration (`5` active `H3_MAKER` rebalance days `<= 2024-12-31`, zero OOS leakage):** `empirical_p_fill = 0.7750` (`300s`) / `0.8667` (`900s`), `empirical_adverse_selection_bps = 3.2334..5.7149 bps`, `empirical_p_leg_miss = 0.3750..0.5000`, and `empirical_emergency_taker_half_spread_bps = 1.0373 bps` median / `3.0422 bps` p90 ceiling (`24.0×` tighter than the `24.8772 bps` 4h Corwin–Schultz range proxy).
   - **Locked-OOS holdout verification (`BNBUSDT` `2025-07-26` & `2026-03-06`):** `empirical_p_fill = 0.8750`, `empirical_adverse_selection_bps = 1.7409..1.7908 bps`, `empirical_p_leg_miss = 0.3125..0.3958`, `empirical_emergency_taker_half_spread_bps = 0.2816..1.1679 bps`.
   - On primary venue **Hyperliquid VIP-0** (`4.0 / 1.5 bps` maker), `H3_MAKER` clears `>= 2.0×` across all four tick-calibrated cells (`locked_oos` BE `2.4634× / 2.0304×` under train bounds; `2.7955× / 2.6420×` under OOS ticks).

2. **Formal Strategy Archival (`artifacts/strategy_lifecycle_registry.json`, `src/tree/paper-forward/spec-guard.ts`):**
   - Permanently froze `H1`, `H2`, `H3` (taker), `H1_G1`, and `H2_G1` as `ARCHIVED_FALSIFIED` (`paper_forward_allowed: false`), enforced fail-closed in both Python (`PermissionError`) and TypeScript (`PaperForwardGuardError('STRATEGY_ARCHIVED_FALSIFIED')`).

3. **Signed Immutable Strategy Spec & Gate G13 Day-0 Clock (`artifacts/signed_strategy_spec_h3_maker.json`, `artifacts/g13_paper_tracking_error.json`, `src/tree/paper-forward/**`, `docs/governance/g13_g15_paper_forward_runbook.md`):**
   - Emitted `signed_strategy_spec_h3_maker.json` (`payloadSha256: 43ac1c5bec688103...`, verified bit-identical across Python and TypeScript).
   - Proved `0.00000006 bps/month` (`< 15.0 bps/mo`) 90-day shadow tracking error between CashClaw's integer satoshi/micro-USD `MicroDoubleEntryLedger` and Python `Decimal(prec=50)` `event_ledger_oracle` across `106` orders and `5,130` funding settlements.
   - Launched Gate G13 honestly at Day 0 (`elapsed_days = 0 < 60`, `status: "OBSERVATION_ACTIVE_INCONCLUSIVE"`, `g13_pass: false`, `live_trading_unlocked: false`).

## 2. Verification & Isolated Review Evidence

- `verification_lab/.labenv/bin/pytest verification_lab/tests -q`: **165/165 passed**
- `npm run quality:gate` + `npm run build`: **742/742 test files (`6,252/6,252` tests) passed**, overall coverage **94.48% statements / 91.45% branches / 95.35% functions / 94.48% lines** (`src/tree/paper-forward/**`: `100%` stmts / `99.39%` branches / `100%` funcs / `100%` lines), `0` warnings, `0` Knip issues
- Isolated `code-reviewer` (`opus`): Round 2 verified **`Status: DONE`** (`0` BLOCKER, `0` HIGH, `0` MEDIUM).

## 3. Unresolved Questions

- None blocking merge; Gate G13 now accumulates real wall-clock observation days (`>= 60` required, `90` target) via `g13_paper_forward.py --paper-nav ... --oracle-nav ...`, while Gate G15 (`liveTradingUnlocked: false`) remains exclusively under human owner control at Day 90.
