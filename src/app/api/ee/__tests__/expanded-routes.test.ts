// Test suite for newly expanded Cloud SaaS EE API routes
// Covers /api/ee/alpha-feed, /api/ee/credits, /api/ee/alerts, /api/ee/scheduler, /api/ee/telemetry

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalD1Database } from '@/ee/billing/__tests__/local-d1-adapter';

const auth = vi.hoisted(() => ({ resolve: vi.fn(), activeCount: vi.fn() }));
vi.mock('@/ee/tenancy/workspace-request-context', () => ({
  resolveWorkspaceTierContext: (...args: unknown[]) => auth.resolve(...args),
  resolveActiveBotCount: (...args: unknown[]) => auth.activeCount(...args),
  workspaceContextErrorResponse: (error: unknown) => Response.json({ ok: false, error: String(error) }, { status: 503 }),
}));

let localD1: LocalD1Database;
beforeAll(async () => {
  localD1 = new LocalD1Database(path.join(mkdtempSync(path.join(tmpdir(), 'pr35-ee-routes-')), 'ee.db'));
  const migrationsDir = path.join(process.cwd(), 'migrations');
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await localD1.exec(readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  for (const [botId, workspaceId] of [['bot_vol_1', 'ws_abc'], ['bot_vol_basic', 'ws_basic_alerts'], ['bot_sched_1', 'ws_xyz']]) {
    await localD1.prepare(
      `INSERT INTO bots (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, created_at, updated_at, workspace_id)
       VALUES (?, 'user-a', ?, 'grid', 'BTC/USDT', 'binance', 'draft', '{}', 100, 1, 1, ?)`,
    ).bind(botId, `Bot ${botId}`, workspaceId).run();
  }
});

function serverContext(tier: 'BASIC' | 'PREMIUM' | 'ENTERPRISE' = 'BASIC', workspaceId = 'ws_server', db?: unknown) {
  return { db: db ?? { prepare: () => ({ bind: () => ({ first: async () => ({ id: 'bot-1' }) }) }) },
    userId: 'user-a', workspaceId, role: 'OWNER', tier, entitlementExpiresAtMs: null, activeBotCount: 0 };
}

import { GET as alphaFeedGet } from '../alpha-feed/route';
import { GET as creditsGet, POST as creditsPost } from '../credits/route';
import { POST as alertsPost } from '../alerts/route';
import { GET as schedulerGet, POST as schedulerPost } from '../scheduler/route';
import { GET as telemetryGet, POST as telemetryPost } from '../telemetry/route';
import { cronSchedulerCoordinator } from '@/worker-cron';
import { defaultCloudSchedulerCoordinator } from '@/ee/scheduler/cloud-scheduler-coordinator';

function postJson(url: string, body: unknown): Request {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('Expanded Cloud SaaS EE API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.resolve.mockResolvedValue(serverContext());
    auth.activeCount.mockImplementation((context: { activeBotCount: number }) => context.activeBotCount);
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', 'test-alert-signing-secret');
  });
  it('GET /api/ee/alpha-feed ignores forged query tier and uses the server-resolved entitlement', async () => {
    auth.resolve.mockResolvedValueOnce(serverContext('BASIC', 'ws_a'));
    const resBasic = await alphaFeedGet(new Request('http://localhost/api/ee/alpha-feed?tier=MASTER'));
    const dataBasic = (await resBasic.json()) as { tier: string; fullFeedAccess: boolean; feed: unknown[] };
    expect(resBasic.status).toBe(200);
    expect(dataBasic.tier).toBe('BASIC');
    expect(dataBasic.fullFeedAccess).toBe(false);
    expect(dataBasic.feed.length).toBe(1);

    auth.resolve.mockResolvedValueOnce(serverContext('ENTERPRISE', 'ws_b'));
    const resEnterprise = await alphaFeedGet(new Request('http://localhost/api/ee/alpha-feed?tier=BASIC'));
    const dataEnterprise = (await resEnterprise.json()) as { tier: string; fullFeedAccess: boolean; feed: unknown[] };
    expect(resEnterprise.status).toBe(200);
    expect(dataEnterprise.tier).toBe('ENTERPRISE');
    expect(dataEnterprise.fullFeedAccess).toBe(true);
    expect(dataEnterprise.feed.length).toBe(3);
  });

  it('GET and POST /api/ee/credits ignore caller tiers and reconcile from server entitlement', async () => {
    const { defaultCreditLedgerStore } = await import('@/ee/deliberation-cloud/llm-credit-ledger');
    defaultCreditLedgerStore.resetMemoryForTesting();
    auth.resolve.mockResolvedValue(serverContext('PREMIUM', 'ws_123'));
    const resGet = await creditsGet(new Request('http://localhost/api/ee/credits?workspaceId=ws_123&tier=MASTER'));
    const dataGet = (await resGet.json()) as { ok: boolean; account: { tier: string; balanceCredits: number } };
    expect(resGet.status).toBe(200);
    expect(dataGet.account).toMatchObject({ tier: 'PREMIUM', balanceCredits: 10_000 });

    const resPost = await creditsPost(postJson('http://localhost/api/ee/credits', {
      workspaceId: 'ws_123', tier: 'BASIC', modelTier: 'REASONING', promptTokens: 1500, completionTokens: 500,
    }));
    const dataPost = (await resPost.json()) as { costCredits: number; account: { balanceCredits: number; consumedCredits: number } };
    expect(resPost.status).toBe(200);
    expect(dataPost.costCredits).toBe(8);
    expect(dataPost.account).toMatchObject({ balanceCredits: 9_992, consumedCredits: 8 });

    auth.resolve.mockResolvedValue(serverContext('ENTERPRISE', 'ws_123'));
    const upgraded = await creditsGet(new Request('http://localhost/api/ee/credits?workspaceId=ws_123&tier=BASIC'));
    const dataUpgraded = (await upgraded.json()) as { account: { tier: string; balanceCredits: number; consumedCredits: number } };
    expect(dataUpgraded.account).toMatchObject({ tier: 'ENTERPRISE', balanceCredits: 49_992, consumedCredits: 8 });
  });

  it('POST /api/ee/alerts uses stored tier and server signing secret, then deduplicates', async () => {
    auth.resolve.mockResolvedValueOnce(serverContext('PREMIUM', 'ws_abc', localD1))
      .mockResolvedValueOnce(serverContext('PREMIUM', 'ws_abc', localD1))
      .mockResolvedValueOnce(serverContext('BASIC', 'ws_basic_alerts', localD1))
      .mockResolvedValueOnce(serverContext('BASIC', 'ws_basic_alerts', localD1));
    const payload = {
      eventId: 'evt_001', workspaceId: 'ws_abc', botId: 'bot_vol_1', channel: 'WEBHOOK',
      message: 'Grid rebalance complete', signingSecret: 'ultra-secure-hmac-secret-12345', timestampMs: 1700000000000, tier: 'PREMIUM',
    };

    const res1 = await alertsPost(postJson('http://localhost/api/ee/alerts', payload));
    const data1 = (await res1.json()) as { ok: boolean; suppressed: boolean; signatureHex?: string };
    expect(res1.status).toBe(200);
    expect(data1.suppressed).toBe(false);
    expect(typeof data1.signatureHex).toBe('string');

    const res2 = await alertsPost(postJson('http://localhost/api/ee/alerts', payload));
    const data2 = (await res2.json()) as { ok: boolean; suppressed: boolean };
    expect(res2.status).toBe(200);
    expect(data2.suppressed).toBe(true);

    const resBlocked = await alertsPost(
      postJson('http://localhost/api/ee/alerts', { ...payload, eventId: 'evt_gated_01', workspaceId: 'ws_basic_alerts', botId: 'bot_vol_basic', tier: 'BASIC' }),
    );
    expect(resBlocked.status).toBe(402);

    const resTelegramBasic = await alertsPost(
      postJson('http://localhost/api/ee/alerts', {
        ...payload, eventId: 'evt_telegram_basic', workspaceId: 'ws_basic_alerts', botId: 'bot_vol_basic', channel: 'TELEGRAM', tier: 'BASIC',
      }),
    );
    expect(resTelegramBasic.status).toBe(200);
  });

  it('GET and POST /api/ee/scheduler scopes leases to the server-resolved workspace', async () => {
    auth.resolve.mockResolvedValueOnce(serverContext('BASIC', 'ws_xyz', localD1))
      .mockResolvedValueOnce(serverContext('BASIC', 'ws_xyz', localD1))
      .mockResolvedValueOnce(serverContext('BASIC', 'ws_xyz', localD1))
      .mockResolvedValueOnce(serverContext('BASIC', 'ws_other', localD1));
    expect(cronSchedulerCoordinator).toBe(defaultCloudSchedulerCoordinator);
    const payload = {
      botId: 'bot_sched_1',
      workspaceId: 'ws_xyz',
      isolateId: 'isolate_us_east_1',
      nowMs: 1700000000000,
      leaseDurationMs: 30000,
    };

    const res1 = await schedulerPost(postJson('http://localhost/api/ee/scheduler', payload));
    const data1 = (await res1.json()) as { ok: boolean; lease: { botId: string } };
    expect(res1.status).toBe(200);
    expect(data1.lease.botId).toBe('bot_sched_1');

    const res2 = await schedulerPost(
      postJson('http://localhost/api/ee/scheduler', { ...payload, isolateId: 'isolate_eu_west_1' }),
    );
    expect(res2.status).toBe(409);

    const resGet = await schedulerGet(
      new Request('http://localhost/api/ee/scheduler?nowMs=1700000005000&workspaceId=ws_xyz'),
    );
    const dataGet = (await resGet.json()) as { ok: boolean; activeLeaseCount: number };
    expect(resGet.status).toBe(200);
    expect(dataGet.activeLeaseCount).toBe(1);

    const resOtherWs = await schedulerGet(
      new Request('http://localhost/api/ee/scheduler?nowMs=1700000005000&workspaceId=ws_other'),
    );
    const dataOtherWs = (await resOtherWs.json()) as { ok: boolean; activeLeaseCount: number };
    expect(dataOtherWs.activeLeaseCount).toBe(0);

    const resExpired = await schedulerGet(
      new Request('http://localhost/api/ee/scheduler?nowMs=1700000040000&workspaceId=ws_xyz'),
    );
    const dataExpired = (await resExpired.json()) as { ok: boolean; activeLeaseCount: number };
    expect(dataExpired.activeLeaseCount).toBe(0);
  });

  it('GET and POST /api/ee/telemetry enforces opt-in policy and summarizes conversion funnel', async () => {
    const event = {
      anonymousInstallId: 'install_999999',
      stage: 'OSS_CLI_QUICKSTART_RUN',
      timestampMs: 1700000000000,
    };

    const resDenied = await telemetryPost(
      postJson('http://localhost/api/ee/telemetry', { telemetryOptIn: false, event }),
    );
    const dataDenied = (await resDenied.json()) as { ok: boolean; recorded: boolean };
    expect(resDenied.status).toBe(200);
    expect(dataDenied.recorded).toBe(false);

    const resAllowed = await telemetryPost(
      postJson('http://localhost/api/ee/telemetry', { telemetryOptIn: true, event }),
    );
    const dataAllowed = (await resAllowed.json()) as { ok: boolean; recorded: boolean };
    expect(resAllowed.status).toBe(200);
    expect(dataAllowed.recorded).toBe(true);

    const resSummary = await telemetryGet();
    const dataSummary = (await resSummary.json()) as {
      ok: boolean;
      totalEvents: number;
      summary: { totalInstalls: number };
    };
    expect(resSummary.status).toBe(200);
    expect(dataSummary.totalEvents).toBeGreaterThanOrEqual(1);
    expect(dataSummary.summary.totalInstalls).toBeGreaterThanOrEqual(1);
  });
});
