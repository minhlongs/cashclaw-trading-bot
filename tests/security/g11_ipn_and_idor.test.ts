// Gate G11 & G14 Verification Suite — Tenant Anti-IDOR, 10x Parallel IPN Anti-Replay,
// partially_paid & Underpayment Rejection, VN Crypto-Billing Guard (451), & Subscriber COGS Floor
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

interface MockSessionRow {
  id: string;
  user_id: string;
  expires_at: number;
}

interface MockMemberRow {
  user_id: string;
  workspace_id: string;
  role: string;
  created_at_ms: number;
}

const mockState: {
  sessions: MockSessionRow[];
  members: MockMemberRow[];
  entitlementUpsertCount: number;
  ipnProcessedIds: Set<string>;
} = {
  sessions: [],
  members: [],
  entitlementUpsertCount: 0,
  ipnProcessedIds: new Set<string>(),
};

function buildMockD1(): D1Database {
  return {
    prepare(sql: string): D1PreparedStatement {
      let params: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]) {
          params = values;
          return stmt;
        },
        async first<T = unknown>(): Promise<T | null> {
          if (sql.includes('FROM saas_nowpayments_ipn_events')) {
            const pid = String(params[0] ?? '');
            return mockState.ipnProcessedIds.has(pid) ? ({ payment_id: pid } as unknown as T) : null;
          }
          return null;
        },
        async firstRow<T = unknown>(): Promise<T | null> {
          return stmt.first<T>();
        },
        async all<T = unknown>() {
          if (sql.includes('FROM user_sessions')) {
            const sid = String(params[0] ?? '');
            const rows = mockState.sessions.filter((s) => s.id === sid);
            return { results: rows as unknown as T[], meta: { duration: 1 } };
          }
          if (sql.includes('FROM saas_workspace_members')) {
            const uid = String(params[0] ?? '');
            const rows = mockState.members.filter((m) => m.user_id === uid);
            return { results: rows as unknown as T[], meta: { duration: 1 } };
          }
          return { results: [] as T[], meta: { duration: 1 } };
        },
        async run() {
          if (sql.includes('INTO saas_nowpayments_ipn_events')) {
            // Simulate realistic async D1 write latency to expose any check-then-act race
            await new Promise((resolve) => setTimeout(resolve, 8));
            const pid = String(params[0] ?? '');
            const status = String(params[3] ?? '');
            if (status === 'finished' || status === 'confirmed') {
              mockState.ipnProcessedIds.add(pid);
            }
          }
          if (sql.includes('INTO saas_workspace_entitlements')) {
            await new Promise((resolve) => setTimeout(resolve, 8));
            mockState.entitlementUpsertCount += 1;
          }
          return { meta: { changes: 1, last_row_id: 1, duration: 1 } };
        },
      };
      return stmt;
    },
    async batch<T = unknown>() {
      return [] as T[];
    },
    async exec() {
      return { count: 1, duration: 1 };
    },
    async dump() {
      return '';
    },
  };
}

const mockBotListHandler = vi.fn();
const mockBotCreateHandler = vi.fn();

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => buildMockD1(),
}));

vi.mock('@/forest/api/routes', () => ({
  botListHandler: (...args: unknown[]) => mockBotListHandler(...args),
  botCreateHandler: (...args: unknown[]) => mockBotCreateHandler(...args),
}));

import { middleware } from '@/middleware';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '@/ee/billing/nowpayments-ipn';
import { defaultCheckoutOrderStore } from '@/ee/billing/checkout-order-store';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import { defaultCreditLedgerStore } from '@/ee/deliberation-cloud/llm-credit-ledger';
import { enforceWorkspaceQuota } from '@/ee/billing/quota-guard';
import { auditAllTiersSubscriberCogs } from '@/ee/billing/subscriber-cogs-auditor';
import { GET as getQuotas } from '@/app/api/ee/quotas/route';
import { GET as getCredits, POST as postCredits } from '@/app/api/ee/credits/route';
import { POST as postSync } from '@/app/api/ee/sync/route';
import { POST as postAlerts } from '@/app/api/ee/alerts/route';
import { GET as getTelemetry, POST as postTelemetry } from '@/app/api/ee/telemetry/route';
import { POST as postCheckout } from '@/app/api/ee/billing/checkout/route';
import {
  GET as getNowPaymentsIpn,
  POST as postNowPaymentsIpn,
} from '@/app/api/ee/billing/nowpayments-ipn/route';
import { GET as getBots, POST as postBots } from '@/app/api/bots/route';
import { createLocalToCloudSyncBundle } from '@/ee/sync/local-to-cloud-sync';

