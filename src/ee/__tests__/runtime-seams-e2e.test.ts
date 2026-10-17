// End-to-End Integration Tests for the 5 Closed Open-Core & Cloud SaaS Runtime Seams (G1–G5)

import { describe, it, expect, beforeEach } from 'vitest';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';
import { SaasEntitlementStore, defaultSaasEntitlementStore } from '../billing/saas-entitlement-store';
import { canonicalizeNowPaymentsJson, computeNowPaymentsHmacSha512 } from '../billing/nowpayments-ipn';
import { createLocalToCloudSyncBundle } from '../sync/local-to-cloud-sync';
import { GET as getIpnEntitlement, POST as postNowPaymentsIpn } from '@/app/api/ee/billing/nowpayments-ipn/route';
import { GET as getCredits, POST as postCredits } from '@/app/api/ee/credits/route';
import { GET as getAlphaFeed } from '@/app/api/ee/alpha-feed/route';
import { POST as postCloudAlert } from '@/app/api/ee/alerts/route';
import { POST as postCloudSync } from '@/app/api/ee/sync/route';

function createMockD1(): { db: D1Database; queries: string[] } {
  const queries: string[] = [];
  const ipnRows = new Map<string, { payment_id: string }>();
  const entitlementRows = new Map<string, Record<string, unknown>>();

  const db: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      let params: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]) {
          params = values;
          queries.push(sql);
          return stmt;
        },
        async first<T = unknown>(): Promise<T | null> {
          const key = String(params[0] ?? '');
          if (sql.includes('FROM saas_nowpayments_ipn_events')) return (ipnRows.get(key) as T) ?? null;
          if (sql.includes('FROM saas_workspace_entitlements')) return (entitlementRows.get(key) as T) ?? null;
          return null;
        },
        async firstRow<T = unknown>(): Promise<T | null> { return stmt.first<T>(); },
        async all<T = unknown>() { return { results: [] as T[], meta: { duration: 1 } }; },
        async run() {
          const key = String(params[0] ?? '');
          if (sql.includes('INSERT OR IGNORE INTO saas_nowpayments_ipn_events')) {
            ipnRows.set(key, { payment_id: key });
          } else if (sql.includes('INSERT INTO saas_workspace_entitlements')) {
            entitlementRows.set(key, {
              workspace_id: key, owner_user_id: String(params[1] ?? 'system'), tier: String(params[2] ?? 'BASIC'),
              max_running_bots: Number(params[3] ?? 1), max_walk_forward_windows: Number(params[4] ?? 4),
              monthly_llm_credits: Number(params[5] ?? 1000), managed_llm_pool_enabled: Number(params[6] ?? 0),
              updated_at_ms: Number(params[7] ?? 0),
            });
          }
          return { meta: { changes: 1, last_row_id: 1, duration: 1 } };
        },
      };
      return stmt;
    },
    async batch<T = unknown>() { return [] as T[]; },
    async exec() { return { count: 1, duration: 1 }; },
    async dump() { return ''; },
  };
  return { db, queries };
}

