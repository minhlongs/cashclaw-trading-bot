import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defaultSaasEntitlementStore } from '../billing/saas-entitlement-store';
import { defaultCreditLedgerStore } from '../deliberation-cloud/llm-credit-ledger';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
  isUsdPeggedCurrency,
  verifyAndProcessNowPaymentsIpn,
} from '../billing/nowpayments-ipn';
import {
  detectCrossWorkspaceIdor,
  resolveEffectiveWorkspaceId,
  resolveWorkspaceTierContext,
} from '../tenancy/workspace-request-context';
import { signAlertWebhookPayload } from '../alerts/cloud-alert-dispatcher';
import { POST as postAlerts } from '@/app/api/ee/alerts/route';
import { GET as getAlphaFeed } from '@/app/api/ee/alpha-feed/route';
import { GET as getCredits, POST as postCredits } from '@/app/api/ee/credits/route';
import { GET as getQuotas } from '@/app/api/ee/quotas/route';
import { GET as getScheduler, POST as postScheduler } from '@/app/api/ee/scheduler/route';
import { POST as postSync } from '@/app/api/ee/sync/route';
import { GET as getTelemetry, POST as postTelemetry } from '@/app/api/ee/telemetry/route';
import { POST as postCheckout } from '@/app/api/ee/billing/checkout/route';
import { GET as getNowPaymentsIpn } from '@/app/api/ee/billing/nowpayments-ipn/route';

const PAID_WS = 'ws_paid_victim';
const SERVER_ALERT_SECRET = 'server-only-alert-hmac-secret-999';

