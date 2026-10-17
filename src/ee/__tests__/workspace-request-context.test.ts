import { describe, it, expect, beforeEach } from 'vitest';
import { defaultSaasEntitlementStore } from '../billing/saas-entitlement-store';
import {
  resolveWorkspaceTierContext,
  resolveActiveBotCount,
} from '../tenancy/workspace-request-context';

describe('workspace-request-context', () => {
  beforeEach(() => {
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
  });

  it('resolves explicit workspaceId and explicit valid tier or URL query params', async () => {
    const req = new Request('http://localhost/api/ee/credits');
    const ctx = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: 'ws_explicit',
      explicitTier: 'PREMIUM',
    });
    expect(ctx).toEqual({
      workspaceId: 'ws_explicit',
      tier: 'PREMIUM',
      invalidExplicitTier: undefined,
    });

    const queryReq = new Request('http://localhost/api/ee/quotas?workspaceId=ws_query&tier=ENTERPRISE');
    const queryCtx = await resolveWorkspaceTierContext(queryReq);
    expect(queryCtx).toEqual({
      workspaceId: 'ws_query',
      tier: 'ENTERPRISE',
      invalidExplicitTier: undefined,
    });
  });

  it('flags invalid explicit tier from payload or header', async () => {
    const req = new Request('http://localhost/api/ee/credits', {
      headers: { 'x-cashclaw-tier': 'GOLD_INVALID' },
    });
    const ctx = await resolveWorkspaceTierContext(req);
    expect(ctx.invalidExplicitTier).toBe('GOLD_INVALID');
    expect(ctx.tier).toBe('BASIC');
  });

  it('falls back to IPN store tier when no explicit or header tier is given', async () => {
    await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_ctx_1',
      workspaceId: 'ws_upgraded',
      targetTier: 'MASTER',
      paymentStatus: 'finished',
      payAmount: 499,
      payCurrency: 'USDT',
      processedAtMs: 1_760_000_000_000,
    });

    const req = new Request('http://localhost/api/ee/credits', {
      headers: { 'x-cashclaw-workspace': 'ws_upgraded' },
    });
    const ctx = await resolveWorkspaceTierContext(req);
    expect(ctx.workspaceId).toBe('ws_upgraded');
    expect(ctx.tier).toBe('MASTER');
  });

  it('parses x-cashclaw-active-bots header when valid', async () => {
    const req = new Request('http://localhost/api/ee/sync', {
      headers: { 'x-cashclaw-active-bots': '4' },
    });
    expect(await resolveActiveBotCount(req)).toBe(4);
  });

  it('falls back to live bot loader when x-cashclaw-active-bots header is absent', async () => {
    const req = new Request('http://localhost/api/ee/sync');
    const count = await resolveActiveBotCount(req, async () => ({
      data: [{ id: 'b1' }, { id: 'b2' }],
    }));
    expect(count).toBe(2);

    const countFromBotsField = await resolveActiveBotCount(req, async () => ({
      bots: [{ id: 'b1' }],
    }));
    expect(countFromBotsField).toBe(1);

    const countOnError = await resolveActiveBotCount(req, async () => {
      throw new Error('DB offline');
    });
    expect(countOnError).toBe(0);
  });
});
