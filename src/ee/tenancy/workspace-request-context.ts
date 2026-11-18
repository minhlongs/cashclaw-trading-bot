// Canonical SaaS Workspace, Tier & Active-Bot Request Context Resolver
// Eliminates duplicated header/query/entitlement-store resolution across API routes.

import { createServerClient } from '@/lib/db/client';
import { defaultSaasEntitlementStore } from '../billing/saas-entitlement-store';
import { listWorkspaceMemberships, pickActiveMembership } from './workspace-membership';
import type { SaasTier } from './tenant-policy';

export interface WorkspaceTierResolutionOptions {
  readonly explicitWorkspaceId?: string | null;
  readonly trustedServerOperator?: boolean;
}

export interface WorkspaceTierContext {
  readonly workspaceId: string | undefined;
  readonly tier: SaasTier;
  readonly memberWorkspaceIds?: readonly string[];
}

export interface WorkspaceAccessViolation {
  readonly code: 'WORKSPACE_FORBIDDEN';
  readonly status: 403;
  readonly error: string;
}

export interface UnauthenticatedAccessViolation {
  readonly code: 'AUTH_REQUIRED';
  readonly status: 403;
  readonly error: string;
}

export function extractAuthenticatedUserId(req?: Request): string | undefined {
  const userId = req?.headers?.get?.('x-user-id')?.trim();
  return userId && userId.length > 0 ? userId : undefined;
}

export function requireAuthenticatedUser(req?: Request):
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly violation: UnauthenticatedAccessViolation } {
  const userId = extractAuthenticatedUserId(req);
  if (!userId) {
    return {
      ok: false,
      violation: {
        code: 'AUTH_REQUIRED',
        status: 403,
        error: 'AUTH_REQUIRED: session-verified x-user-id is required',
      },
    };
  }
  return { ok: true, userId };
}

export function extractRequestedWorkspaceId(
  req: Request,
  explicitWorkspaceId?: string | null,
): string | undefined {
  let queryWorkspace: string | null = null;
  try {
    const url = new URL(req.url);
    queryWorkspace = url.searchParams.get('workspaceId');
  } catch {
    // Ignore malformed URLs in synthetic Request mocks
  }
  const headerWorkspace = req.headers.get('x-cashclaw-workspace');
  const clean = (val?: string | null): string | undefined => {
    const trimmed = val?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  };
  return clean(explicitWorkspaceId) ?? clean(queryWorkspace) ?? clean(headerWorkspace);
}

export function derivePersonalWorkspaceId(userId: string): string {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ws_${safeId}`;
}

/** Enforces cross-tenant anti-IDOR and unauthenticated workspace targeting guards. */
export function detectCrossWorkspaceIdor(
  req: Request,
  ctx: WorkspaceTierContext,
  explicitWorkspaceId?: string | null,
): WorkspaceAccessViolation | null {
  const namedWorkspaceId = extractRequestedWorkspaceId(req, explicitWorkspaceId);
  if (!namedWorkspaceId) return null;

  const userId = extractAuthenticatedUserId(req);
  if (!userId) {
    return {
      code: 'WORKSPACE_FORBIDDEN',
      status: 403,
      error: `WORKSPACE_FORBIDDEN: unauthenticated request cannot target workspace '${namedWorkspaceId}'`,
    };
  }

  const allowedWorkspaces = new Set<string>([
    derivePersonalWorkspaceId(userId),
    ...(ctx.memberWorkspaceIds ?? []),
  ]);
  if (allowedWorkspaces.has(namedWorkspaceId)) return null;

  return {
    code: 'WORKSPACE_FORBIDDEN',
    status: 403,
    error: `WORKSPACE_FORBIDDEN: IDOR_VIOLATION — user is not authorized for workspace '${namedWorkspaceId}'`,
  };
}

/** Resolves workspaceId and verified SaaS tier; never grants paid tiers without identity. */
export async function resolveWorkspaceTierContext(
  req: Request,
  options?: WorkspaceTierResolutionOptions,
): Promise<WorkspaceTierContext> {
  const namedWorkspaceId = extractRequestedWorkspaceId(req, options?.explicitWorkspaceId);

  // `x-user-id` is written by the middleware from the validated D1 session and
  // stripped of any client value first, so a request cannot pick another user.
  const userId = extractAuthenticatedUserId(req);
  if (userId) {
    const memberships = await listWorkspaceMemberships(userId, createServerClient() ?? undefined);
    const active = pickActiveMembership(memberships);
    if (!active) {
      const personalTier = await defaultSaasEntitlementStore.getWorkspaceTier(
        derivePersonalWorkspaceId(userId),
      );
      return { workspaceId: undefined, tier: personalTier };
    }
    const memberWorkspaceIds = memberships.map((membership) => membership.workspaceId);
    const selectedWorkspaceId =
      namedWorkspaceId && memberWorkspaceIds.includes(namedWorkspaceId)
        ? namedWorkspaceId
        : active.workspaceId;
    return {
      workspaceId: selectedWorkspaceId,
      tier: await defaultSaasEntitlementStore.getWorkspaceTier(selectedWorkspaceId),
      memberWorkspaceIds,
    };
  }

  if (options?.trustedServerOperator === true && namedWorkspaceId) {
    const tier = await defaultSaasEntitlementStore.getWorkspaceTier(namedWorkspaceId);
    return { workspaceId: namedWorkspaceId, tier };
  }

  return { workspaceId: undefined, tier: 'BASIC' };
}

/**
 * Resolves the effective workspace identifier for a route after `resolveWorkspaceTierContext`.
 */
export function resolveEffectiveWorkspaceId(
  req: Request,
  resolvedWorkspaceId: string | undefined,
  _explicitWorkspaceId?: string | null,
): string | undefined {
  if (resolvedWorkspaceId) {
    return resolvedWorkspaceId;
  }
  const userId = extractAuthenticatedUserId(req);
  if (userId) {
    return derivePersonalWorkspaceId(userId);
  }
  return undefined;
}

/**
 * Resolves the active bot count for quota enforcement.
 *
 * The count is never read from the request. A caller-controlled count would let a
 * client already at its bot limit report zero running bots and keep creating more.
 * The live bot list is the only source.
 */
export async function resolveActiveBotCount(
  loadLiveBots?: () => Promise<unknown>,
): Promise<number> {
  if (!loadLiveBots) return 0;
  try {
    const listResult = (await loadLiveBots()) as { data?: unknown[]; bots?: unknown[] } | undefined;
    if (Array.isArray(listResult?.data)) return listResult.data.length;
    if (Array.isArray(listResult?.bots)) return listResult.bots.length;
  } catch {
    return 0;
  }
  return 0;
}
