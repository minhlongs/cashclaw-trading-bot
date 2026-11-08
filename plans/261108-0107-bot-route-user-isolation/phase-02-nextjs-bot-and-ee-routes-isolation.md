# Phase 02: Next.js Bot & EE Routes Session User Isolation

## Context & Requirements
- Thread `req.headers.get('x-user-id')?.trim() || undefined` from Next.js routes into the forest bot handlers and `resolveActiveBotCount`.
- Return HTTP `404` on `GET /api/bots/[id]`, `POST /api/bots/[id]`, and `PATCH /api/bots/[id]` when `result.error?.includes('not found')` so unauthorized cross-tenant probes never leak existence or return `200`.
- Use `resolveEffectiveWorkspaceId` in `POST /api/ee/billing/checkout` when D1 membership provisioning returns `null`.

## Files Owned
- `src/app/api/bots/route.ts`
- `src/app/api/bots/[id]/route.ts`
- `src/app/api/ee/sync/route.ts`
- `src/app/api/ee/billing/checkout/route.ts`
- `src/app/api/bots/route.test.ts`
- `src/app/api/bots/[id]/route.test.ts`
- `src/app/api/ee/__tests__/ee-workspace-isolation.test.ts`

## Steps
1. Update `GET(req?: Request)` and `POST(req: Request)` in `src/app/api/bots/route.ts` to extract `userId = req?.headers.get('x-user-id')?.trim() || undefined`, pass `userId` to `botListHandler(userId)`, `resolveActiveBotCount(() => botListHandler(userId))`, and `botCreateHandler(parsed.data, userId)`.
2. Update `GET`, `POST`, and `PATCH` in `src/app/api/bots/[id]/route.ts` to extract `userId = req.headers.get('x-user-id')?.trim() || undefined`, pass `userId` to `botDetailHandler(id, userId)`, `botControlHandler(id, action, userId)`, and `botUpdateConfigHandler(id, body.config, userId)`, and return HTTP `404` when `!result.ok && result.error?.toLowerCase().includes('not found')` (or `400` for other control/config errors).
3. Update `POST(req: Request)` in `src/app/api/ee/sync/route.ts` to extract `userId = req.headers.get('x-user-id')?.trim() || undefined` and pass `() => botListHandler(userId)` to `resolveActiveBotCount`.
4. Update `resolveCheckoutWorkspace` in `src/app/api/ee/billing/checkout/route.ts` to fall back to `resolveEffectiveWorkspaceId(req, resolved.workspaceId, explicitWorkspaceId)` when `ensureUserWorkspaceMembership(userId)` returns `null`.
5. Expand route tests in `src/app/api/bots/route.test.ts`, `src/app/api/bots/[id]/route.test.ts`, and `src/app/api/ee/__tests__/ee-workspace-isolation.test.ts`.

## Validation
- `npx vitest run src/app/api/bots/route.test.ts src/app/api/bots/\[id\]/route.test.ts src/app/api/ee/__tests__/ee-workspace-isolation.test.ts src/ee/__tests__/runtime-seams-e2e.test.ts`
