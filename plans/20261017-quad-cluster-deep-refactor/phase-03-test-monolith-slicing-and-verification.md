# Phase 03: Test Monolith Slicing & Verification

## Overview
- **Priority:** P1
- **Status:** Pending
- **Description:** Split `src/__tests__/e2e-smoke.test.ts` (`412 LOC`) and `src/forest/research/tradingagents/debate-to-hypothesis.test.ts` (`410 LOC`) into focused test suites `< 250 LOC`, add unit tests for the new SaaS context & `POST /api/ee/credits` IPN tier resolution, and run full verification gates.

## Related Code Files
- Modify: `src/__tests__/e2e-smoke.test.ts` (`412 LOC` -> `< 180 LOC`, bots routes)
- Create: `src/__tests__/e2e-smoke-settings.test.ts` (`< 240 LOC`, settings routes)
- Modify: `src/forest/research/tradingagents/debate-to-hypothesis.test.ts` (`410 LOC` -> `< 230 LOC`, failure & error paths)
- Create: `src/forest/research/tradingagents/debate-to-hypothesis-success.test.ts` (`< 200 LOC`, happy path & config forwarding)
- Modify: `src/ee/__tests__/open-core-runtime-seams.test.ts` (verify `POST /api/ee/credits` IPN tier inheritance & `POST /api/ee/sync` live bot count fallback)

## Success Criteria
- `npx tsc --noEmit` exits 0.
- `npm test` passes 100% of test suites.
- `npm run audit:oss` passes 100%.
- Max non-test file LOC in `src/` is `<= 176 LOC`.
