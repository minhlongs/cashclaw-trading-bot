# Quad-Cluster Deep Refactor Wave 10 Plan

## Status: COMPLETED (2026-10-18)

### Overview
Wave 10 deep refactoring executing Option A (Full Wave 10 — The 200-LOC Repository Milestone):
1. **[x] Cluster A / Phase 01: `@cashclaw/quantlib` v1.66.0-open-core Arbitrage/StatArb/Greeks/Toxicity SDK & CLI `eval` Expansion**
   - Bumped `QUANTLIB_OSS_VERSION = '1.66.0-open-core'` in `src/tree/quantlib/public-sdk.ts` (86 LOC) and exported `FundingBasisEngine`, `estimateJohansenCointegration`, `calculateBlackGreeks`, `initializeVpinState`, and `updateContinuousVpin`.
   - Extended `bin/lib/commands.js` (`runQuantitativeEval`), `bin/lib/cli-printers.js` (`printEvalReport`), `src/tree/cli/__tests__/paper-cli-report.test.ts`, and `bin/__tests__/cashclaw-cli.test.ts` (115 LOC) to surface `vpinToxicityScore` and `fundingBasisAprPct`.

2. **[x] Cluster B / Phase 02: Lower Non-Test Ceiling Across ALL of `src/` from `94 LOC` to `<= 92 LOC` (62 files)**
   - Compacted all 62 non-test `.ts`/`.tsx` files in `src/` between `93–94 LOC` down to `<= 92 LOC`.
   - Zero non-test files across all 915+ production files in `src/` exceed `92 LOC`.

3. **[x] Cluster C / Phase 03: Lower Test File Ceiling Across ALL of `src/` from `210 LOC` to `<= 200 LOC` (43 files)**
   - Compacted all 43 test files in `src/` between `201–210 LOC` down to `<= 200 LOC`.
   - Zero test files in `src/` exceed `200 LOC` (100% repo-wide compliance with `<= 200 LOC`).

4. **[x] Cluster D / Phase 04: Lower `test/`, `scripts/` & `bin/` Ceiling from `140 LOC` to `<= 130 LOC` (20 files)**
   - Compacted all 20 files in `test/`, `scripts/`, and `bin/` between `131–140 LOC` down to `<= 130 LOC`.
   - Zero files in `test/`, `scripts/`, or `bin/` exceed `130 LOC`.

5. **[x] Phase 05: Quality Gates, Docs & Finalization**
   - `npx tsc --noEmit` (0 errors), `npx eslint src/` (0 warnings), `npm test` 720/720 suites (6,003/6,003 tests) green, `npx tsx scripts/audit-oss-package.ts` clean (3/3 checks passed).
