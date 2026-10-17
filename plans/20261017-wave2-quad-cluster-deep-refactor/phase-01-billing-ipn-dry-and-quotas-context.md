# Phase 01: SaaS Billing IPN Verifier DRY & Quotas Context Unification

## Overview
- **Priority:** High
- **Status:** In Progress
- **Description:** Extract shared NOWPayments HTTP request verification into `src/ee/billing/nowpayments-ipn-verifier.ts`, refactor both `/api/ee/billing/nowpayments-ipn/route.ts` and `/api/ee/billing/ipn/route.ts` to use it, and wire `/api/ee/quotas/route.ts` to `resolveWorkspaceTierContext`.

## Related Code Files
- Create: `src/ee/billing/nowpayments-ipn-verifier.ts`
- Modify: `src/app/api/ee/billing/nowpayments-ipn/route.ts`
- Modify: `src/app/api/ee/billing/ipn/route.ts`
- Modify: `src/app/api/ee/quotas/route.ts`
- Modify: `src/app/api/ee/__tests__/ee-routes.test.ts`

## Todo List
- [ ] Create `src/ee/billing/nowpayments-ipn-verifier.ts` with `verifyNowPaymentsIpnHttpRequest(req)` preserving 401/403/400 status codes.
- [ ] Refactor `src/app/api/ee/billing/nowpayments-ipn/route.ts` and `src/app/api/ee/billing/ipn/route.ts` to use `verifyNowPaymentsIpnHttpRequest`.
- [ ] Update `src/app/api/ee/quotas/route.ts` to validate optional `?tier=` and resolve workspace/tier via `resolveWorkspaceTierContext`.
- [ ] Add unit/integration tests for workspace-upgraded quota resolution and IPN verifier parity.
