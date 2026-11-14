// Canonical SaaS Workspace, Tier & Active-Bot Request Context Resolver
// Eliminates duplicated header/query/entitlement-store resolution across API routes.

import { createServerClient } from '@/lib/db/client';
import { defaultSaasEntitlementStore } from '../billing/saas-entitlement-store';
import { listWorkspaceMemberships, pickActiveMembership } from './workspace-membership';
import type { SaasTier } from './tenant-policy';

export interface WorkspaceTierResolutionOptions {
  readonly explicitWorkspaceId?: string | null;
}

export interface WorkspaceTierContext {
  readonly workspaceId: string | undefined;
  readonly tier: SaasTier;
  /**
   * Workspaces the signed-in user belongs to, when the workspace was derived
   * from a session rather than named by the request. A caller can show this so
   * the user can switch instead of being silently pinned to one workspace.
   */
  readonly memberWorkspaceIds?: readonly string[];
}

export interface WorkspaceAccessViolation {
  readonly code: 'WORKSPACE_FORBIDDEN';
  readonly status: 403;
  readonly error: string;
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

/**
 * Enforces explicit cross-tenant anti-IDOR isolation on HTTP routes.
 * When a session-verified `x-user-id` explicitly names a `workspaceId` (via body,
 * query `?workspaceId=`, or `x-cashclaw-workspace` header) that belongs neither to
 * `memberWorkspaceIds` nor to their deterministic personal workspace `ws_<userId>`,
 * the request is rejected with 403 WORKSPACE_FORBIDDEN / IDOR_VIOLATION.
 */
export function detectCrossWorkspaceIdor(
  req: Request,
  ctx: WorkspaceTierContext,
  explicitWorkspaceId?: string | null,
): WorkspaceAccessViolation | null {
  const userId = req.headers.get('x-user-id')?.trim();
  if (!userId) return null;

  const namedWorkspaceId = extractRequestedWorkspaceId(req, explicitWorkspaceId);
  if (!namedWorkspaceId) return null;

  const personalWorkspaceId = derivePersonalWorkspaceId(userId);
  const allowedWorkspaces = new Set<string>([
    personalWorkspaceId,
    ...(ctx.memberWorkspaceIds ?? []),
  ]);

  if (allowedWorkspaces.has(namedWorkspaceId)) {
    return null;
  }

  return {
    code: 'WORKSPACE_FORBIDDEN',
    status: 403,
    error: `WORKSPACE_FORBIDDEN: IDOR_VIOLATION — user is not authorized for workspace '${namedWorkspaceId}'`,
  };
}

/**
 * Resolves the effective workspaceId and SaaS tier from an HTTP request.
 *
 * The tier is never read from the request — not from a query parameter, not from
 * a header, not from a request body passed in by a route. Any of those would let
 * a caller grant itself a tier it has not paid for. The tier is read only from
 * `defaultSaasEntitlementStore`, which is written by the IPN handler after a
 * verified NOWPayments payment.
 *
 * Precedence for tier: `defaultSaasEntitlementStore` (keyed by workspaceId), else `'BASIC'`.
 * WorkspaceId: `explicitWorkspaceId`, then `?workspaceId=`, then `x-cashclaw-workspace`,
 * then the active membership of the session-verified `x-user-id`.
 */
export async function resolveWorkspaceTierContext(
  req: Request,
  options?: WorkspaceTierResolutionOptions,
): Promise<WorkspaceTierContext> {
  const namedWorkspaceId = extractRequestedWorkspaceId(req, options?.explicitWorkspaceId);

  // `x-user-id` is written by the middleware from the validated D1 session and
  // stripped of any client value first, so a request cannot pick another user.
  const userId = req.headers.get('x-user-id')?.trim();
  if (userId) {
    const memberships = await listWorkspaceMemberships(userId, createServerClient() ?? undefined);
    const active = pickActiveMembership(memberships);
    if (!active) {
      return { workspaceId: undefined, tier: 'BASIC' };
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

  if (namedWorkspaceId) {
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
  explicitWorkspaceId?: string | null,
): string | undefined {
  if (resolvedWorkspaceId) {
    return resolvedWorkspaceId;
  }
  const userId = req.headers.get('x-user-id')?.trim();
  if (userId) {
    return derivePersonalWorkspaceId(userId);
  }
  const trimmedExplicit = explicitWorkspaceId?.trim();
  return trimmedExplicit && trimmedExplicit.length > 0 ? trimmedExplicit : undefined;
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
