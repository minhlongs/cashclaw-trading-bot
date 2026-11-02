import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ createServerClient }));

import {
  resolveActiveBotCount,
  resolveWorkspaceTierContext,
} from '../tenancy/workspace-request-context';

function makeDb() {
  const sessions = new Map([
    ['session-a', { user_id: 'user-a', expires_at: Math.floor(Date.now() / 1000) + 3600 }],
    ['session-b', { user_id: 'user-b', expires_at: Math.floor(Date.now() / 1000) + 3600 }],
    ['session-expired', { user_id: 'user-a', expires_at: Math.floor(Date.now() / 1000) - 1 }],
  ]);
  const memberships = new Map<string, { owner_user_id: string; role: string; status: string; expires_at_ms: number | null; tier: string; revoked_at_ms: number | null }>([
    ['ws-a:user-a', { owner_user_id: 'user-a', role: 'OWNER', status: 'active', expires_at_ms: null, tier: 'BASIC', revoked_at_ms: null }],
    ['ws-paid:user-a', { owner_user_id: 'user-a', role: 'OWNER', status: 'active', expires_at_ms: Date.now() - 1000, tier: 'PREMIUM', revoked_at_ms: null }],
    ['ws-revoked:user-a', { owner_user_id: 'user-a', role: 'OWNER', status: 'active', expires_at_ms: null, tier: 'ENTERPRISE', revoked_at_ms: Date.now() - 1000 }],
  ]);
  let activeCount = 7;
  let failQueries = false;
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) { values = args; return stmt; },
        async first<T>() {
          if (failQueries) throw new Error('synthetic D1 outage');
          if (sql.includes('FROM user_sessions')) {
            const row = sessions.get(String(values[0]));
            return row && row.expires_at > Number(values[1]) ? { user_id: row.user_id } as T : null;
          }
          if (sql.includes('FROM saas_workspaces w')) {
            const row = memberships.get(`${String(values[0])}:${String(values[1])}`);
            return row ? { workspace_id: values[0], ...row } as T : null;
          }
          if (sql.includes('AS active_count')) return { active_count: activeCount } as T;
          return null;
        },
        async run() { return { meta: { changes: 1, last_row_id: 1, duration: 0 } }; },
        async all<T>() { return { results: [] as T[], meta: { duration: 0 } }; },
        async firstRow<T>() { return null as T | null; },
      };
      return stmt as unknown as D1PreparedStatement;
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) { return await Promise.all(statements.map((statement) => statement.run())) as unknown as T[]; },
    async exec() { return { count: 0, duration: 0 }; },
    async dump() { return ''; },
  } as unknown as D1Database;
  return {
    db,
    setActiveCount(value: number) { activeCount = value; },
    failQueries(value: boolean) { failQueries = value; },
  };
}

const testDb = makeDb();
const request = (url: string, session?: string, headers?: Record<string, string>) => new Request(url, {
  headers: { ...(session ? { cookie: `session_id=${session}` } : {}), ...headers },
});

describe('workspace-request-context security regressions', () => {
  beforeEach(() => {
    createServerClient.mockReturnValue(testDb.db);
    testDb.failQueries(false);
    testDb.setActiveCount(7);
  });

  it('uses the stored tier, ignoring query/header/body tier sources', async () => {
    const query = await resolveWorkspaceTierContext(request(
      'https://cashclaw.example/api/ee/quotas?workspaceId=ws-a&tier=MASTER', 'session-a',
      { 'x-cashclaw-tier': 'ENTERPRISE', 'x-cashclaw-workspace': 'ws-a' },
    ));
    expect(query.tier).toBe('BASIC');
    expect(query.workspaceId).toBe('ws-a');

    const explicitWorkspace = await resolveWorkspaceTierContext(request(
      'https://cashclaw.example/api/ee/credits', 'session-a',
    ), { explicitWorkspaceId: 'ws-a' });
    expect(explicitWorkspace.tier).toBe('BASIC');
    expect(explicitWorkspace).not.toHaveProperty('invalidExplicitTier');
  });

  it('requires a live session and fails closed on expired sessions or D1 errors', async () => {
    await expect(resolveWorkspaceTierContext(request('https://cashclaw.example/api/ee/quotas?workspaceId=ws-a')))
      .rejects.toMatchObject({ status: 401 });
    await expect(resolveWorkspaceTierContext(request('https://cashclaw.example/api/ee/quotas?workspaceId=ws-a', 'session-expired')))
      .rejects.toMatchObject({ status: 401 });

    testDb.failQueries(true);
    await expect(resolveWorkspaceTierContext(request('https://cashclaw.example/api/ee/quotas?workspaceId=ws-a', 'session-a')))
      .rejects.toMatchObject({ status: 503 });
  });

  it('conceals a workspace without active membership and enforces expiry/revocation as BASIC', async () => {
    await expect(resolveWorkspaceTierContext(request(
      'https://cashclaw.example/api/ee/quotas?workspaceId=ws-a', 'session-b',
    ))).rejects.toMatchObject({ status: 404 });
    await expect(resolveWorkspaceTierContext(request(
      'https://cashclaw.example/api/ee/quotas?workspaceId=does-not-exist', 'session-a',
    ))).rejects.toMatchObject({ status: 404 });

    const expired = await resolveWorkspaceTierContext(request(
      'https://cashclaw.example/api/ee/quotas?workspaceId=ws-paid', 'session-a',
    ));
    expect(expired.tier).toBe('BASIC');
    const revoked = await resolveWorkspaceTierContext(request(
      'https://cashclaw.example/api/ee/quotas?workspaceId=ws-revoked', 'session-a',
    ));
    expect(revoked.tier).toBe('BASIC');
  });

  it('ignores forged active-bot headers and obtains count from D1 for the authorized workspace', async () => {
    const context = await resolveWorkspaceTierContext(request(
      'https://cashclaw.example/api/bots?workspaceId=ws-a', 'session-a', { 'x-cashclaw-active-bots': '0' },
    ));
    expect(await resolveActiveBotCount(context)).toBe(7);
  });

  it('fails closed instead of treating a quota database error as zero usage', async () => {
    const context = await resolveWorkspaceTierContext(request(
      'https://cashclaw.example/api/bots?workspaceId=ws-a', 'session-a',
    ));
    testDb.failQueries(true);
    await expect(resolveActiveBotCount(context)).rejects.toMatchObject({ status: 503 });
  });
});