describe('25-Step Open-Core & Cloud SaaS Runtime Seams (G1–G5)', () => {
  beforeEach(() => {
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
  });

  it('Seam G2: persists NOWPayments IPN to D1 store and upgrades workspace tier across routes', async () => {
    const { db, queries } = createMockD1();
    const customStore = new SaasEntitlementStore(db);
    expect(await customStore.getWorkspaceTier('ws_d1')).toBe('BASIC');

    await customStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_d1_100',
      workspaceId: 'ws_d1',
      targetTier: 'ENTERPRISE',
      paymentStatus: 'finished',
      payAmount: 99,
      payCurrency: 'USDT',
      processedAtMs: 1_760_000_000_000,
    });
    expect(await customStore.hasProcessedPayment('pay_d1_100')).toBe(true);
    expect(await customStore.getWorkspaceTier('ws_d1')).toBe('ENTERPRISE');
    expect(queries.length).toBeGreaterThanOrEqual(2);

    defaultSaasEntitlementStore.setDatabase(db);
    const payload = {
      payment_id: 'pay_http_200',
      payment_status: 'finished',
      order_id: 'ord_200',
      workspace_id: 'ws_live_tenant',
      target_tier: 'ENTERPRISE',
      pay_amount: 99,
      pay_currency: 'USDT',
    };
    const secret = process.env.NOWPAYMENTS_IPN_SECRET || 'test_ipn_secret';
    const sig = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), secret);

    const ipnRes = await postNowPaymentsIpn(
      new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
        method: 'POST',
        headers: { 'x-nowpayments-sig': sig },
        body: JSON.stringify(payload),
      }),
    );
    expect(ipnRes.status).toBe(200);

    const getRes = await getIpnEntitlement(
      new Request('http://localhost/api/ee/billing/nowpayments-ipn?workspaceId=ws_live_tenant'),
    );
    const getBody = (await getRes.json()) as { entitlement: { tier: string } };
    expect(getBody.entitlement.tier).toBe('ENTERPRISE');

    const creditsRes = await getCredits(
      new Request('http://localhost/api/ee/credits?workspaceId=ws_live_tenant'),
    );
    const creditsBody = (await creditsRes.json()) as { account: { tier: string; balanceCredits: number } };
    expect(creditsBody.account.tier).toBe('ENTERPRISE');
    expect(creditsBody.account.balanceCredits).toBe(50_000);

    // POST /api/ee/credits without explicit tier should inherit ENTERPRISE from IPN store
    const debitRes = await postCredits(
      new Request('http://localhost/api/ee/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws_live_tenant',
          modelTier: 'REASONING',
          promptTokens: 500,
          completionTokens: 500,
        }),
      }),
    );
    expect(debitRes.status).toBe(200);
    const debitBody = (await debitRes.json()) as { account: { tier: string; balanceCredits: number } };
    expect(debitBody.account.tier).toBe('ENTERPRISE');
    expect(debitBody.account.balanceCredits).toBeLessThan(50_000);
  });

  it('Seam G3: enforces workspace quota on POST /api/ee/sync before importing CLI bundles', async () => {
    const bundleRes = await createLocalToCloudSyncBundle({
      botName: 'CLI Local Bot',
      strategyId: 'volatilityDca',
      symbol: 'BTC/USDT',
      intervalMinutes: 60,
      feeBps: 10,
      slippageBps: 5,
      parameters: { baseOrderSizePct: 5 },
    });
    expect(bundleRes.ok).toBe(true);
    if (!bundleRes.ok) return;
    const bundle = bundleRes.data;

    const blockedRes = await postCloudSync(
      new Request('http://localhost/api/ee/sync', {
        method: 'POST',
        headers: { 'x-cashclaw-tier': 'BASIC', 'x-cashclaw-active-bots': '1' },
        body: JSON.stringify(bundle),
      }),
    );
    expect(blockedRes.status).toBe(403);

    const allowedRes = await postCloudSync(
      new Request('http://localhost/api/ee/sync', {
        method: 'POST',
        headers: { 'x-cashclaw-tier': 'PREMIUM', 'x-cashclaw-active-bots': '1' },
        body: JSON.stringify(bundle),
      }),
    );
    expect(allowedRes.status).toBe(200);
  });

  it('Seam G4 & G5: serves tier-filtered Cloud Alpha Feed, signs & deduplicates Cloud Alerts, and guards cron tick leases', async () => {
    const basicFeedRes = await getAlphaFeed(new Request('http://localhost/api/ee/alpha-feed?tier=BASIC'));
    const basicFeed = (await basicFeedRes.json()) as { count: number; safetyMode: string };
    expect(basicFeed.count).toBe(1);
    expect(basicFeed.safetyMode).toBe('PAPER_ADVISORY_ONLY');

    const entFeedRes = await getAlphaFeed(new Request('http://localhost/api/ee/alpha-feed?tier=ENTERPRISE'));
    const entFeed = (await entFeedRes.json()) as { count: number };
    expect(entFeed.count).toBe(3);

    const alertPayload = {
      eventId: 'evt_seam_1',
      workspaceId: 'ws_alert',
      botId: 'bot_1',
      channel: 'WEBHOOK',
      message: 'Paper Drawdown Threshold Warning',
      timestampMs: 1_760_000_000_000,
    };
    const firstAlert = await postCloudAlert(
      new Request('http://localhost/api/ee/alerts', { method: 'POST', body: JSON.stringify(alertPayload) }),
    );
    const firstBody = (await firstAlert.json()) as { dispatched: boolean; envelope: { signatureHex: string } };
    expect(firstBody.dispatched).toBe(true);
    expect(firstBody.envelope.signatureHex).toMatch(/^[0-9a-f]{64}$/);

    const duplicateAlert = await postCloudAlert(
      new Request('http://localhost/api/ee/alerts', {
        method: 'POST',
        body: JSON.stringify({ ...alertPayload, timestampMs: 1_760_000_010_000 }),
      }),
    );
    const dupBody = (await duplicateAlert.json()) as { dispatched: boolean; deduplicated: boolean };
    expect(dupBody.dispatched).toBe(false);
    expect(dupBody.deduplicated).toBe(true);

    const { cronSchedulerCoordinator } = await import('@/worker-cron');
    const lease1 = cronSchedulerCoordinator.acquireTickLease({
      botId: 'cron-bot', workspaceId: 'ws_cron', isolateId: 'iso-a', nowMs: 1_760_000_000_000,
    });
    const lease2 = cronSchedulerCoordinator.acquireTickLease({
      botId: 'cron-bot', workspaceId: 'ws_cron', isolateId: 'iso-b', nowMs: 1_760_000_005_000,
    });
    expect(lease1.ok).toBe(true);
    expect(lease2.ok).toBe(false);
  });
});