describe('EE Security Hardening Regressions', () => {
  beforeEach(async () => {
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
    defaultCreditLedgerStore.resetMemoryForTesting();
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', SERVER_ALERT_SECRET);
    await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_sec_hardening_1',
      workspaceId: PAID_WS,
      targetTier: 'MASTER',
      paymentStatus: 'finished',
      payAmount: 299,
      payCurrency: 'USDT',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed on all authenticated EE routes when x-user-id is missing or blank', async () => {
    const jsonHeaders = { 'Content-Type': 'application/json', 'x-user-id': '   ' };
    const checks = await Promise.all([
      postAlerts(new Request('http://localhost/api/ee/alerts', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          eventId: 'evt_unauth_1',
          workspaceId: PAID_WS,
          botId: 'bot_1',
          channel: 'WEBHOOK',
          message: 'Unauthenticated probe',
          timestampMs: 1_775_100_000_000,
        }),
      })),
      getAlphaFeed(new Request(`http://localhost/api/ee/alpha-feed?workspaceId=${PAID_WS}`)),
      getQuotas(new Request(`http://localhost/api/ee/quotas?workspaceId=${PAID_WS}`)),
      getCredits(new Request(`http://localhost/api/ee/credits?workspaceId=${PAID_WS}`)),
      postCredits(new Request('http://localhost/api/ee/credits', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ workspaceId: PAID_WS, modelTier: 'FAST', promptTokens: 100, completionTokens: 100 }),
      })),
      getScheduler(new Request(`http://localhost/api/ee/scheduler?workspaceId=${PAID_WS}`)),
      postScheduler(new Request('http://localhost/api/ee/scheduler', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ botId: 'b1', workspaceId: PAID_WS, isolateId: 'iso_1' }),
      })),
      postSync(new Request('http://localhost/api/ee/sync', { method: 'POST', headers: jsonHeaders, body: '{}' })),
      getTelemetry(new Request(`http://localhost/api/ee/telemetry?workspaceId=${PAID_WS}`)),
      postTelemetry(new Request('http://localhost/api/ee/telemetry', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          telemetryOptIn: true,
          event: { anonymousInstallId: 'inst_123456', stage: 'OSS_CLI_QUICKSTART_RUN', timestampMs: 1_775_100_000_000 },
        }),
      })),
      getNowPaymentsIpn(new Request(`http://localhost/api/ee/billing/nowpayments-ipn?workspaceId=${PAID_WS}`)),
    ]);

    for (const res of checks) {
      expect(res.status).toBe(403);
    }

    const checkoutNoAuth = await postCheckout(new Request('http://localhost/api/ee/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetTier: 'PREMIUM', workspaceId: PAID_WS }),
    }));
    expect([401, 403]).toContain(checkoutNoAuth.status);
  });

  it('never resolves or authorizes a paid workspace tier without an authenticated identity', async () => {
    const req = new Request(`http://localhost/api/ee/alerts?workspaceId=${PAID_WS}`, {
      headers: { 'x-cashclaw-workspace': PAID_WS },
    });
    const ctx = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: PAID_WS });
    expect(ctx).toEqual({ workspaceId: undefined, tier: 'BASIC' });
    expect(detectCrossWorkspaceIdor(req, ctx, PAID_WS)).toMatchObject({
      code: 'WORKSPACE_FORBIDDEN',
      status: 403,
    });
    expect(resolveEffectiveWorkspaceId(req, ctx.workspaceId, PAID_WS)).toBeUndefined();
  });

  it('redacts signatureHex when signing with server secret and returns it only for explicit caller signingSecret', async () => {
    await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_sec_hardening_2',
      workspaceId: 'ws_tenant_prem',
      targetTier: 'PREMIUM',
      paymentStatus: 'finished',
      payAmount: 29,
      payCurrency: 'USDT',
    });

    const serverSignedRes = await postAlerts(new Request('http://localhost/api/ee/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'tenant_prem' },
      body: JSON.stringify({
        eventId: 'evt_oracle_block_1',
        workspaceId: 'ws_tenant_prem',
        botId: 'bot_1',
        channel: 'WEBHOOK',
        message: 'Check server secret oracle',
        timestampMs: 1_775_200_000_000,
      }),
    }));
    expect(serverSignedRes.status).toBe(200);
    const serverBody = (await serverSignedRes.json()) as {
      signatureHex?: string;
      envelope: { payloadJson: string; signatureHex?: string };
    };
    expect(serverBody.signatureHex).toBeUndefined();
    expect(serverBody.envelope.signatureHex).toBeUndefined();

    const callerSecret = 'tenant-supplied-hmac-secret-key';
    const callerSignedRes = await postAlerts(new Request('http://localhost/api/ee/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': 'tenant_prem' },
      body: JSON.stringify({
        eventId: 'evt_caller_secret_1',
        workspaceId: 'ws_tenant_prem',
        botId: 'bot_1',
        channel: 'WEBHOOK',
        message: 'Caller supplied secret',
        signingSecret: callerSecret,
        timestampMs: 1_775_200_000_000,
      }),
    }));
    expect(callerSignedRes.status).toBe(200);
    const callerBody = (await callerSignedRes.json()) as {
      signatureHex?: string;
      envelope: { payloadJson: string; signatureHex?: string };
    };
    const expectedCallerSig = await signAlertWebhookPayload(callerBody.envelope.payloadJson, callerSecret);
    const serverOracleSig = await signAlertWebhookPayload(callerBody.envelope.payloadJson, SERVER_ALERT_SECRET);
    expect(callerBody.signatureHex).toBe(expectedCallerSig);
    expect(callerBody.envelope.signatureHex).toBe(expectedCallerSig);
    expect(callerBody.signatureHex).not.toBe(serverOracleSig);
  });

  it('anchors isUsdPeggedCurrency against fake usd*/dai* tickers while preserving stablecoin network suffixes', async () => {
    for (const valid of ['usd', 'USD', 'usdt', 'usdc', 'busd', 'dai', 'fdusd', 'usdttrc20', 'usdcerc20', 'usdtbep20', 'usdcmatic', 'usdtsol', 'usdtarb', 'usdcbase', 'usdtton', 'usdcavaxc']) {
      expect(isUsdPeggedCurrency(valid)).toBe(true);
    }
    for (const invalid of ['', 'btc', 'eth', 'usdx', 'usdcoin_fake', 'usdt_fake', 'daifake', 'busd999', 'fdusd_scam', 'eur']) {
      expect(isUsdPeggedCurrency(invalid)).toBe(false);
    }

    const secret = 'ipn-regex-test-secret';
    const underpaidStablePayload = {
      payment_id: 'pay_underpaid_net_1',
      payment_status: 'finished',
      order_id: 'ord_net_1',
      pay_amount: 1,
      pay_currency: 'usdttrc20',
    };
    const sig = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(underpaidStablePayload), secret);
    const res = await verifyAndProcessNowPaymentsIpn(
      underpaidStablePayload,
      sig,
      secret,
      new Set(),
      { workspaceId: 'ws_net_1', targetTier: 'PREMIUM', expectedAmountUsd: 29 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('IPN_AMOUNT_MISMATCH');
  });
});
