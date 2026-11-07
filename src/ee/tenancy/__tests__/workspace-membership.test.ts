import { describe, it, expect } from 'vitest';
import {
  isWorkspaceRole,
  pickActiveMembership,
  listWorkspaceMemberships,
  ensureWorkspaceMembership,
  ensureUserWorkspaceMembership,
  type WorkspaceMembership,
} from '../workspace-membership';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

function member(userId: string, workspaceId: string, createdAtMs: number, role: WorkspaceMembership['role'] = 'OWNER'): WorkspaceMembership {
  return { userId, workspaceId, role, createdAtMs };
}

/** Minimal D1 stand-in that records the bind parameter and returns rows. */
function createMockD1(rows: Array<{ user_id: string; workspace_id: string; role: string; created_at_ms: number }>): { db: D1Database; bound: string[] } {
  const bound: string[] = [];
  const db = {
    prepare(_sql: string): D1PreparedStatement {
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]) {
          for (const v of values) bound.push(String(v));
          return stmt;
        },
        async first() { return null; },
        async firstRow() { return null; },
        async all<T>() { return { results: rows as unknown as T[], meta: { duration: 1 } }; },
        async run() { return { meta: { changes: 0, last_row_id: 0, duration: 1 } }; },
      };
      return stmt;
    },
    async batch() { return []; },
    async exec() { return { count: 1, duration: 1 }; },
    async dump() { return ''; },
  };
  return { db: db as unknown as D1Database, bound };
}

describe('workspace-membership', () => {
  describe('pickActiveMembership', () => {
    it('returns undefined when there is no membership', () => {
      expect(pickActiveMembership([])).toBeUndefined();
    });

    it('returns the single membership unchanged', () => {
      const only = member('u1', 'ws_only', 100);
      expect(pickActiveMembership([only])).toBe(only);
    });

    it('picks the most recently granted workspace when a user has several', () => {
      const older = member('u1', 'ws_old', 100);
      const newer = member('u1', 'ws_new', 900);
      expect(pickActiveMembership([older, newer])).toBe(newer);
      expect(pickActiveMembership([newer, older])).toBe(newer);
    });

    it('breaks an equal-timestamp tie by the stronger role', () => {
      const admin = member('u1', 'ws_admin', 500, 'ADMIN');
      const owner = member('u1', 'ws_owner', 500, 'OWNER');
      expect(pickActiveMembership([admin, owner])).toBe(owner);
    });
  });

  describe('isWorkspaceRole', () => {
    it('accepts the four canonical roles and rejects anything else', () => {
      expect(isWorkspaceRole('OWNER')).toBe(true);
      expect(isWorkspaceRole('VIEWER')).toBe(true);
      expect(isWorkspaceRole('SUPERADMIN')).toBe(false);
      expect(isWorkspaceRole('')).toBe(false);
      expect(isWorkspaceRole(null)).toBe(false);
    });
  });

  describe('listWorkspaceMemberships', () => {
    it('returns nothing when no database is available', async () => {
      const memberships = await listWorkspaceMemberships('u1', undefined);
      expect(memberships).toEqual([]);
    });

    it('maps D1 rows and sorts newest first', async () => {
      const { db } = createMockD1([
        { user_id: 'u1', workspace_id: 'ws_old', role: 'VIEWER', created_at_ms: 100 },
        { user_id: 'u1', workspace_id: 'ws_new', role: 'OWNER', created_at_ms: 900 },
      ]);
      const memberships = await listWorkspaceMemberships('u1', db);
      expect(memberships.map((m) => m.workspaceId)).toEqual(['ws_new', 'ws_old']);
      expect(memberships[0].role).toBe('OWNER');
      expect(memberships[1].role).toBe('VIEWER');
    });

    it('drops rows with no workspace and coerces an unknown role to VIEWER', async () => {
      const { db } = createMockD1([
        { user_id: 'u1', workspace_id: '', role: 'OWNER', created_at_ms: 1 },
        { user_id: 'u1', workspace_id: 'ws_ok', role: 'NOT_A_ROLE', created_at_ms: 2 },
      ]);
      const memberships = await listWorkspaceMemberships('u1', db);
      expect(memberships).toHaveLength(1);
      expect(memberships[0].workspaceId).toBe('ws_ok');
      expect(memberships[0].role).toBe('VIEWER');
    });

    it('fails closed to an empty list when the query throws', async () => {
      const db = {
        prepare(): D1PreparedStatement {
          throw new Error('D1 unavailable');
        },
      } as unknown as D1Database;
      expect(await listWorkspaceMemberships('u1', db)).toEqual([]);
    });

    it('provisions a personal workspace membership in D1 when requested', async () => {
      const { db, bound } = createMockD1([]);
      const membership = await ensureUserWorkspaceMembership('usr_123', db, 5000);
      expect(membership).toEqual({
        userId: 'usr_123',
        workspaceId: 'ws_usr_123',
        role: 'OWNER',
        createdAtMs: 5000,
      });
      expect(bound).toContain('usr_123');
      expect(bound).toContain('ws_usr_123');

      const withoutDb = await ensureWorkspaceMembership('usr_123', 'ws_custom', 'ADMIN', undefined, 6000);
      expect(withoutDb.workspaceId).toBe('ws_custom');
      expect(withoutDb.role).toBe('ADMIN');
    });
  });
});
