// Test suite for newly expanded Cloud SaaS EE API routes
// Covers /api/ee/alpha-feed, /api/ee/credits, /api/ee/alerts, /api/ee/scheduler, /api/ee/telemetry

import { describe, it, expect } from 'vitest';
import { GET as alphaFeedGet } from '../alpha-feed/route';
import { GET as creditsGet, POST as creditsPost } from '../credits/route';
import { POST as alertsPost } from '../alerts/route';
import { GET as schedulerGet, POST as schedulerPost } from '../scheduler/route';
import { GET as telemetryGet, POST as telemetryPost } from '../telemetry/route';
import { cronSchedulerCoordinator } from '@/worker-cron';
import { defaultCloudSchedulerCoordinator } from '@/ee/scheduler/cloud-scheduler-coordinator';

function postJson(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Expanded Cloud SaaS EE API Routes', () => {
  it('GET /api/ee/alpha-feed returns tier-gated curated alpha list', async () => {
    const resBasic = await alphaFeedGet(new Request('http://localhost/api/ee/alpha-feed?tier=BASIC'));
    const dataBasic = (await resBasic.json()) as { ok: boolean; fullFeedAccess: boolean; feed: unknown[] };
    expect(resBasic.status).toBe(200);
    expect(dataBasic.fullFeedAccess).toBe(false);
    expect(dataBasic.feed.length).toBe(1);

    const resEnterprise = await alphaFeedGet(new Request('http://localhost/api/ee/alpha-feed?tier=ENTERPRISE'));
    const dataEnterprise = (await resEnterprise.json()) as { ok: boolean; fullFeedAccess: boolean; feed: unknown[] };
    expect(resEnterprise.status).toBe(200);
    expect(dataEnterprise.fullFeedAccess).toBe(true);
    expect(dataEnterprise.feed.length).toBe(3);
  });

  it('GET and POST /api/ee/credits persists debits across requests and reconciles tier upgrades', async () => {
    const resGet = await creditsGet(new Request('http://localhost/api/ee/credits?workspaceId=ws_123&tier=PREMIUM'));
    const dataGet = (await resGet.json()) as { ok: boolean; account: { balanceCredits: number } };
    expect(resGet.status).toBe(200);
    expect(dataGet.account.balanceCredits).toBe(10_000);

    const resPost = await creditsPost(
      postJson('http://localhost/api/ee/credits', {
        workspaceId: 'ws_123',
        tier: 'PREMIUM',
        modelTier: 'REASONING',
        promptTokens: 1500,
        completionTokens: 500,
      }),
    );
    const dataPost = (await resPost.json()) as {
      ok: boolean;
      costCredits: number;
      account: { balanceCredits: number; consumedCredits: number };
    };
    expect(resPost.status).toBe(200);
    expect(dataPost.costCredits).toBe(8);
    expect(dataPost.account.balanceCredits).toBe(9_992);
    expect(dataPost.account.consumedCredits).toBe(8);

    const resGetAfter = await creditsGet(
      new Request('http://localhost/api/ee/credits?workspaceId=ws_123&tier=PREMIUM'),
    );
    const dataGetAfter = (await resGetAfter.json()) as {
      ok: boolean;
      account: { balanceCredits: number; consumedCredits: number };
    };
    expect(dataGetAfter.account.balanceCredits).toBe(9_992);
    expect(dataGetAfter.account.consumedCredits).toBe(8);

    const resUpgraded = await creditsGet(
      new Request('http://localhost/api/ee/credits?workspaceId=ws_123&tier=ENTERPRISE'),
    );
    const dataUpgraded = (await resUpgraded.json()) as {
      ok: boolean;
      account: { tier: string; balanceCredits: number; consumedCredits: number };
    };
    expect(dataUpgraded.account.tier).toBe('ENTERPRISE');
    expect(dataUpgraded.account.balanceCredits).toBe(49_992);
    expect(dataUpgraded.account.consumedCredits).toBe(8);
  });

  it('POST /api/ee/alerts handles alert signing, deduplication, and unconditional WEBHOOK tier gating', async () => {
    const payload = {
      eventId: 'evt_001',
      workspaceId: 'ws_abc',
      botId: 'bot_vol_1',
      channel: 'WEBHOOK',
      message: 'Grid rebalance complete',
      signingSecret: 'ultra-secure-hmac-secret-12345',
      timestampMs: 1700000000000,
      tier: 'PREMIUM',
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
      postJson('http://localhost/api/ee/alerts', {
        ...payload,
        eventId: 'evt_gated_01',
        workspaceId: 'ws_basic_alerts',
        tier: 'BASIC',
      }),
    );
    expect(resBlocked.status).toBe(402);

    const resTelegramBasic = await alertsPost(
      postJson('http://localhost/api/ee/alerts', {
        ...payload,
        eventId: 'evt_telegram_basic',
        workspaceId: 'ws_basic_alerts',
        channel: 'TELEGRAM',
        tier: 'BASIC',
      }),
    );
    expect(resTelegramBasic.status).toBe(200);
  });

  it('GET and POST /api/ee/scheduler unifies cronSchedulerCoordinator and manages heartbeat leases', async () => {
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

    const resGet = await schedulerGet(new Request('http://localhost/api/ee/scheduler?nowMs=1700000005000'));
    const dataGet = (await resGet.json()) as { ok: boolean; activeLeaseCount: number };
    expect(resGet.status).toBe(200);
    expect(dataGet.activeLeaseCount).toBeGreaterThanOrEqual(1);
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
