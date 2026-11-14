# Plan: Issue #63 — H3_MAKER Millisecond L2/aggTrades Queue Calibration, H1/H2/H3 Formal Archival & Gate G13 Paper-Forward Clock Launch

- **Date:** 2026-11-14
- **Branch:** `feat/h3-maker-l2-calibration-g13-and-archive` (based on `origin/main` `3d56c1e`)
- **Issue:** `#63` (`in progress`)
- **Safety Posture:** `PAPER/BACKTEST ONLY` — zero live orders, zero live-trading flag unlocks, zero fabricated forward days (`elapsed_days: 0 < 60` → `INCONCLUSIVE` / `OBSERVATION_ACTIVE`), `G15` live trading remains `HARD-LOCKED`.

## Shared Machine-Readable Artifact Schemas

1. **`artifacts/strategy_lifecycle_registry.json`:**
   - Top-level keys: `schema_version` (`"1.0.0"`), `generated_at`, `commit`, `live_trading_locked` (`true`), `strategies` (array of `{ "strategy_id": "H1" | "H2" | "H3" | "H1_G1" | "H2_G1" | "H3_MAKER", "status": "ARCHIVED_FALSIFIED" | "PAPER_FORWARD_ELIGIBLE", "archive_reason": string | null, "g5_verdict": "PASS" | "REJECT", "dsr_at_n185": number, "pbo": number, "locked_oos_sharpe": number, "paper_forward_allowed": boolean }`), `registry_sha256`.
   - `H1`, `H2`, `H3`, `H1_G1`, `H2_G1` MUST all have `"status": "ARCHIVED_FALSIFIED"` and `"paper_forward_allowed": false`. Only `"H3_MAKER"` may have `"paper_forward_allowed": true`.

2. **`artifacts/signed_strategy_spec_h3_maker.json`:**
   - Top-level keys: `specVersion` (`"1.0.0"`), `strategyId` (`"H3_MAKER"`), `executionMode` (`"PAPER_ONLY"`), `liveOrderAuthority` (`false`), `aiOrderAuthority` (`false`), `universe` (array of symbol strings), `parameters` (`{ "lookbackDays": 30, "entryAnnualBps": 800, "exitAnnualBps": 150, "fifoFillProbability": number, "adverseSelectionBps": number, "singleLegMissProbability": number, "maxGrossLeverage": 1.0 }`), `venueSchedule` (`{ "primaryVenue": "hyperliquid", "benchmarkVenue": "binance", "spotMakerBps": number, "perpMakerBps": number, "spotTakerBps": number, "perpTakerBps": number }`), `riskGates` (`{ "maxDrawdownSoftPct": 8.0, "maxDrawdownHardPct": 12.0, "maxDailyLossPct": 2.5, "staleDataCutoffMs": 15000, "maxTrackingErrorBpsPerMonth": 15.0 }`), `observationWindow` (`{ "minRequiredDays": 60, "targetDays": 90 }`), `payloadSha256` (RFC-6234 SHA-256 hex over canonical sorted-key JSON of all fields except `payloadSha256`).

3. **`artifacts/h3_maker_tick_queue_calibration.json`:**
   - Millisecond L2 `bookDepth` + `futures/um` `aggTrades` + `spot` `aggTrades` replay results across train calibration dates and locked-OOS `BNBUSDT` rebalance dates, with `.CHECKSUM` SHA-256 provenance, measured `empirical_p_fill`, `empirical_adverse_selection_bps` (`1s/5s/30s/60s` markout), `empirical_p_leg_miss` (`spot + perp` synchronized passive window), and `empirical_emergency_taker_half_spread_bps`.

4. **`artifacts/g13_paper_tracking_error.json`:**
   - Top-level keys: `schema_version` (`"1.0.0"`), `gate` (`"G13"`), `status` (`"OBSERVATION_ACTIVE_INCONCLUSIVE"`), `g13_pass` (`false`), `live_trading_unlocked` (`false`), `spec_path` (`"artifacts/signed_strategy_spec_h3_maker.json"`), `spec_sha256`, `genesis_utc`, `latest_checkpoint_utc`, `elapsed_days` (`0`), `min_required_days` (`60`), `target_days` (`90`), `max_allowed_tracking_error_bps_per_month` (`15.0`), `harness_shadow_parity_check` (proving `< 15.0 bps/month` tracking error between CashClaw paper simulator rules and the Python `Decimal` event-ledger oracle on historical shadow replay), `day0_live_public_snapshot` (zero-auth public Binance + Hyperliquid basis/funding/book observation recorded at Day 0), `checkpoints` (append-only array starting with Day 0).

## Parallel Tracks & Disjoint File Ownership

| Track | Scope | Exclusive File Ownership |
|---|---|---|
| **Track A — Python Lab L2 Tick Replay, Strategy Archival & G13 Oracle** | Millisecond `bookDepth` + `perp/spot aggTrades` FIFO queue & adverse-selection calibrator for `H3_MAKER`, formal archival registry (`H1/H2/H3/H1_G1/H2_G1` → `ARCHIVED_FALSIFIED`), signed `H3_MAKER` spec emitter, G6 update with empirical tick-calibrated bounds, and `g13_paper_forward.py` Day-0 genesis + weekly tracking-error reconciler. | `verification_lab/**`, `artifacts/h3_maker_tick_queue_calibration.json`, `artifacts/strategy_lifecycle_registry.json`, `artifacts/signed_strategy_spec_h3_maker.json`, `artifacts/g13_paper_tracking_error.json`, `artifacts/g6_execution_tca.json`, `docs/verification-lab-g0-g6-verdict.md` |
| **Track B — TypeScript Edge `PaperForwardRunner`, `SignedStrategySpec` Guard, Kill Fence & G15 Governance Lock** | Pure `src/tree/paper-forward/**` (`<= 200` LOC/file, `>= 96%` coverage) validating `SignedStrategySpec` SHA-256, rejecting `ARCHIVED_FALSIFIED` strategies (`H1, H2, H3, H1_G1, H2_G1`), running deterministic `H3_MAKER` paper-forward ticks on `PaperOrderLifecycleEngine` + `MicroDoubleEntryLedger` + `CapitalProtectionEngine`, computing monthly tracking error (`< 15 bps/mo`) & fail-closed `INCONCLUSIVE` when `elapsedDays < 60`, `tests/architecture/arch_boundary_check.test.ts`, and bilingual `docs/governance/g13_g15_paper_forward_runbook.md` (`<= 800` LOC). | `src/tree/paper-forward/**`, `tests/paper-forward/g13_paper_forward.test.ts`, `tests/architecture/arch_boundary_check.test.ts`, `docs/governance/g13_g15_paper_forward_runbook.md` |
