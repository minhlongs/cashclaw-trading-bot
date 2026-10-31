// HTTP-boundary integration tests for SaaS runtime seams. D1 order transactions are exercised
// separately against Wrangler's local D1 SQLite database in nowpayments-order-store.d1.test.ts.
import { afterAll, afterEach, beforeAll, describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalD1Database } from '@/ee/billing/__tests__/local-d1-adapter';
import { SaasEntitlementStore } from '../billing/saas-entitlement-store';
import { createLocalToCloudSyncBundle } from '../sync/local-to-cloud-sync';
import { GET as getCredits, POST as postCredits } from '@/app/api/ee/credits/route';
import { GET as getAlphaFeed } from '@/app/api/ee/alpha-feed/route';
import { POST as postCloudAlert } from '@/app/api/ee/alerts/route';
import { POST as postCloudSync } from '@/app/api/ee/sync/route';

const auth = vi.hoisted(() => ({ resolve: vi.fn(), activeCount: vi.fn() }));
vi.mock('@/ee/tenancy/workspace-request-context', () => ({
  resolveWorkspaceTierContext: (...args: unknown[]) => auth.resolve(...args),
  resolveActiveBotCount: (...args: unknown[]) => auth.activeCount(...args),
  workspaceContextErrorResponse: (error: unknown) => Response.json({ ok: false, error: String(error) }, { status: 503 }),
}));

let localD1: LocalD1Database;
beforeAll(async () => {
  localD1 = new LocalD1Database(path.join(mkdtempSync(path.join(tmpdir(), 'pr35-seams-')), 'seams.db'));
  const migrationsDir = path.join(process.cwd(), 'migrations');
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await localD1.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await localD1.prepare(
    `INSERT INTO bots (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, created_at, updated_at, workspace_id)
     VALUES ('bot-a', 'server-user-a', 'Bot A', 'grid', 'BTC/USDT', 'binance', 'draft', '{}', 100, 1, 1, 'server-ws-a')`,
  ).run();
});
afterAll(() => vi.unstubAllEnvs());

function context(tier: 'BASIC' | 'PREMIUM' | 'ENTERPRISE' = 'BASIC', activeBotCount = 0) {
  return { db: localD1, userId: 'server-user-a', workspaceId: 'server-ws-a', role: 'OWNER', tier,
    entitlementExpiresAtMs: null, activeBotCount };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.resolve.mockResolvedValue(context());
  auth.activeCount.mockImplementation((ctx: { activeBotCount: number }) => ctx.activeBotCount);
  vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', 'local-test-alert-secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('EE HTTP authorization and entitlement seams', () => {
  it('disables legacy callback mutation that accepted caller-supplied workspace and tier', async () => {
    const store = new SaasEntitlementStore();
    await expect(store.recordIpnAndUpgradeTier({
      paymentId: 'pay_forged', workspaceId: 'victim', targetTier: 'MASTER', paymentStatus: 'finished',
      payAmount: 0.01, payCurrency: 'USD',
    })).rejects.toThrow('Legacy payment mutation disabled');
  });

  it('ignores query/body tier claims for credits and derives account from server context', async () => {
    auth.resolve.mockResolvedValue(context('BASIC'));
    const getRes = await getCredits(new Request('https://app.example/api/ee/credits?workspaceId=server-ws-a&tier=MASTER'));
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({ account: { tier: 'BASIC', balanceCredits: 1000 } });

    const postRes = await postCredits(new Request('https://app.example/api/ee/credits', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'server-ws-a', tier: 'MASTER', modelTier: 'FAST', promptTokens: 1000, completionTokens: 0 }),
    }));
    expect(postRes.status).toBe(200);
    expect(await postRes.json()).toMatchObject({ account: { tier: 'BASIC', balanceCredits: 999 } });
  });

  it('serves alpha-feed by stored tier, ignoring ?tier=MASTER', async () => {
    auth.resolve.mockResolvedValue(context('BASIC'));
    const response = await getAlphaFeed(new Request('https://app.example/api/ee/alpha-feed?tier=MASTER'));
    const body = await response.json() as { tier: string; count: number };
    expect(response.status).toBe(200);
    expect(body.tier).toBe('BASIC');
    expect(body.count).toBe(1);
  });

  it('uses verified workspace tier and D1 active-bot count for sync quota despite spoofed headers', async () => {
    const bundleResult = await createLocalToCloudSyncBundle({
      botName: 'CLI Local Bot', strategyId: 'volatilityDca', symbol: 'BTC/USDT',
      intervalMinutes: 60, feeBps: 10, slippageBps: 5, parameters: { baseOrderSizePct: 5 },
    });
    expect(bundleResult.ok).toBe(true);
    if (!bundleResult.ok) return;

    auth.resolve.mockResolvedValue(context('BASIC', 1));
    const blocked = await postCloudSync(new Request('https://app.example/api/ee/sync', {
      method: 'POST', headers: { 'x-cashclaw-tier': 'MASTER', 'x-cashclaw-active-bots': '-99' },
      body: JSON.stringify(bundleResult.data),
    }));
    expect(blocked.status).toBe(403);

    auth.resolve.mockResolvedValue(context('PREMIUM', 1));
    const allowed = await postCloudSync(new Request('https://app.example/api/ee/sync', {
      method: 'POST', headers: { 'x-cashclaw-tier': 'BASIC', 'x-cashclaw-active-bots': '99999' },
      body: JSON.stringify(bundleResult.data),
    }));
    expect(allowed.status).toBe(200);
  });

  it('enforces alert tier from workspace store and never accepts caller signing secret', async () => {
    const payload = { eventId: `evt-${Date.now()}`, workspaceId: 'server-ws-a', botId: 'bot-a',
      channel: 'WEBHOOK', message: 'Paper alert', timestampMs: Date.now(), tier: 'MASTER', signingSecret: 'attacker-secret' };
    auth.resolve.mockResolvedValue(context('BASIC'));
    const denied = await postCloudAlert(new Request('https://app.example/api/ee/alerts', {
      method: 'POST', body: JSON.stringify(payload),
    }));
    expect(denied.status).toBe(402);

    auth.resolve.mockResolvedValue(context('PREMIUM'));
    const allowed = await postCloudAlert(new Request('https://app.example/api/ee/alerts', {
      method: 'POST', body: JSON.stringify(payload),
    }));
    const body = await allowed.json() as { dispatched: boolean; delivered: boolean; deliveryStatus: string; envelope: { signatureHex: string } };
    expect(allowed.status).toBe(200);
    expect(body.dispatched).toBe(true);
    // Honest delivery reporting: with no channel configured the pipeline must NOT claim delivery.
    expect(body.delivered).toBe(false);
    expect(body.deliveryStatus).toBe('unconfigured');
    expect(body.envelope.signatureHex).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain('attacker-secret');
  });
});
