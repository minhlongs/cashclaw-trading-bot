# Phase 3: SaaS Billing Hydration & IPN Seam Synchronization

## Context & Objective
Replace hardcoded state in `/billing` page with real hydration from `GET /api/ee/quotas`, `GET /api/ee/credits`, and `GET /api/bots`, synchronize `/api/ee/billing/ipn/route.ts` with `defaultSaasEntitlementStore`, and wire `NowpaymentsCheckoutModal` to trigger state refresh.

## Files Owned
- `src/app/api/ee/billing/ipn/route.ts` (modify)
- `src/components/billing/use-workspace-billing.ts` (create <= 80 LOC)
- `src/app/[locale]/(dashboard)/billing/page.tsx` (modify <= 90 LOC)
- `src/components/billing/__tests__/billing-ui.test.tsx` (modify)

## Steps
1. Update `src/app/api/ee/billing/ipn/route.ts` to check `defaultSaasEntitlementStore.hasProcessedPayment` and invoke `defaultSaasEntitlementStore.recordIpnAndUpgradeTier` just like `nowpayments-ipn/route.ts`.
2. Create `src/components/billing/use-workspace-billing.ts` hook to fetch quotas (`/api/ee/quotas`), credits (`/api/ee/credits`), and active bots (`/api/bots`) with safe fallback defaults (`BASIC`, `runningBots: 1`, `consumedCredits: 250`, `totalCredits: 1000`) when `fetch` is unavailable or pending.
3. Update `src/app/[locale]/(dashboard)/billing/page.tsx` to use `useWorkspaceBilling` and refresh state upon `NowpaymentsCheckoutModal` `onSuccess`.
4. Add unit tests in `src/components/billing/__tests__/billing-ui.test.tsx` verifying hydration and IPN store recording.

## Validation
- `npx vitest run src/components/billing/ src/ee/` passes 100%.
- All touched files remain <= 100 LOC.
