# Quad-Cluster Deep Refactor Wave 7 Plan

## Status: IN_PROGRESS (2026-10-18)

### Overview
Wave 7 deep refactoring executing Option A (Full Wave 7):
1. **Cluster A / Phase 01: `@cashclaw/quantlib` Public SDK Barrel & CLI `eval` Multi-Engine Expansion**
   - Expand `src/tree/quantlib/public-sdk.ts` to export all pure zero-I/O quantitative engines from Waves 2–4 (`runHamiltonMarkovFilter`, `computeHrpRecursiveBisection`, `computeAlmgrenChrissTrajectory`, `HayashiYoshidaEngine`, `computeHawkesIntensity`, `computeOrderBookImbalance`, `GatheralRoughVolatilityEngine`, `runBipowerJumpEstimation`) while maintaining `<= 98 LOC`.
   - Update `bin/lib/commands.js` (`runQuantitativeEval`) so `cashclaw eval` reports `hamiltonCrisisProb` and `hrpDiversificationRatio` alongside existing metrics, and update `bin/__tests__/cashclaw-cli.test.ts`.

2. **Cluster B / Phase 02: Lower Non-Test Ceiling Across ALL of `src/` from `114 LOC` to `<= 98 LOC` (39 files)**
   - Compact 5 Wave 4 quant files (`hrp-allocator-workbench.tsx` 114 LOC, `hrp-recursive-bisection.ts` 112 LOC, `hamilton-markov-filter.ts` 106 LOC, `hamilton-hmm-workbench.tsx` 104 LOC, `quant-telemetry-service.ts` 102 LOC) + 34 files sitting at `99–100 LOC` down to `<= 98 LOC`.
   - Ensure 0 non-test files across all 915+ production files in `src/` exceed `98 LOC`.

3. **Cluster C / Phase 03: Lower Test File Ceiling Across ALL of `src/` from `240 LOC` to `<= 230 LOC` (20 files)**
   - Compact all 20 test files in `src/` between `231–240 LOC` down to `<= 230 LOC`.
   - Ensure 0 test files in `src/` exceed `230 LOC`.

4. **Cluster D / Phase 04: Lower `test/`, `scripts/` & `bin/` Ceiling from `170 LOC` to `<= 160 LOC` (15 files)**
   - Compact all 15 files in `test/`, `scripts/`, and `bin/` between `161–170 LOC` down to `<= 160 LOC`.
   - Ensure 0 files in `test/`, `scripts/`, or `bin/` exceed `160 LOC`.

5. **Phase 05: Quality Gates, Docs & Finalization**
   - `npx tsc --noEmit` (0 errors), `npx eslint src/` (0 warnings), `npm test` 100% green, `npx tsx scripts/audit-oss-package.ts` clean.
   - Update `docs/project-changelog.md`, memory, and commit Wave 7.
