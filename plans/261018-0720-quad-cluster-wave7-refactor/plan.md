# Quad-Cluster Deep Refactor Wave 7 Plan

## Status: COMPLETED (2026-10-18)

### Overview
Wave 7 deep refactoring executing Option A (Full Wave 7):
1. **[x] Cluster A / Phase 01: `@cashclaw/quantlib` Public SDK Barrel & CLI `eval` Multi-Engine Expansion**
   - Expanded `src/tree/quantlib/public-sdk.ts` (75 LOC) to export all pure zero-I/O quantitative engines (`runHamiltonMarkovFilter`, `computeHrpRecursiveBisection`, `computeAlmgrenChrissTrajectory`, `HayashiYoshidaEngine`, `computeHawkesIntensity`, `computeOrderBookImbalance`, `GatheralRoughVolatilityEngine`, `runBipowerJumpEstimation`) with `QUANTLIB_OSS_VERSION = '1.63.0-open-core'`.
   - Updated `bin/lib/commands.js` (`runQuantitativeEval`) and `bin/lib/cli-printers.js` (`printEvalReport`) so `cashclaw eval` reports `hamiltonCrisisProb` and `hrpDiversificationRatio`, and updated `src/tree/cli/__tests__/paper-cli-report.test.ts` + `bin/__tests__/cashclaw-cli.test.ts`.

2. **[x] Cluster B / Phase 02: Lower Non-Test Ceiling Across ALL of `src/` from `114 LOC` to `<= 98 LOC` (41 files)**
   - Compacted all 41 non-test `.ts`/`.tsx` files in `src/` exceeding `98 LOC` down to `<= 98 LOC`.
   - Zero non-test files across all 915+ production files in `src/` exceed `98 LOC`.

3. **[x] Cluster C / Phase 03: Lower Test File Ceiling Across ALL of `src/` from `240 LOC` to `<= 230 LOC` (20 files)**
   - Compacted all 20 test files in `src/` between `231–240 LOC` down to `<= 230 LOC`.
   - Zero test files in `src/` exceed `230 LOC`.

4. **[x] Cluster D / Phase 04: Lower `test/`, `scripts/` & `bin/` Ceiling from `170 LOC` to `<= 160 LOC` (15 files)**
   - Compacted all 15 files in `test/`, `scripts/`, and `bin/` between `161–170 LOC` down to `<= 160 LOC`.
   - Zero files in `test/`, `scripts/`, or `bin/` exceed `160 LOC`.

5. **[x] Phase 05: Quality Gates, Docs & Finalization**
   - `npx tsc --noEmit` (0 errors), `npx eslint src/` (0 warnings), `npm test` 720/720 suites (6,003/6,003 tests) green, `npx tsx scripts/audit-oss-package.ts` clean (3/3 checks passed).