const IPN_SECRET = 'g11-test-ipn-hmac-secret-key';

async function buildSignedIpnRequest(
  payload: Record<string, unknown>,
  secret = IPN_SECRET,
): Promise<Request> {
  const canonical = canonicalizeNowPaymentsJson(payload);
  const sig = await computeNowPaymentsHmacSha512(canonical, secret);
  const nowSec = String(Math.floor(Date.now() / 1000));
  return new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nowpayments-sig': sig,
      'x-nowpayments-timestamp': nowSec,
    },
    body: JSON.stringify(payload),
  });
}

describe('Gate G11: Tenant Isolation, IPN Anti-Replay, VN Crypto Block & Subscriber COGS', () => {
  beforeEach(() => {
    mockState.sessions = [
      { id: 'sess_alice', user_id: 'usr_alice', expires_at: Math.floor(Date.now() / 1000) + 3600 },
    ];
    mockState.members = [
      { user_id: 'usr_alice', workspace_id: 'ws_alice', role: 'OWNER', created_at_ms: 1000 },
      { user_id: 'usr_victim', workspace_id: 'ws_victim', role: 'OWNER', created_at_ms: 1000 },
    ];
    mockState.entitlementUpsertCount = 0;
    mockState.ipnProcessedIds.clear();

    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
    defaultCheckoutOrderStore.setDatabase(undefined);
    defaultCheckoutOrderStore.resetMemoryForTesting();
    defaultCreditLedgerStore.resetMemoryForTesting();

    mockBotListHandler.mockReset();
    mockBotCreateHandler.mockReset();
    mockBotListHandler.mockResolvedValue({ ok: true, data: [] });
    mockBotCreateHandler.mockResolvedValue({ ok: true, data: { id: 'bot_ok_1' } });

    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', IPN_SECRET);
    vi.stubEnv('NOWPAYMENTS_API_KEY', 'g11-test-nowpayments-api-key');
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', 'g11-test-alert-signing-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('middleware strips spoofed x-user-id headers on unauthenticated and authenticated requests', async () => {
    const unauthedSpoof = new NextRequest('http://localhost/api/ee/quotas', {
      headers: { 'x-user-id': 'usr_victim' },
    });
    const unauthedRes = await middleware(unauthedSpoof);
    expect(unauthedRes.status).toBe(401);

    const authedSpoof = new NextRequest('http://localhost/api/ee/quotas', {
      headers: {
        cookie: 'session_id=sess_alice',
        'x-user-id': 'usr_victim',
      },
    });
    const authedRes = await middleware(authedSpoof);
    expect(authedRes.status).toBe(200);
    // NextResponse.next({ request: { headers } }) encodes overridden request headers as x-middleware-override-headers
    expect(authedRes.headers.get('x-middleware-request-x-user-id')).toBe('usr_alice');
  });

  it('enforces 403 WORKSPACE_FORBIDDEN across credits, quotas, sync, alerts, telemetry, and IPN GET on cross-tenant workspaceId', async () => {
    const attackerHeaders = {
      'Content-Type': 'application/json',
      'x-user-id': 'usr_alice',
    };

    const quotaRes = await getQuotas(
      new Request('http://localhost/api/ee/quotas?workspaceId=ws_victim', { headers: attackerHeaders }),
    );
    expect(quotaRes.status).toBe(403);
    expect(((await quotaRes.json()) as { code: string }).code).toBe('WORKSPACE_FORBIDDEN');

    const creditsGetRes = await getCredits(
      new Request('http://localhost/api/ee/credits?workspaceId=ws_victim', { headers: attackerHeaders }),
    );
    expect(creditsGetRes.status).toBe(403);

    const creditsPostRes = await postCredits(
      new Request('http://localhost/api/ee/credits', {
        method: 'POST',
        headers: attackerHeaders,
        body: JSON.stringify({
          workspaceId: 'ws_victim',
          modelTier: 'FAST',
          promptTokens: 500,
          completionTokens: 200,
        }),
      }),
    );
    expect(creditsPostRes.status).toBe(403);

    const bundleRes = await createLocalToCloudSyncBundle({
      botName: 'Attacker Sync',
      symbol: 'BTCUSDT',
      strategyId: 'grid',
      intervalMinutes: 60,
      feeBps: 10,
      slippageBps: 5,
      parameters: { levels: 5 },
    });
    expect(bundleRes.ok).toBe(true);
    if (bundleRes.ok) {
      const syncRes = await postSync(
        new Request('http://localhost/api/ee/sync?workspaceId=ws_victim', {
          method: 'POST',
          headers: attackerHeaders,
          body: JSON.stringify(bundleRes.data),
        }),
      );
      expect(syncRes.status).toBe(403);
    }

    const alertRes = await postAlerts(
      new Request('http://localhost/api/ee/alerts', {
        method: 'POST',
        headers: attackerHeaders,
        body: JSON.stringify({
          eventId: 'evt_idor_1',
          workspaceId: 'ws_victim',
          botId: 'bot_1',
          channel: 'TELEGRAM',
          message: 'Cross-workspace probe',
          timestampMs: 1_770_000_000_000,
        }),
      }),
    );
    expect(alertRes.status).toBe(403);

    const telemetryGetRes = await getTelemetry(
      new Request('http://localhost/api/ee/telemetry?workspaceId=ws_victim', {
        headers: attackerHeaders,
      }),
    );
    expect(telemetryGetRes.status).toBe(403);

    const telemetryPostRes = await postTelemetry(
      new Request('http://localhost/api/ee/telemetry', {
        method: 'POST',
        headers: attackerHeaders,
        body: JSON.stringify({
          workspaceId: 'ws_victim',
          telemetryOptIn: true,
          event: {
            anonymousInstallId: 'inst_123456',
            stage: 'OSS_CLI_QUICKSTART_RUN',
            timestampMs: 1_770_000_000_000,
          },
        }),
      }),
    );
    expect(telemetryPostRes.status).toBe(403);

    const ipnGetRes = await getNowPaymentsIpn(
      new Request('http://localhost/api/ee/billing/nowpayments-ipn?workspaceId=ws_victim', {
        headers: attackerHeaders,
      }),
    );
    expect(ipnGetRes.status).toBe(403);
  });

  it('preserves clean resolution when workspaceId is omitted or matches caller own workspace, and isolates /api/bots', async () => {
    const ownQuotaRes = await getQuotas(
      new Request('http://localhost/api/ee/quotas?workspaceId=ws_alice', {
        headers: { 'x-user-id': 'usr_alice' },
      }),
    );
    expect(ownQuotaRes.status).toBe(200);
    const ownBody = (await ownQuotaRes.json()) as { workspaceId: string };
    expect(ownBody.workspaceId).toBe('ws_alice');

    const omittedCreditsRes = await getCredits(
      new Request('http://localhost/api/ee/credits', {
        headers: { 'x-user-id': 'usr_alice' },
      }),
    );
    expect(omittedCreditsRes.status).toBe(200);

    await getBots(new Request('http://localhost/api/bots', { headers: { 'x-user-id': 'usr_alice' } }));
    expect(mockBotListHandler).toHaveBeenCalledWith('usr_alice');

    mockBotListHandler.mockResolvedValueOnce({ ok: true, data: [{ id: 'existing_basic_bot' }] });
    const quotaBlockedBotCreate = await postBots(
      new Request('http://localhost/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_alice' },
        body: JSON.stringify({
          id: 'bot_overflow',
          name: 'Second Basic Bot',
          strategy: 'grid',
          pair: 'BTC/USDT',
          exchange: 'binance',
          capital: 1000,
          mode: 'paper',
        }),
      }),
    );
    expect(quotaBlockedBotCreate.status).toBe(403);
    expect(enforceWorkspaceQuota({ tier: 'BASIC', activeRunningBots: 1, requestedWalkForwardWindows: 1 }).ok).toBe(false);
  });

  it('rejects invalid HMAC-SHA512, non-activating statuses (partially_paid/waiting/failed/expired), and underpaid finished callbacks', async () => {
    await defaultCheckoutOrderStore.recordOrder({
      orderId: 'ord_g11_prem_1',
      workspaceId: 'ws_alice',
      userId: 'usr_alice',
      targetTier: 'PREMIUM',
      expectedAmountUsd: 29,
      payCurrency: 'usdt',
    });

    const badSigReq = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: { 'x-nowpayments-sig': 'deadbeef'.repeat(16) },
      body: JSON.stringify({
        payment_id: 'pay_bad_sig',
        payment_status: 'finished',
        order_id: 'ord_g11_prem_1',
        pay_amount: 29,
        pay_currency: 'usdt',
      }),
    });
    expect((await postNowPaymentsIpn(badSigReq)).status).toBe(403);

    for (const nonFinalStatus of ['partially_paid', 'waiting', 'confirming', 'failed', 'expired'] as const) {
      const res = await postNowPaymentsIpn(
        await buildSignedIpnRequest({
          payment_id: `pay_${nonFinalStatus}`,
          payment_status: nonFinalStatus,
          order_id: 'ord_g11_prem_1',
          pay_amount: nonFinalStatus === 'partially_paid' ? 12 : 29,
          pay_currency: 'usdt',
          ...(nonFinalStatus === 'partially_paid' ? { actually_paid: 12 } : {}),
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { activated: boolean };
      expect(body.activated).toBe(false);
      expect(await defaultSaasEntitlementStore.getWorkspaceTier('ws_alice')).toBe('BASIC');
    }

    // Underpaid finished callback via actually_paid < expectedAmountUsd (and BTC actually_paid < pay_amount)
    const underpaidActualRes = await postNowPaymentsIpn(
      await buildSignedIpnRequest({
        payment_id: 'pay_underpaid_actual',
        payment_status: 'finished',
        order_id: 'ord_g11_prem_1',
        pay_amount: 0.0005,
        actually_paid: 0.0002,
        pay_currency: 'btc',
      }),
    );
    expect(underpaidActualRes.status).toBe(409);

    const underpaidOutcomeRes = await postNowPaymentsIpn(
      await buildSignedIpnRequest({
        payment_id: 'pay_underpaid_outcome',
        payment_status: 'finished',
        order_id: 'ord_g11_prem_1',
        pay_amount: 0.0005,
        pay_currency: 'btc',
        outcome_amount: 19.5,
        outcome_currency: 'usd',
      }),
    );
    expect(underpaidOutcomeRes.status).toBe(409);
    expect(await defaultSaasEntitlementStore.getWorkspaceTier('ws_alice')).toBe('BASIC');
  });

  it('defends against 10x simultaneous Promise.all finished IPN replay with at most 1 activation', async () => {
    await defaultCheckoutOrderStore.recordOrder({
      orderId: 'ord_g11_burst_10x',
      workspaceId: 'ws_alice',
      userId: 'usr_alice',
      targetTier: 'ENTERPRISE',
      expectedAmountUsd: 99,
      payCurrency: 'usdt',
    });

    const payload = {
      payment_id: 'pay_burst_atomic_001',
      payment_status: 'finished',
      order_id: 'ord_g11_burst_10x',
      pay_amount: 99,
      actually_paid: 99,
      pay_currency: 'usdt',
    };

    const requests = await Promise.all(
      Array.from({ length: 10 }, () => buildSignedIpnRequest(payload)),
    );
    const responses = await Promise.all(requests.map((req) => postNowPaymentsIpn(req)));
    const bodies = await Promise.all(
      responses.map(
        (res) =>
          res.json() as Promise<{
            ok: boolean;
            activated: boolean;
            duplicate: boolean;
            idempotentReplay: boolean;
          }>,
      ),
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    const activatedCount = bodies.filter((b) => b.activated === true).length;
    const replayBlockedCount = bodies.filter(
      (b) => b.activated === false && b.idempotentReplay === true && b.duplicate === true,
    ).length;

    expect(activatedCount).toBe(1);
    expect(replayBlockedCount).toBe(9);
    expect(mockState.entitlementUpsertCount).toBe(1);
  });

  it('blocks crypto checkout from Vietnam (VN) with HTTP 451 while keeping international checkout working', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'inv_intl_900',
          invoice_url: 'https://nowpayments.io/invoice/inv_intl_900',
          order_id: 'ord_intl_900',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const vnCfHeaderRes = await postCheckout(
      new Request('http://localhost/api/ee/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_alice',
          'cf-ipcountry': 'VN',
        },
        body: JSON.stringify({ targetTier: 'PREMIUM', payCurrency: 'usdt' }),
      }),
    );
    expect(vnCfHeaderRes.status).toBe(451);
    const vnCfBody = (await vnCfHeaderRes.json()) as {
      code: string;
      messageEn: string;
      messageVi: string;
    };
    expect(vnCfBody.code).toBe('CRYPTO_CHECKOUT_BLOCKED_VN_JURISDICTION');
    expect(vnCfBody.messageEn).toContain('71/2025/QH15');
    expect(vnCfBody.messageVi).toContain('284/2026/NĐ-CP');

    const vnCountryHeaderRes = await postCheckout(
      new Request('http://localhost/api/ee/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_alice',
          'x-country-code': 'vn',
        },
        body: JSON.stringify({ targetTier: 'ENTERPRISE' }),
      }),
    );
    expect(vnCountryHeaderRes.status).toBe(451);

    const vnBodyCountryRes = await postCheckout(
      new Request('http://localhost/api/ee/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'usr_alice' },
        body: JSON.stringify({ targetTier: 'MASTER', billingCountry: 'VN' }),
      }),
    );
    expect(vnBodyCountryRes.status).toBe(451);
    expect(fetchSpy).not.toHaveBeenCalled();

    // International user (SG) succeeds 100%
    const sgCheckoutRes = await postCheckout(
      new Request('http://localhost/api/ee/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'usr_alice',
          'cf-ipcountry': 'SG',
        },
        body: JSON.stringify({ targetTier: 'PREMIUM', payCurrency: 'usdt' }),
      }),
    );
    expect(sgCheckoutRes.status).toBe(200);
    const sgBody = (await sgCheckoutRes.json()) as { ok: boolean; invoiceUrl: string };
    expect(sgBody.ok).toBe(true);
    expect(sgBody.invoiceUrl).toContain('nowpayments.io/invoice');
  });

  it('Gate G14: proves positive gross margin across all paid SaaS tiers even at 100% BULL credit exhaustion', async () => {
    const report = auditAllTiersSubscriberCogs();
    expect(report.allPaidTiersPositiveAtFullExhaustion).toBe(true);
    expect(report.tiers.BASIC.scenarios.BULL.managedLlmCreditsUsd).toBe(0);
    expect(report.tiers.PREMIUM.scenarios.BULL.grossMarginUsd).toBeGreaterThan(20);
    expect(report.tiers.ENTERPRISE.scenarios.BULL.grossMarginUsd).toBeGreaterThan(60);
    expect(report.tiers.MASTER.scenarios.BULL.grossMarginUsd).toBeGreaterThan(125);

    const quotaMatrixRes = await getQuotas(
      new Request('http://localhost/api/ee/quotas?includeCogsMatrix=1', {
        headers: { 'x-user-id': 'usr_alice' },
      }),
    );
    expect(quotaMatrixRes.status).toBe(200);
    const quotaMatrixBody = (await quotaMatrixRes.json()) as {
      fleetCogsReport?: { allPaidTiersPositiveAtFullExhaustion: boolean };
    };
    expect(quotaMatrixBody.fleetCogsReport?.allPaidTiersPositiveAtFullExhaustion).toBe(true);
  });
});
