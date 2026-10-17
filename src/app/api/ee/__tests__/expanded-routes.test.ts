// Test suite for newly expanded Cloud SaaS EE API routes
// Covers /api/ee/alpha-feed, /api/ee/credits, /api/ee/alerts, /api/ee/scheduler, /api/ee/telemetry

import { describe, it, expect } from 'vitest';
import { GET as alphaFeedGet } from '../alpha-feed/route';
import { GET as creditsGet, POST as creditsPost } from '../credits/route';
import { POST as alertsPost } from '../alerts/route';
import { POST as schedulerPost } from '../scheduler/route';
import { POST as telemetryPost } from '../telemetry/route';

describe('Expanded Cloud SaaS EE API Routes', () => {
  it('GET /api/ee/alpha-feed returns tier-gated curated alpha list', async () => {
    const reqBasic = new Request('http://localhost/api/ee/alpha-feed?tier=BASIC');
    const resBasic = await alphaFeedGet(reqBasic);
    const dataBasic = (await resBasic.json()) as {
      ok: boolean;
      fullFeedAccess: boolean;
      feed: unknown[];
    };

    expect(resBasic.status).toBe(200);
    expect(dataBasic.ok).toBe(true);
    expect(dataBasic.fullFeedAccess).toBe(false);
    expect(dataBasic.feed.length).toBe(1);

    const reqEnterprise = new Request('http://localhost/api/ee/alpha-feed?tier=ENTERPRISE');
    const resEnterprise = await alphaFeedGet(reqEnterprise);
    const dataEnterprise = (await resEnterprise.json()) as {
      ok: boolean;
      fullFeedAccess: boolean;
      feed: unknown[];
    };

    expect(resEnterprise.status).toBe(200);
    expect(dataEnterprise.fullFeedAccess).toBe(true);
    expect(dataEnterprise.feed.length).toBe(3);
  });

  it('GET and POST /api/ee/credits calculates deliberation token usage', async () => {
    const reqGet = new Request('http://localhost/api/ee/credits?workspaceId=ws_123&tier=PREMIUM');
    const resGet = await creditsGet(reqGet);
    const dataGet = (await resGet.json()) as { ok: boolean; account: { balanceCredits: number } };

    expect(resGet.status).toBe(200);
    expect(dataGet.account.balanceCredits).toBe(10_000);

    const reqPost = new Request('http://localhost/api/ee/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws_123',
        tier: 'PREMIUM',
        modelTier: 'REASONING',
        promptTokens: 1500,
        completionTokens: 500,
      }),
    });
    const resPost = await creditsPost(reqPost);
    const dataPost = (await resPost.json()) as {
      ok: boolean;
      costCredits: number;
      account: { balanceCredits: number; consumedCredits: number };
    };

    expect(resPost.status).toBe(200);
    expect(dataPost.costCredits).toBe(8); // ceil(2000/1000) * 4 = 8
    expect(dataPost.account.balanceCredits).toBe(9_992);
    expect(dataPost.account.consumedCredits).toBe(8);
  });

  it('POST /api/ee/alerts handles alert signing and deduplication', async () => {
    const payload = {
      eventId: 'evt_001',
      workspaceId: 'ws_abc',
      botId: 'bot_vol_1',
      channel: 'WEBHOOK',
      message: 'Grid rebalance complete',
      signingSecret: 'ultra-secure-hmac-secret-12345',
      timestampMs: 1700000000000,
    };

    const req1 = new Request('http://localhost/api/ee/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res1 = await alertsPost(req1);
    const data1 = (await res1.json()) as { ok: boolean; suppressed: boolean; signatureHex?: string };

    expect(res1.status).toBe(200);
    expect(data1.suppressed).toBe(false);
    expect(typeof data1.signatureHex).toBe('string');

    // Duplicate event should be suppressed
    const req2 = new Request('http://localhost/api/ee/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res2 = await alertsPost(req2);
    const data2 = (await res2.json()) as { ok: boolean; suppressed: boolean };

    expect(res2.status).toBe(200);
    expect(data2.suppressed).toBe(true);
  });

  it('POST /api/ee/scheduler manages heartbeat leases without collision', async () => {
    const payload = {
      botId: 'bot_sched_1',
      workspaceId: 'ws_xyz',
      isolateId: 'isolate_us_east_1',
      nowMs: 1700000000000,
      leaseDurationMs: 30000,
    };

    const req1 = new Request('http://localhost/api/ee/scheduler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const res1 = await schedulerPost(req1);
    const data1 = (await res1.json()) as { ok: boolean; lease: { botId: string } };

    expect(res1.status).toBe(200);
    expect(data1.ok).toBe(true);
    expect(data1.lease.botId).toBe('bot_sched_1');

    // Collision should be rejected
    const req2 = new Request('http://localhost/api/ee/scheduler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        isolateId: 'isolate_eu_west_1',
      }),
    });
    const res2 = await schedulerPost(req2);
    const data2 = (await res2.json()) as { ok: boolean; error: string };

    expect(res2.status).toBe(409);
    expect(data2.ok).toBe(false);
  });

  it('POST /api/ee/telemetry enforces opt-in policy for funnel metrics', async () => {
    const event = {
      anonymousInstallId: 'install_999999',
      stage: 'OSS_CLI_QUICKSTART_RUN',
      timestampMs: 1700000000000,
    };

    // Disabled opt-in should return 200 with recorded: false
    const reqDenied = new Request('http://localhost/api/ee/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telemetryOptIn: false,
        event,
      }),
    });
    const resDenied = await telemetryPost(reqDenied);
    const dataDenied = (await resDenied.json()) as { ok: boolean; recorded: boolean };
    expect(resDenied.status).toBe(200);
    expect(dataDenied.recorded).toBe(false);

    // Enabled opt-in should return 200 with recorded: true
    const reqAllowed = new Request('http://localhost/api/ee/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telemetryOptIn: true,
        event,
      }),
    });
    const resAllowed = await telemetryPost(reqAllowed);
    const dataAllowed = (await resAllowed.json()) as { ok: boolean; recorded: boolean };

    expect(resAllowed.status).toBe(200);
    expect(dataAllowed.ok).toBe(true);
    expect(dataAllowed.recorded).toBe(true);
  });
});
