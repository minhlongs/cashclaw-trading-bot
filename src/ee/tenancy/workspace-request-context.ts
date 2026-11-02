// Server-verified workspace, membership, and entitlement resolution for authenticated API routes.

import { createServerClient } from '@/lib/db/client';
import { resolveSessionUser } from '@/lib/auth/session-user';
import { parseSessionCookie } from '@/lib/auth/session-utils';
import type { D1Database } from '@/lib/db/types';
import { SaasTierSchema, type SaasTier } from './tenant-policy';

export class WorkspaceContextError extends Error {
  constructor(message: string, readonly status: 401 | 403 | 404 | 503) {
    super(message);
    this.name = 'WorkspaceContextError';
  }
}

export function workspaceContextErrorResponse(error: unknown): Response {
  if (error instanceof WorkspaceContextError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  return Response.json({ ok: false, error: 'Workspace service unavailable' }, { status: 503 });
}

export interface WorkspaceTierContext {
  readonly db: D1Database;
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: 'OWNER' | 'ADMIN' | 'TRADER' | 'VIEWER';
  readonly tier: SaasTier;
  readonly entitlementExpiresAtMs: number | null;
}

interface WorkspaceRow {
  workspace_id: string;
  owner_user_id: string;
  role: WorkspaceTierContext['role'];
  tier: string;
  expires_at_ms: number | null;
  revoked_at_ms: number | null;
}

function requestedWorkspaceId(req: Request, explicitWorkspaceId?: string | null): string | undefined {
  let queryId: string | null = null;
  try { queryId = new URL(req.url).searchParams.get('workspaceId'); } catch { /* invalid synthetic URL */ }
  return (explicitWorkspaceId ?? queryId ?? req.headers.get('x-cashclaw-workspace'))?.trim() || undefined;
}

async function ensurePersonalWorkspace(db: D1Database, userId: string): Promise<string> {
  const workspaceId = `personal:${userId}`;
  const nowMs = Date.now();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO saas_workspaces (workspace_id, owner_user_id, status, created_at_ms)
      VALUES (?, ?, 'active', ?)` ).bind(workspaceId, userId, nowMs),
    db.prepare(`INSERT OR IGNORE INTO saas_workspace_memberships
      (workspace_id, user_id, role, status, expires_at_ms, created_at_ms)
      SELECT workspace_id, owner_user_id, 'OWNER', 'active', NULL, ?
      FROM saas_workspaces WHERE workspace_id = ? AND owner_user_id = ? AND status = 'active'`)
      .bind(nowMs, workspaceId, userId),
    db.prepare(`INSERT OR IGNORE INTO saas_workspace_entitlements
      (workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows,
       monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms, expires_at_ms, revoked_at_ms, current_payment_id)
      SELECT workspace_id, owner_user_id, 'BASIC', 1, 4, 1000, 0, ?, NULL, NULL, NULL
      FROM saas_workspaces WHERE workspace_id = ? AND owner_user_id = ? AND status = 'active'`)
      .bind(nowMs, workspaceId, userId),
  ]);
  return workspaceId;
}

async function resolveWorkspaceId(db: D1Database, req: Request, userId: string, explicitWorkspaceId?: string | null): Promise<string> {
  const requested = requestedWorkspaceId(req, explicitWorkspaceId);
  return requested ?? ensurePersonalWorkspace(db, userId);
}

/**
 * Resolve identity from an unexpired D1 session, then validate the requested workspace against
 * active membership rows. Caller tier input is intentionally not accepted or consulted.
 * If no workspace is selected, provision/resolve the user's deterministic BASIC personal workspace.
 */
export async function resolveWorkspaceTierContext(
  req: Request,
  options?: { readonly explicitWorkspaceId?: string | null },
): Promise<WorkspaceTierContext> {
  const sessionId = parseSessionCookie(req);
  if (!sessionId || sessionId.length > 128) throw new WorkspaceContextError('Authentication required', 401);
  const db = createServerClient();
  if (!db) throw new WorkspaceContextError('Workspace database unavailable', 503);

  const session = await resolveSessionUser(req, db);
  if (!session.userId) {
    throw new WorkspaceContextError(
      session.errorStatus === 503 ? 'Session validation unavailable' : 'Authentication required',
      session.errorStatus ?? 401,
    );
  }

  try {
    const workspaceId = await resolveWorkspaceId(db, req, session.userId, options?.explicitWorkspaceId);
    const row = await db.prepare(`
      SELECT w.workspace_id, w.owner_user_id, m.role, e.tier, e.expires_at_ms, e.revoked_at_ms
      FROM saas_workspaces w
      JOIN saas_workspace_memberships m ON m.workspace_id = w.workspace_id
      JOIN saas_workspace_entitlements e ON e.workspace_id = w.workspace_id AND e.owner_user_id = w.owner_user_id
      WHERE w.workspace_id = ? AND w.status = 'active'
        AND m.user_id = ? AND m.status = 'active'
        AND (m.expires_at_ms IS NULL OR m.expires_at_ms > ?)
      LIMIT 1
    `).bind(workspaceId, session.userId, Date.now()).first<WorkspaceRow>();
    if (!row) throw new WorkspaceContextError('Workspace not found', 404);

    const parsedTier = SaasTierSchema.safeParse(row.tier);
    if (!parsedTier.success) throw new WorkspaceContextError('Workspace entitlement unavailable', 503);
    const nowMs = Date.now();
    const isInactivePaid = parsedTier.data !== 'BASIC'
      && (row.revoked_at_ms !== null || (row.expires_at_ms !== null && row.expires_at_ms <= nowMs));
    const tier: SaasTier = isInactivePaid ? 'BASIC' : parsedTier.data;
    return {
      db, userId: session.userId, workspaceId: row.workspace_id, role: row.role,
      tier, entitlementExpiresAtMs: row.expires_at_ms,
    };
  } catch (error) {
    if (error instanceof WorkspaceContextError) throw error;
    throw new WorkspaceContextError('Workspace authorization unavailable', 503);
  }
}

export function requireWorkspaceOwner(context: WorkspaceTierContext): void {
  if (context.role !== 'OWNER') throw new WorkspaceContextError('Workspace owner access required', 403);
}

/** Server-derived active workspace bot count. Request headers are deliberately ignored. */
export async function resolveActiveBotCount(context: WorkspaceTierContext): Promise<number> {
  try {
    const row = await context.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM bots
         WHERE workspace_id = ? AND status IN ('draft', 'paper_test', 'live_running', 'paused'))
        +
        (SELECT COUNT(*) FROM saas_bot_create_reservations r
         WHERE r.workspace_id = ? AND r.status = 'reserved' AND r.lease_expires_at_ms > ?
           AND NOT EXISTS (SELECT 1 FROM bots b WHERE b.id = r.bot_id)) AS active_count
    `).bind(context.workspaceId, context.workspaceId, Date.now()).first<{ active_count: number }>();
    if (!row || !Number.isSafeInteger(row.active_count) || row.active_count < 0) {
      throw new Error('Invalid quota count');
    }
    return row.active_count;
  } catch {
    throw new WorkspaceContextError('Workspace quota database unavailable', 503);
  }
}
