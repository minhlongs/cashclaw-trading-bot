import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defaultSaasEntitlementStore } from '../billing/saas-entitlement-store';
import {
  resolveWorkspaceTierContext,
  resolveActiveBotCount,
} from '../tenancy/workspace-request-context';
import { listWorkspaceMemberships } from '../tenancy/workspace-membership';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

const mockRows: Array<{ user_id: string; workspace_id: string; role: string; created_at_ms: number }> = [];

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => {
    if (mockRows.length === 0) return null;
    // Filters on the bound user id the way D1 does, so a query for one user
    // cannot observe another user's rows.
    const prepare = (_sql: string): D1PreparedStatement => {
      let boundUserId = '';
      const stmt: D1PreparedStatement = {
        bind(value: unknown) { boundUserId = String(value); return stmt; },
        async first() { return null; },
        async firstRow() { return null; },
        async all<T>() {
          return { results: mockRows.filter((row) => row.user_id === boundUserId) as unknown as T[], meta: { duration: 1 } };
        },
        async run() { return { meta: { changes: 0, last_row_id: 0, duration: 1 } }; },
      };
      return stmt;
    };
    return { prepare } as unknown as D1Database;
  },
}));

/** Seeds a workspace tier through the production path — a verified IPN upgrade. */
async function seedWorkspaceTier(workspaceId: string, targetTier: 'BASIC' | 'PREMIUM' | 'ENTERPRISE' | 'MASTER') {
  await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
    paymentId: `pay_seed_${workspaceId}`,
    workspaceId,
    targetTier,
    paymentStatus: 'finished',
    payAmount: 29,
    payCurrency: 'USDT',
  });
}

