// Workspace membership lookup: resolves which workspace a signed-in user may read.
// The mapping lives in D1 (migration 0015) so that a user with several workspaces
// is reported explicitly instead of being silently bound to whichever row a
// SELECT happened to return first.

import type { D1Database } from '@/lib/db/types';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'TRADER' | 'VIEWER';

export interface WorkspaceMembership {
  readonly userId: string;
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
  readonly createdAtMs: number;
}

const ROLE_RANK: Readonly<Record<WorkspaceRole, number>> = {
  OWNER: 4,
  ADMIN: 3,
  TRADER: 2,
  VIEWER: 1,
};

const WORKSPACE_ROLES: readonly WorkspaceRole[] = ['OWNER', 'ADMIN', 'TRADER', 'VIEWER'];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === 'string' && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

/** Newest membership wins, because the most recently granted workspace is the
 *  one the user is acting in; a user with exactly one membership gets that one. */
export function pickActiveMembership(memberships: readonly WorkspaceMembership[]): WorkspaceMembership | undefined {
  let best: WorkspaceMembership | undefined;
  for (const membership of memberships) {
    if (!best) { best = membership; continue; }
    if (membership.createdAtMs > best.createdAtMs) { best = membership; continue; }
    if (membership.createdAtMs === best.createdAtMs && ROLE_RANK[membership.role] > ROLE_RANK[best.role]) {
      best = membership;
    }
  }
  return best;
}

async function fetchD1Memberships(db: D1Database, userId: string): Promise<WorkspaceMembership[]> {
  const { results } = await db
    .prepare('SELECT user_id, workspace_id, role, created_at_ms FROM saas_workspace_members WHERE user_id = ?')
    .bind(userId)
    .all<{ user_id: string; workspace_id: string; role: string; created_at_ms: number }>();

  return (results ?? [])
    .filter((row) => typeof row.workspace_id === 'string' && row.workspace_id.length > 0)
    .map((row) => ({
      userId: row.user_id,
      workspaceId: row.workspace_id,
      role: isWorkspaceRole(row.role) ? row.role : 'VIEWER',
      createdAtMs: typeof row.created_at_ms === 'number' ? row.created_at_ms : 0,
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function listWorkspaceMemberships(
  userId: string,
  db?: D1Database,
): Promise<WorkspaceMembership[]> {
  if (!db) return [];
  try {
    return await fetchD1Memberships(db, userId);
  } catch {
    return [];
  }
}

export async function ensureWorkspaceMembership(
  userId: string,
  workspaceId: string,
  role: WorkspaceRole = 'OWNER',
  db?: D1Database,
  nowMs: number = Date.now(),
): Promise<WorkspaceMembership> {
  if (db) {
    try {
      await db
        .prepare(
          `INSERT OR IGNORE INTO saas_workspace_members (user_id, workspace_id, role, created_at_ms)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(userId, workspaceId, role, nowMs)
        .run();
    } catch {
      // Non-fatal in synthetic environments where migration 0015 is not applied.
    }
  }
  return { userId, workspaceId, role, createdAtMs: nowMs };
}

export async function ensureUserWorkspaceMembership(
  userId: string,
  db?: D1Database,
  nowMs: number = Date.now(),
): Promise<WorkspaceMembership> {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return ensureWorkspaceMembership(userId, `ws_${safeId}`, 'OWNER', db, nowMs);
}
