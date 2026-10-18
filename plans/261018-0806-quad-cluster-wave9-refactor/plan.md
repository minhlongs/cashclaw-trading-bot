# Quad-Cluster Deep Refactor Wave 9 Plan

## Status: COMPLETED (2026-10-18)

### Overview
Wave 9 deep refactoring executing Option A (Full Wave 9):
1. **[x] Cluster A / Phase 01: `@cashclaw/quantlib` v1.65.0-open-core Multi-Domain SDK & CLI `eval` Expansion**
   - Bumped `QUANTLIB_OSS_VERSION = '1.65.0-open-core'` in `src/tree/quantlib/public-sdk.ts` (82 LOC) and exported `BlackLittermanEngine`, `AvellanedaStoikovEngine`, `computeBouchaudImpact`, and `KalmanCointegrationEngine`.
   - Extended `bin/lib/commands.js` (`runQuantitativeEval`), `bin/lib/cli-printers.js` (`printEvalReport`), `src/tree/cli/__tests__/paper-cli-report.test.ts`, and `bin/__tests__/cashclaw-cli.test.ts` (128 LOC) to surface `avellanedaOptimalSpreadBps` and `kalmanHalfLifeBars`.

2. **[x] Cluster B / Phase 02: Lower Non-Test Ceiling Across ALL of `src/` from `96 LOC` to `<= 94 LOC` (58 files)**
   - Compacted all 58 non-test `.ts`/`.tsx` files in `src/` between `95–96 LOC` down to `<= 94 LOC`.
   - Zero non-test files across all 915+ production files in `src/` exceed `94 LOC`.

3. **[x] Cluster C / Phase 03: Lower Test File Ceiling Across ALL of `src/` from `220 LOC` to `<= 210 LOC` (39 files)**
   - Compacted all 39 test files in `src/` between `211–220 LOC` down to `<= 210 LOC`.
   - Zero test files in `src/` exceed `210 LOC`.

4. **[x] Cluster D / Phase 04: Lower `test/`, `scripts/` & `bin/` Ceiling from `150 LOC` to `<= 140 LOC` (25 files)**
   - Compacted all 25 files in `test/`, `scripts/`, and `bin/` between `141–150 LOC` down to `<= 140 LOC`.
   - Zero files in `test/`, `scripts/`, or `bin/` exceed `140 LOC`.

5. **[x] Phase 05: Quality Gates, Docs & Finalization**
   - `npx tsc --noEmit` (0 errors), `npx eslint src/` (0 warnings), `npm test` 720/720 suites (6,003/6,003 tests) green, `npx tsx scripts/audit-oss-package.ts` clean (3/3 checks passed).
