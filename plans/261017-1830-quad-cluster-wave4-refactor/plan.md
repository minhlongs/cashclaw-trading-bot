# Quad-Cluster Deep Refactor Wave 4 Plan

## Status: COMPLETED

### Overview
Wave 4 deep refactoring executing Option A (Full Wave 4):
1. **Cluster A / Phase 01: 100% `QuantScreenHeader` Unification (15/15 Screens) & Public CLI Executable (`bin/cashclaw.js`) Decomposition (`<= 110 LOC`) — COMPLETED**
   - Extended `QuantScreenHeader` (`src/components/quant/quant-screen-header.tsx`, 34 LOC) with optional `extraBadge?: ReactNode` prop to support `alpha-zoo-evaluator.tsx` (`ZERO_LOOKAHEAD • CAUSAL_AST`) and wired all 15 quant screens in `src/components/quant/*.tsx` to `QuantScreenHeader`.
   - Extracted CLI help/table report printers from `bin/cashclaw.js` into `bin/lib/cli-printers.js` (107 LOC) so `bin/cashclaw.js` (101 LOC), `bin/lib/commands.js` (102 LOC), and `bin/lib/formatters.js` (55 LOC) are all `<= 110 LOC`.

2. **Cluster B / Phase 02: Lower Non-Test Ceiling Across ALL of `src/` from `119 LOC` to `<= 110 LOC` — COMPLETED**
   - Slimmed all 33 non-test `.ts`/`.tsx` files in `src/` that were between `111–119 LOC` so zero non-test files in `src/` exceed `110 LOC` (maximum non-test file in `src/` is now `110 LOC`).

3. **Cluster C / Phase 03: Eliminate ALL Test Files `> 300 LOC` Across the Entire Repository — COMPLETED**
   - Split `src/tree/exchange/ccxt/client.test.ts` (343 LOC) -> `client.test.ts` (186 LOC) + `client-balances-orders.test.ts` (146 LOC)
   - Split `src/forest/alpha/pipeline/engine.test.ts` (340 LOC) -> `engine.test.ts` (142 LOC) + `engine-derivatives-walkforward.test.ts` (186 LOC)
   - Split `src/forest/research/tradingagents/run-deliberation-helpers.test.ts` (328 LOC) -> `run-deliberation-helpers.test.ts` (154 LOC) + `run-deliberation-finalize.test.ts` (182 LOC)
   - Split `src/forest/alpha/persistence/micro-d1-store.test.ts` (327 LOC) -> `micro-d1-store.test.ts` (212 LOC) + `micro-d1-store-reads.test.ts` (201 LOC)
   - Split `src/components/auth/login-form.test.tsx` (306 LOC) -> `login-form.test.tsx` (194 LOC) + `login-form-loading.test.tsx` (156 LOC)
   - Split `src/forest/alpha/multiple-testing/overfitting-proxy.test.ts` (303 LOC) -> `overfitting-proxy.test.ts` (147 LOC) + `parameter-sensitivity.test.ts` (157 LOC)
   - Zero test files in `src/` exceed `300 LOC` (maximum test file across `src/` is now `298 LOC`).

4. **Phase 04: Quality Gates & Finalization — COMPLETED**
   - `npx tsc --noEmit` 0 errors
   - `npx eslint src/` 0 warnings
   - `npm test` 100% green (713/713 test suites)
   - `npx tsx scripts/audit-oss-package.ts` clean (3/3 checks passed)
