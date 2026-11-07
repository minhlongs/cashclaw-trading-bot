# Phase 02 — Cross-Tenant Workspace Isolation Across EE Routes

## Context
- `src/app/api/ee/alerts/route.ts:52` constructs `CloudAlertEvent` with `workspaceId: parsed.data.workspaceId` instead of the session-authorized workspace.
- `src/app/api/ee/credits/route.ts:35,60` uses `resolvedWorkspaceId ?? parsed.data.workspaceId`, which leaks `parsed.data.workspaceId` when a signed-in user (`x-user-id`) has 0 rows in `saas_workspace_members` (`resolvedWorkspaceId === undefined`).
- `src/app/api/ee/scheduler/route.ts:15,38` does not call `resolveWorkspaceTierContext`, allowing a signed-in user to query or acquire leases for another tenant's `workspaceId`.

## Files to Modify
- **Modify:** `src/ee/tenancy/workspace-request-context.ts`
  - Export `resolveEffectiveWorkspaceId(req: Request, resolvedWorkspaceId: string | undefined, explicitWorkspaceId?: string | null): string | undefined`:
    - If `resolvedWorkspaceId` is defined, return `resolvedWorkspaceId`.
    - If `req.headers.get('x-user-id')?.trim()` is present (authenticated session with no D1 membership row yet), return `ws_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}` (deterministic personal workspace — never the unverified `explicitWorkspaceId`).
    - Otherwise (unauthenticated local/unit-test calls), return `explicitWorkspaceId?.trim() || undefined`.
- **Modify:** `src/app/api/ee/alerts/route.ts`
  - Compute `effectiveWorkspaceId = resolveEffectiveWorkspaceId(req, tierContext.workspaceId, parsed.data.workspaceId) ?? parsed.data.workspaceId` and use `effectiveWorkspaceId` in `event.workspaceId`.
- **Modify:** `src/app/api/ee/credits/route.ts`
  - Replace `resolvedWorkspaceId ?? parsed.data.workspaceId` with `resolveEffectiveWorkspaceId(req, resolvedWorkspaceId, parsed.data.workspaceId) ?? parsed.data.workspaceId` in both `GET` and `POST`.
- **Modify:** `src/app/api/ee/scheduler/route.ts`
  - In `GET` and `POST`, resolve tenant context via `resolveWorkspaceTierContext` + `resolveEffectiveWorkspaceId` so authenticated sessions are scoped to their authorized workspace.
- **Modify:** `src/app/api/ee/__tests__/expanded-routes.test.ts` & `src/ee/__tests__/runtime-seams-e2e.test.ts` & `src/ee/__tests__/workspace-request-context.test.ts`
  - Add regression tests for cross-tenant spoofing on `/api/ee/alerts`, `/api/ee/credits`, and `/api/ee/scheduler` (both with existing membership and with 0 memberships).

## Verification
- `npx vitest run src/ee/__tests__/workspace-request-context.test.ts src/app/api/ee/__tests__/expanded-routes.test.ts src/ee/__tests__/runtime-seams-e2e.test.ts`
- `npm run quality:gate`