describe('workspace-request-context', () => {
  beforeEach(() => {
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
    mockRows.length = 0;
  });

  it('ignores a self-declared tier header and returns the D1 tier', async () => {
    await seedWorkspaceTier('ws_seed_premium', 'PREMIUM');

    const req = new Request('http://localhost/api/ee/quotas?workspaceId=ws_seed_premium', {
      headers: { 'x-cashclaw-tier': 'MASTER' },
    });
    const ctx = await resolveWorkspaceTierContext(req);

    expect(ctx.workspaceId).toBe('ws_seed_premium');
    expect(ctx.tier).toBe('PREMIUM');
  });

  it('ignores a self-declared tier query parameter', async () => {
    await seedWorkspaceTier('ws_seed_enterprise', 'ENTERPRISE');

    const req = new Request(
      'http://localhost/api/ee/quotas?workspaceId=ws_seed_enterprise&tier=MASTER',
    );
    const ctx = await resolveWorkspaceTierContext(req);

    expect(ctx.workspaceId).toBe('ws_seed_enterprise');
    expect(ctx.tier).toBe('ENTERPRISE');
  });

  it('ignores a self-declared tier on an unknown workspace', async () => {
    const req = new Request(
      'http://localhost/api/ee/quotas?workspaceId=ws_never_paid&tier=MASTER',
      { headers: { 'x-cashclaw-tier': 'MASTER' } },
    );
    const ctx = await resolveWorkspaceTierContext(req);

    expect(ctx.workspaceId).toBe('ws_never_paid');
    expect(ctx.tier).toBe('BASIC');
  });

  it('falls back to BASIC when no workspace is identified', async () => {
    const ctx = await resolveWorkspaceTierContext(new Request('http://localhost/api/ee/quotas'));
    expect(ctx.workspaceId).toBeUndefined();
    expect(ctx.tier).toBe('BASIC');
  });

  it('reads the upgraded tier from the entitlement store via x-cashclaw-workspace', async () => {
    await seedWorkspaceTier('ws_upgraded', 'MASTER');

    const req = new Request('http://localhost/api/ee/quotas', {
      headers: { 'x-cashclaw-workspace': 'ws_upgraded', 'x-cashclaw-tier': 'BASIC' },
    });
    const ctx = await resolveWorkspaceTierContext(req);

    expect(ctx.workspaceId).toBe('ws_upgraded');
    expect(ctx.tier).toBe('MASTER');
  });

  it('prefers an explicit workspaceId over request-supplied identifiers', async () => {
    await seedWorkspaceTier('ws_from_option', 'ENTERPRISE');

    const req = new Request(
      'http://localhost/api/ee/quotas?workspaceId=ws_from_query&tier=MASTER',
      { headers: { 'x-cashclaw-workspace': 'ws_from_header' } },
    );
    const ctx = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: 'ws_from_option' });

    expect(ctx.workspaceId).toBe('ws_from_option');
    expect(ctx.tier).toBe('ENTERPRISE');
  });

  it('takes the live bot count from the loader and ignores any request-supplied count', async () => {
    const req = new Request('http://localhost/api/ee/sync', {
      headers: { 'x-cashclaw-active-bots': '0' },
    });

    const count = await resolveActiveBotCount(async () => ({
      data: [{ id: 'b1' }, { id: 'b2' }],
    }));
    expect(count).toBe(2);

    const fromBotsField = await resolveActiveBotCount(async () => ({ bots: [{ id: 'b1' }] }));
    expect(fromBotsField).toBe(1);

    const onError = await resolveActiveBotCount(async () => { throw new Error('DB offline'); });
    expect(onError).toBe(0);

    const withoutLoader = await resolveActiveBotCount();
    expect(withoutLoader).toBe(0);

    // The request carrying a spoofed header must not influence any of the above.
    expect(req.headers.get('x-cashclaw-active-bots')).toBe('0');
  });

  it('derives the workspace from the session user when the request names none', async () => {
    await seedWorkspaceTier('ws_session_user', 'ENTERPRISE');
    mockRows.push({ user_id: 'usr_alice', workspace_id: 'ws_session_user', role: 'OWNER', created_at_ms: 10 });

    const ctx = await resolveWorkspaceTierContext(
      new Request('http://localhost/api/ee/quotas', { headers: { 'x-user-id': 'usr_alice' } }),
    );

    expect(ctx.workspaceId).toBe('ws_session_user');
    expect(ctx.tier).toBe('ENTERPRISE');
  });

  it('gives each signed-in user their own workspace, not a shared default', async () => {
    await seedWorkspaceTier('ws_user_a', 'BASIC');
    await seedWorkspaceTier('ws_user_b', 'MASTER');
    mockRows.push(
      { user_id: 'usr_a', workspace_id: 'ws_user_a', role: 'OWNER', created_at_ms: 10 },
      { user_id: 'usr_b', workspace_id: 'ws_user_b', role: 'OWNER', created_at_ms: 10 },
    );

    const ctxA = await resolveWorkspaceTierContext(
      new Request('http://localhost/api/ee/quotas', { headers: { 'x-user-id': 'usr_a' } }),
    );
    const ctxB = await resolveWorkspaceTierContext(
      new Request('http://localhost/api/ee/quotas', { headers: { 'x-user-id': 'usr_b' } }),
    );

    expect(ctxA.tier).toBe('BASIC');
    expect(ctxB.tier).toBe('MASTER');
  });

  it('reports every workspace a user belongs to instead of hiding the ambiguity', async () => {
    await seedWorkspaceTier('ws_multi_new', 'PREMIUM');
    await seedWorkspaceTier('ws_multi_old', 'BASIC');
    mockRows.push(
      { user_id: 'usr_multi', workspace_id: 'ws_multi_old', role: 'OWNER', created_at_ms: 100 },
      { user_id: 'usr_multi', workspace_id: 'ws_multi_new', role: 'ADMIN', created_at_ms: 900 },
    );

    const ctx = await resolveWorkspaceTierContext(
      new Request('http://localhost/api/ee/quotas', { headers: { 'x-user-id': 'usr_multi' } }),
    );

    // The most recent membership is active, but the others stay visible so the
    // caller can offer a workspace switch instead of silently pinning one.
    expect(ctx.workspaceId).toBe('ws_multi_new');
    expect(ctx.tier).toBe('PREMIUM');
    // Newest first, matching the ordering `listWorkspaceMemberships` applies.
    expect(ctx.memberWorkspaceIds).toEqual(['ws_multi_new', 'ws_multi_old']);
  });

  it('selects an explicitly named workspace when the session user is a member of it', async () => {
    await seedWorkspaceTier('ws_named', 'ENTERPRISE');
    await seedWorkspaceTier('ws_session_user', 'BASIC');
    mockRows.push(
      { user_id: 'usr_alice', workspace_id: 'ws_named', role: 'ADMIN', created_at_ms: 5 },
      { user_id: 'usr_alice', workspace_id: 'ws_session_user', role: 'OWNER', created_at_ms: 10 },
    );

    const ctx = await resolveWorkspaceTierContext(
      new Request('http://localhost/api/ee/quotas?workspaceId=ws_named', {
        headers: { 'x-user-id': 'usr_alice' },
      }),
    );

    expect(ctx.workspaceId).toBe('ws_named');
    expect(ctx.tier).toBe('ENTERPRISE');
  });

  it('falls back to BASIC when the session user has no membership row', async () => {
    mockRows.length = 0;

    const ctx = await resolveWorkspaceTierContext(
      new Request('http://localhost/api/ee/quotas', { headers: { 'x-user-id': 'usr_nobody' } }),
    );

    expect(ctx.workspaceId).toBeUndefined();
    expect(ctx.tier).toBe('BASIC');
  });

  it('never lets a request-supplied workspace header or query reach another user\'s workspace', async () => {
    await seedWorkspaceTier('ws_victim', 'MASTER');
    await seedWorkspaceTier('ws_attacker_ws', 'BASIC');
    mockRows.push({ user_id: 'usr_attacker', workspace_id: 'ws_attacker_ws', role: 'OWNER', created_at_ms: 10 });

    const ctx = await resolveWorkspaceTierContext(
      new Request('http://localhost/api/ee/quotas?workspaceId=ws_victim', {
        headers: { 'x-user-id': 'usr_attacker', 'x-cashclaw-workspace': 'ws_victim' },
      }),
    );

    expect(ctx.workspaceId).toBe('ws_attacker_ws');
    expect(ctx.tier).toBe('BASIC');
  });
});

describe('listWorkspaceMemberships (via resolver path)', () => {
  beforeEach(() => {
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
    mockRows.length = 0;
  });

  it('returns an empty list without a database, so the resolver falls back to BASIC', async () => {
    mockRows.length = 0;
    expect(await listWorkspaceMemberships('usr_alice', undefined)).toEqual([]);
  });
});
