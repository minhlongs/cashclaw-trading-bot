# Phase 01: SaaS Context DRY & `SaasEntitlementStore` D1 Split

## Overview
- **Priority:** P0
- **Status:** In Progress
- **Description:** Extract `src/ee/tenancy/workspace-request-context.ts` to unify workspace/tier/bot-count resolution across API routes, fix `POST /api/ee/credits` and `POST /api/ee/sync`, and split D1 SQL persistence helpers out of `src/ee/billing/saas-entitlement-store.ts` (`182 LOC` -> `<= 115 LOC`).

## Related Code Files
- Create: `src/ee/tenancy/workspace-request-context.ts`
- Create: `src/ee/billing/saas-entitlement-d1.ts`
- Modify: `src/ee/billing/saas-entitlement-store.ts`
- Modify: `src/app/api/bots/route.ts`
- Modify: `src/app/api/ee/sync/route.ts`
- Modify: `src/app/api/ee/credits/route.ts`
- Modify: `src/app/api/ee/alpha-feed/route.ts`

## Implementation Steps
1. Create `src/ee/billing/saas-entitlement-d1.ts` containing D1 row interfaces and SQL query helpers (`fetchD1WorkspaceEntitlement`, `upsertD1WorkspaceEntitlement`, `hasD1FinishedPayment`, `recordD1IpnAndUpgrade`).
2. Refactor `src/ee/billing/saas-entitlement-store.ts` to delegate D1 operations to `saas-entitlement-d1.ts` (`<= 115 LOC`).
3. Create `src/ee/tenancy/workspace-request-context.ts` with `resolveWorkspaceTierContext(request, explicitWorkspaceId?, explicitTier?)` and `resolveActiveBotCount(request, loadLiveBotsCount)`.
4. Refactor `src/app/api/bots/route.ts`, `src/app/api/ee/sync/route.ts`, `src/app/api/ee/credits/route.ts`, and `src/app/api/ee/alpha-feed/route.ts` to use `workspace-request-context.ts`.

## Success Criteria
- `POST /api/ee/credits` without `tier` in JSON body honors upgraded tier from `defaultSaasEntitlementStore`.
- `POST /api/ee/sync` without `x-cashclaw-active-bots` falls back to `botListHandler()`.
- `src/ee/billing/saas-entitlement-store.ts` and `src/ee/billing/saas-entitlement-d1.ts` both `<= 115 LOC`.
