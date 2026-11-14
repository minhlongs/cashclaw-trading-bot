// Cross-tenant workspace isolation tests for /api/ee/alerts, /api/ee/credits, and /api/ee/scheduler.
// Verifies that authenticated session users (`x-user-id`) can never spoof another tenant's
// workspaceId in query parameters or request bodies — whether they have an existing D1
// membership or zero membership rows.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

const mockMembershipRows: Array<{
  user_id: string;
  workspace_id: string;
  role: string;
  created_at_ms: number;
}> = [];

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => {
    const prepare = (_sql: string): D1PreparedStatement => {
      let boundUserId = '';
      const stmt: D1PreparedStatement = {
        bind(value: unknown) {
          boundUserId = String(value);
          return stmt;
        },
        async first() { return null; },
        async firstRow() { return null; },
        async all<T>() {
          return {
            results: mockMembershipRows.filter((row) => row.user_id === boundUserId) as unknown as T[],
            meta: { duration: 1 },
          };
        },
        async run() { return { meta: { changes: 1, last_row_id: 1, duration: 1 } }; },
      };
      return stmt;
    };
    return { prepare } as unknown as D1Database;
  },
}));

import { resolveEffectiveWorkspaceId } from '@/ee/tenancy/workspace-request-context';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import { defaultCreditLedgerStore } from '@/ee/deliberation-cloud/llm-credit-ledger';
import { defaultCloudSchedulerCoordinator } from '@/ee/scheduler/cloud-scheduler-coordinator';
import { POST as postCloudAlert } from '../alerts/route';
import { GET as getCredits, POST as postCredits } from '../credits/route';
import { GET as getScheduler, POST as postScheduler } from '../scheduler/route';

async function seedWorkspaceTier(
  workspaceId: string,
  targetTier: 'BASIC' | 'PREMIUM' | 'ENTERPRISE' | 'MASTER',
) {
  await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
    paymentId: `pay_iso_${workspaceId}`,
    workspaceId,
    targetTier,
    paymentStatus: 'finished',
    payAmount: 29,
    payCurrency: 'USDT',
  });
}

