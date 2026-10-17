# Phase 04 — End-to-End Integration Tests & OSS Boundary Verification

## Context Links
- Boundary Gate: `src/tree/__tests__/open-core-boundary.test.ts`
- Catalog Gate: `src/ee/__tests__/open-core-25-steps.test.ts`
- Blueprint Sync Gate: `src/ee/__tests__/company-blueprint-sync.test.ts`

## Overview
- **Priority:** P1
- **Status:** Pending
- **Description:** Verify all 5 closed runtime seams with dedicated unit/integration tests (`src/ee/__tests__/runtime-seams-e2e.test.ts`), ensure `src/tree/**` remains 100% free of `@/ee` imports, and run full test + typecheck gates.

## Success Criteria
- [ ] `src/ee/__tests__/runtime-seams-e2e.test.ts` covers:
  1. `POST /api/bots` blocking the 2nd bot on `BASIC` tier (`403`) and allowing on `PREMIUM`.
  2. `POST /api/ee/billing/nowpayments-ipn` upgrading workspace tier in `SaasEntitlementStore` (and D1 mock) + persisted replay rejection.
  3. `GET /api/ee/alpha-feed` returning upgraded tier signals after IPN activation.
  4. `POST /api/ee/alerts` signing HMAC-SHA256 alert payloads and deduplicating cooldown repeats.
  5. `POST /api/ee/sync` enforcing workspace quota before importing signed CLI bundles.
- [ ] All files `< 200 LOC`, `0 :any`, `0 console.log`.
- [ ] `npx vitest run` and `npx tsc --noEmit` exit `0`.
