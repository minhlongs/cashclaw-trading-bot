# Quad-Cluster Deep Refactor Wave 8 Plan

## Status: COMPLETED (2026-10-18)

### Overview
Wave 8 deep refactoring executing Option A (Full Wave 8):
1. **[x] Cluster A / Phase 01: `@cashclaw/quantlib` v1.64.0-open-core & CLI `eval` / `paper-cli-report` Wave 5 Surface & Signature Expansion**
   - Bumped `QUANTLIB_OSS_VERSION = '1.64.0-open-core'` in `src/tree/quantlib/public-sdk.ts` and verified exports for `computeDupireMartingaleSurface` and `computeRoughPathLevySignature` in `src/tree/cli/__tests__/paper-cli-report.test.ts`.
   - Extended `bin/lib/commands.js` (`runQuantitativeEval`), `bin/lib/cli-printers.js` (`printEvalReport`), and `src/tree/cli/paper-cli-report.ts` (`evaluateQuickstartFixture`) to surface `dupireAtmLocalVol`, `motCorridorWidthBps`, and `roughPathLevyArea12` while staying strictly within `<= 96 LOC`.

2. **[x] Cluster B / Phase 02: Lower Non-Test Ceiling Across ALL of `src/` from `98 LOC` to `<= 96 LOC` (44 files)**
   - Compacted all 44 non-test `.ts`/`.tsx` files in `src/` between `97–98 LOC` down to `<= 96 LOC`.
   - Zero non-test files across all 915+ production files in `src/` exceed `96 LOC`.

3. **[x] Cluster C / Phase 03: Lower Test File Ceiling Across ALL of `src/` from `230 LOC` to `<= 220 LOC` (25 files)**
   - Compacted all 25 test files in `src/` between `221–230 LOC` down to `<= 220 LOC`.
   - Zero test files in `src/` exceed `220 LOC`.

4. **[x] Cluster D / Phase 04: Lower `test/`, `scripts/` & `bin/` Ceiling from `160 LOC` to `<= 150 LOC` (18 files)**
   - Compacted all 18 files in `test/`, `scripts/`, and `bin/` between `151–160 LOC` down to `<= 150 LOC`.
   - Zero files in `test/`, `scripts/`, or `bin/` exceed `150 LOC`.

5. **[x] Phase 05: Quality Gates, Docs & Finalization**
   - `npx tsc --noEmit` (0 errors), `npx eslint src/` (0 warnings), `npm test` 720/720 suites (6,003/6,003 tests) green, `npx tsx scripts/audit-oss-package.ts` clean (3/3 checks passed).
