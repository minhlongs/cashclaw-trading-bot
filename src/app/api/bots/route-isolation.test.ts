// Cross-tenant session user scoping tests for /api/bots and /api/ee/sync.
// Verifies that x-user-id is threaded into botListHandler, botCreateHandler,
// and active-bot quota counting so tenants never leak or count each other's bots.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBotListHandler = vi.fn();
const mockBotCreateHandler = vi.fn();
const mockVerifyAndImport = vi.fn();

vi.mock('@/forest/api/routes', () => ({
  botListHandler: (...args: unknown[]) => mockBotListHandler(...args),
  botCreateHandler: (...args: unknown[]) => mockBotCreateHandler(...args),
}));

vi.mock('@/ee/sync/local-to-cloud-sync', () => ({
  verifyAndImportCloudSyncBundle: (...args: unknown[]) => mockVerifyAndImport(...args),
}));

vi.mock('@/ee/tenancy/workspace-request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ee/tenancy/workspace-request-context')>();
  return {
    ...actual,
    resolveWorkspaceTierContext: vi.fn(async () => ({
      workspaceId: 'ws_usr_tenant_a',
      tier: 'BASIC',
    })),
  };
});

const { GET: getBots, POST: postBots } = await import('./route');
const { POST: postEeSync } = await import('../ee/sync/route');

describe('Session user scoping on /api/bots and /api/ee/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBotListHandler.mockResolvedValue({ ok: true, data: [] });
    mockBotCreateHandler.mockResolvedValue({ ok: true, data: { id: 'bot_a_1' } });
    mockVerifyAndImport.mockResolvedValue({
      ok: true,
      data: {
        botName: 'Synced Tenant A Bot',
        strategyId: 'grid',
        symbol: 'BTC/USDT',
        intervalMinutes: 15,
        feeBps: 10,
        slippageBps: 5,
        parameters: { levels: 10 },
      },
    });
  });

  it('GET /api/bots forwards x-user-id to botListHandler', async () => {
    mockBotListHandler.mockResolvedValue({
      ok: true,
      data: [{ id: 'bot_a_1', status: 'running' }],
    });

    const res = await getBots(
      new Request('http://localhost/api/bots', {
        headers: { 'x-user-id': 'usr_tenant_a' },
      }),
    );

    expect(res.status).toBe(200);
    expect(mockBotListHandler).toHaveBeenCalledWith('usr_tenant_a');
  });

  it('POST /api/bots scopes active-bot quota check and bot creation to x-user-id', async () => {
    // Tenant A has 0 running bots even if other tenants have bots in D1
    mockBotListHandler.mockImplementation(async (userId?: string) => ({
      ok: true,
      data: userId === 'usr_tenant_a' ? [] : [{ id: 'other_bot', status: 'running' }],
    }));

    const res = await postBots(
      new Request('http://localhost/api/bots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_tenant_a',
        },
        body: JSON.stringify({
          id: 'bot_a_1',
          name: 'Tenant A Grid Bot',
          strategy: 'grid',
          pair: 'BTC/USDT',
          exchange: 'binance',
          capital: 1000,
          mode: 'paper',
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(mockBotListHandler).toHaveBeenCalledWith('usr_tenant_a');
    expect(mockBotCreateHandler).toHaveBeenCalledTimes(1);
    expect(mockBotCreateHandler.mock.calls[0][1]).toBe('usr_tenant_a');
  });

  it('POST /api/ee/sync scopes active-bot count to x-user-id when checking tier quota', async () => {
    mockBotListHandler.mockImplementation(async (userId?: string) => ({
      ok: true,
      data: userId === 'usr_tenant_a' ? [] : [{ id: 'other_bot', status: 'running' }],
    }));

    const res = await postEeSync(
      new Request('http://localhost/api/ee/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_tenant_a',
        },
        body: JSON.stringify({
          payloadJson: '{}',
          sha256Hex: 'deadbeef',
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(mockBotListHandler).toHaveBeenCalledWith('usr_tenant_a');
    expect(mockBotCreateHandler).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Synced Tenant A Bot', mode: 'paper' }),
      'usr_tenant_a',
    );
    const body = (await res.json()) as { ok: boolean; imported: boolean; botId: string };
    expect(body.ok).toBe(true);
    expect(body.imported).toBe(true);
    expect(body.botId).toBe('bot_a_1');
  });
});