describe('Cross-tenant workspace isolation across EE routes', () => {
  beforeEach(() => {
    mockMembershipRows.length = 0;
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
    defaultCreditLedgerStore.resetMemoryForTesting();
    defaultCloudSchedulerCoordinator.clearLeases();
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', 'isolation-test-alert-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolveEffectiveWorkspaceId derives personal workspace for unenrolled session user instead of trusting explicitWorkspaceId', () => {
    const authedReq = new Request('http://localhost/api/ee/credits?workspaceId=ws_victim', {
      headers: { 'x-user-id': 'usr_new_signup' },
    });
    expect(resolveEffectiveWorkspaceId(authedReq, undefined, 'ws_victim')).toBe('ws_usr_new_signup');
    expect(resolveEffectiveWorkspaceId(authedReq, 'ws_enrolled', 'ws_victim')).toBe('ws_enrolled');

    const unauthedReq = new Request('http://localhost/api/ee/credits?workspaceId=ws_local');
    expect(resolveEffectiveWorkspaceId(unauthedReq, undefined, 'ws_local')).toBe('ws_local');
    expect(resolveEffectiveWorkspaceId(unauthedReq, undefined, '   ')).toBeUndefined();
  });

  it('POST /api/ee/alerts rejects spoofed cross-tenant workspaceId with 403 WORKSPACE_FORBIDDEN and allows own workspace', async () => {
    await seedWorkspaceTier('ws_attacker', 'PREMIUM');
    await seedWorkspaceTier('ws_victim', 'MASTER');
    mockMembershipRows.push({ user_id: 'usr_attacker', workspace_id: 'ws_attacker', role: 'OWNER', created_at_ms: 100 });

    const spoofRes = await postCloudAlert(
      new Request('http://localhost/api/ee/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_attacker' },
        body: JSON.stringify({
          eventId: 'evt_spoof_ws_1',
          workspaceId: 'ws_victim',
          botId: 'bot_1',
          channel: 'WEBHOOK',
          message: 'Attempted cross-tenant alert',
          timestampMs: 1_770_000_100_000,
        }),
      }),
    );

    expect(spoofRes.status).toBe(403);
    const spoofBody = (await spoofRes.json()) as { ok: boolean; code: string };
    expect(spoofBody.ok).toBe(false);
    expect(spoofBody.code).toBe('WORKSPACE_FORBIDDEN');

    const ownRes = await postCloudAlert(
      new Request('http://localhost/api/ee/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_attacker' },
        body: JSON.stringify({
          eventId: 'evt_own_ws_1',
          workspaceId: 'ws_attacker',
          botId: 'bot_1',
          channel: 'WEBHOOK',
          message: 'Authorized tenant alert',
          timestampMs: 1_770_000_100_000,
        }),
      }),
    );
    expect(ownRes.status).toBe(200);
    const body = (await ownRes.json()) as { ok: boolean; tier: string; envelope: { payloadJson: string } };
    expect(body.tier).toBe('PREMIUM');
    const signedEvent = JSON.parse(body.envelope.payloadJson) as { workspaceId: string };
    expect(signedEvent.workspaceId).toBe('ws_attacker');
  });

  it('GET and POST /api/ee/credits reject cross-tenant workspaceId with 403 and scope omitted workspaceId to personal workspace', async () => {
    await seedWorkspaceTier('ws_victim_credits', 'ENTERPRISE');
    defaultCreditLedgerStore.getOrCreateAccount('ws_victim_credits', 'ENTERPRISE');

    const spoofGetRes = await getCredits(
      new Request('http://localhost/api/ee/credits?workspaceId=ws_victim_credits', {
        headers: { 'x-user-id': 'usr_zero_rows' },
      }),
    );
    expect(spoofGetRes.status).toBe(403);

    const getRes = await getCredits(
      new Request('http://localhost/api/ee/credits', {
        headers: { 'x-user-id': 'usr_zero_rows' },
      }),
    );
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      account: { workspaceId: string; tier: string; balanceCredits: number };
    };
    expect(getBody.account.workspaceId).toBe('ws_usr_zero_rows');
    expect(getBody.account.tier).toBe('BASIC');
    expect(getBody.account.balanceCredits).toBe(1_000);

    const spoofPostRes = await postCredits(
      new Request('http://localhost/api/ee/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_zero_rows' },
        body: JSON.stringify({
          workspaceId: 'ws_victim_credits',
          modelTier: 'REASONING',
          promptTokens: 1_500,
          completionTokens: 500,
        }),
      }),
    );
    expect(spoofPostRes.status).toBe(403);

    const postRes = await postCredits(
      new Request('http://localhost/api/ee/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_zero_rows' },
        body: JSON.stringify({
          modelTier: 'REASONING',
          promptTokens: 1_500,
          completionTokens: 500,
        }),
      }),
    );
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as {
      workspaceId: string;
      account: { workspaceId: string; balanceCredits: number };
    };
    expect(postBody.workspaceId).toBe('ws_usr_zero_rows');
    expect(postBody.account.balanceCredits).toBe(992);

    const victimAccount = defaultCreditLedgerStore.getOrCreateAccount('ws_victim_credits', 'ENTERPRISE');
    expect(victimAccount.balanceCredits).toBe(50_000);
    expect(victimAccount.consumedCredits).toBe(0);
  });

  it('GET and POST /api/ee/scheduler reject cross-tenant workspaceId with 403 and scope own workspace cleanly', async () => {
    mockMembershipRows.push({ user_id: 'usr_attacker', workspace_id: 'ws_attacker_sched', role: 'OWNER', created_at_ms: 100 });
    defaultCloudSchedulerCoordinator.acquireTickLease({
      botId: 'bot_victim_1', workspaceId: 'ws_victim_sched', isolateId: 'iso_victim', nowMs: 1_770_000_000_000,
    });

    const spoofGetRes = await getScheduler(
      new Request('http://localhost/api/ee/scheduler?nowMs=1770000005000&workspaceId=ws_victim_sched', {
        headers: { 'x-user-id': 'usr_attacker' },
      }),
    );
    expect(spoofGetRes.status).toBe(403);

    const getRes = await getScheduler(
      new Request('http://localhost/api/ee/scheduler?nowMs=1770000005000', {
        headers: { 'x-user-id': 'usr_attacker' },
      }),
    );
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { workspaceId: string; activeLeaseCount: number };
    expect(getBody.workspaceId).toBe('ws_attacker_sched');
    expect(getBody.activeLeaseCount).toBe(0);

    const spoofPostRes = await postScheduler(
      new Request('http://localhost/api/ee/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_attacker' },
        body: JSON.stringify({
          botId: 'bot_victim_2', workspaceId: 'ws_victim_sched', isolateId: 'iso_attacker', nowMs: 1_770_000_005_000,
        }),
      }),
    );
    expect(spoofPostRes.status).toBe(403);

    const postRes = await postScheduler(
      new Request('http://localhost/api/ee/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_attacker' },
        body: JSON.stringify({
          botId: 'bot_victim_2', workspaceId: 'ws_attacker_sched', isolateId: 'iso_attacker', nowMs: 1_770_000_005_000,
        }),
      }),
    );
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as { lease: { workspaceId: string } };
    expect(postBody.lease.workspaceId).toBe('ws_attacker_sched');

    expect(defaultCloudSchedulerCoordinator.activeLeaseCount(1_770_000_005_000, 'ws_victim_sched')).toBe(1);
    const victimLease2 = defaultCloudSchedulerCoordinator.acquireTickLease({
      botId: 'bot_victim_2', workspaceId: 'ws_victim_sched', isolateId: 'iso_victim', nowMs: 1_770_000_005_000,
    });
    expect(victimLease2.ok).toBe(true);
  });
});
