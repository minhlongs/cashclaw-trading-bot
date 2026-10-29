// Canonical SaaS Workspace, Tier & Active-Bot Request Context Resolver
// Eliminates duplicated header/query/entitlement-store resolution across API routes.

import { defaultSaasEntitlementStore } from '../billing/saas-entitlement-store';
import { createServerClient } from '@/lib/db/client';
import { SaasTierSchema, type SaasTier } from './tenant-policy';

export interface WorkspaceTierResolutionOptions {
  readonly explicitWorkspaceId?: string | null;
  readonly explicitTier?: string | null;
}

export interface WorkspaceTierContext {
  readonly workspaceId: string | undefined;
  readonly tier: SaasTier;
  readonly invalidExplicitTier?: string;
}

/**
 * Resolves the effective workspaceId and SaaS tier from an HTTP request.
 * Precedence:
 * 1. Explicit tier parameter or `x-cashclaw-tier` header (validated via SaasTierSchema)
 * 2. Upgraded workspace tier in `defaultSaasEntitlementStore` (keyed by explicit workspaceId or `x-cashclaw-workspace`)
 * 3. Default `'BASIC'`
 */
export async function resolveWorkspaceTierContext(
  req: Request,
  options?: WorkspaceTierResolutionOptions,
): Promise<WorkspaceTierContext> {
  let queryWorkspace: string | null = null;
  let queryTier: string | null = null;
  try {
    const url = new URL(req.url);
    queryWorkspace = url.searchParams.get('workspaceId');
    queryTier = url.searchParams.get('tier');
  } catch {
    // Ignore malformed URLs in synthetic Request mocks
  }

  const headerWorkspace = req.headers.get('x-cashclaw-workspace');
  const workspaceId =
    (options?.explicitWorkspaceId ?? queryWorkspace ?? headerWorkspace)?.trim() || undefined;

  const rawExplicitTier = (options?.explicitTier ?? queryTier)?.trim().toUpperCase();
  const rawHeaderTier = req.headers.get('x-cashclaw-tier')?.trim().toUpperCase();
  const candidateTier = rawExplicitTier || rawHeaderTier;

  if (candidateTier) {
    const parsed = SaasTierSchema.safeParse(candidateTier);
    if (!parsed.success) return { workspaceId, tier: 'BASIC', invalidExplicitTier: candidateTier };
    return { workspaceId, tier: parsed.data };
  }

  if (workspaceId) {
    const db = createServerClient();
    if (db) defaultSaasEntitlementStore.setDatabase(db);
  }
  const tier: SaasTier = workspaceId
    ? await defaultSaasEntitlementStore.getWorkspaceTier(workspaceId)
    : 'BASIC';
  return { workspaceId, tier };
}

/**
 * Resolves the active bot count for quota enforcement.
 * Uses `x-cashclaw-active-bots` header when explicitly provided; otherwise queries live bot list.
 */
export async function resolveActiveBotCount(
  req: Request,
  loadLiveBots?: () => Promise<unknown>,
): Promise<number> {
  const rawHeader = req.headers.get('x-cashclaw-active-bots');
  if (rawHeader !== null) {
    const parsed = parseInt(rawHeader, 10);
    if (!Number.isNaN(parsed)) return Math.max(0, parsed);
  }
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
