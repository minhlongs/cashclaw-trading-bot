import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET as getNowPaymentsIpn, POST as postNowPaymentsIpn } from './route';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '@/ee/billing/nowpayments-ipn';
import { defaultCheckoutOrderStore } from '@/ee/billing/checkout-order-store';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';

/** Records the order the server would have created at checkout. The IPN path is
 *  only allowed to act on an order it can find, so tests that exercise the
 *  upgrade path must seed one exactly as the checkout route does. */
async function seedCheckoutOrder(orderId: string, workspaceId: string, targetTier: 'PREMIUM' | 'ENTERPRISE' | 'MASTER') {
  await defaultCheckoutOrderStore.recordOrder({
    orderId,
    workspaceId,
    targetTier,
    expectedAmountUsd: 29,
    payCurrency: 'usd',
  });
}

describe('POST /api/ee/billing/nowpayments-ipn', () => {
  // Seeded per test rather than left to a code default: production has no
  // default, so neither should the test.
  const secret = 'unit-test-ipn-secret';

  beforeEach(() => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', secret);
    defaultCheckoutOrderStore.resetMemoryForTesting();
    defaultSaasEntitlementStore.resetMemoryForTesting();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    defaultCheckoutOrderStore.resetMemoryForTesting();
  });

  it('fails closed with 503 when NOWPAYMENTS_IPN_SECRET is absent', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', '');

    const payload = { payment_id: 'np_no_secret', payment_status: 'finished', workspace_id: 'ws_1' };
    const req = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: { 'x-nowpayments-sig': 'a'.repeat(128) },
      body: JSON.stringify(payload),
    });
    const res = await postNowPaymentsIpn(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toContain('IPN_CONFIG_ERROR');
  });

  it('never activates a tier when the secret is absent, even for a signed body', async () => {
    vi.unstubAllEnvs();

    const payload = {
      payment_id: 'np_unsigned_boost',
      payment_status: 'finished',
      order_id: 'ord_1',
      workspace_id: 'ws_1',
      target_tier: 'MASTER',
      pay_amount: 299,
      pay_currency: 'USDT',
    };
    // Signed with the value production used to fall back to. With the fallback
    // gone this must be rejected, not accepted.
    const legacySig = await computeNowPaymentsHmacSha512(
      canonicalizeNowPaymentsJson(payload),
      'test_ipn_secret',
    );
    const req = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: { 'x-nowpayments-sig': legacySig },
      body: JSON.stringify(payload),
    });
    const res = await postNowPaymentsIpn(req);
    expect(res.status).toBe(503);
    expect(((await res.json()) as Record<string, unknown>).error).toContain('IPN_CONFIG_ERROR');
  });

  it('rejects request without signature header (401)', async () => {
    const req = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      body: JSON.stringify({ payment_id: 'np_123' }),
    });
    const res = await postNowPaymentsIpn(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toContain('x-nowpayments-sig');
  });

  it('rejects request with stale timestamp outside 300s replay window (403)', async () => {
    const staleTime = Math.floor(Date.now() / 1000) - 500;
    const req = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: {
        'x-nowpayments-sig': 'dummy-sig',
        'x-nowpayments-timestamp': String(staleTime),
      },
      body: JSON.stringify({ payment_id: 'np_123' }),
    });
    const res = await postNowPaymentsIpn(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain('tolerance window');
  });

  it('rejects request with invalid HMAC signature (403)', async () => {
    const payload = {
      payment_id: 'np_bad_sig',
      payment_status: 'finished',
      order_id: 'ord_1',
      workspace_id: 'ws_1',
      target_tier: 'PREMIUM',
      pay_amount: 29.0,
      pay_currency: 'USDT',
    };
    const req = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: {
        'x-nowpayments-sig': 'badsignaturedeadbeef12345678',
      },
      body: JSON.stringify(payload),
    });
    const res = await postNowPaymentsIpn(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toContain('Invalid HMAC signature');
  });

  it('rejects invalid JSON body (400)', async () => {
    const req = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: {
        'x-nowpayments-sig': 'somesig',
      },
      body: 'invalid{json',
    });
    const res = await postNowPaymentsIpn(req);
    expect(res.status).toBe(400);
  });

  it('rejects payload with invalid schema / unsupported tier (400)', async () => {
    const payload = {
      payment_id: 'np_invalid_tier',
      payment_status: 'finished',
      order_id: 'ord_1',
      workspace_id: 'ws_1',
      target_tier: 'INVALID_TIER',
      pay_amount: 29.0,
      pay_currency: 'USDT',
    };
    const canonical = canonicalizeNowPaymentsJson(payload);
    const signature = await computeNowPaymentsHmacSha512(canonical, secret);

    const req = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: { 'x-nowpayments-sig': signature },
      body: JSON.stringify(payload),
    });
    const res = await postNowPaymentsIpn(req);
    expect(res.status).toBe(400);
  });

  it('refuses an IPN whose order_id the server never issued, even signed correctly', async () => {
    // The signature is valid, so this is a real-looking callback. It names
    // MASTER, but no checkout order backs it, so nothing may be upgraded.
    const payload = {
      payment_id: 'np_unbacked_order',
      payment_status: 'finished',
      order_id: 'ord_nobody_ordered',
      workspace_id: 'ws_attacker',
      target_tier: 'MASTER',
      pay_amount: 299,
      pay_currency: 'USDT',
    };
    const canonical = canonicalizeNowPaymentsJson(payload);
    const signature = await computeNowPaymentsHmacSha512(canonical, secret);

    const res = await postNowPaymentsIpn(
      new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
        method: 'POST',
        headers: { 'x-nowpayments-sig': signature },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain('IPN_ORDER_UNKNOWN');
    expect(await defaultSaasEntitlementStore.getWorkspaceTier('ws_attacker')).toBe('BASIC');
  });

  it('upgrades to the tier the server ordered, ignoring the tier the callback names', async () => {
    // Order says PREMIUM; the callback says MASTER over a different workspace.
    // The signed-over field is the order id, so the server's tier is the one that
    // takes effect and the workspace in the payload is ignored entirely.
    await seedCheckoutOrder('ord_says_premium', 'ws_real_buyer', 'PREMIUM');

    const payload = {
      payment_id: 'np_tier_confusion',
      payment_status: 'finished',
      order_id: 'ord_says_premium',
      workspace_id: 'ws_attacker_claims_it',
      target_tier: 'MASTER',
      pay_amount: 29,
      pay_currency: 'USDT',
    };
    const canonical = canonicalizeNowPaymentsJson(payload);
    const signature = await computeNowPaymentsHmacSha512(canonical, secret);

    const res = await postNowPaymentsIpn(
      new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
        method: 'POST',
        headers: { 'x-nowpayments-sig': signature },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.targetTier).toBe('PREMIUM');
    expect(body.workspaceId).toBe('ws_real_buyer');
    expect(await defaultSaasEntitlementStore.getWorkspaceTier('ws_real_buyer')).toBe('PREMIUM');
    expect(await defaultSaasEntitlementStore.getWorkspaceTier('ws_attacker_claims_it')).toBe('BASIC');
  });

  it('processes valid IPN and activates tier, then handles replay idempotently', async () => {
    await seedCheckoutOrder('ord_prem_99', 'ws_prod_01', 'ENTERPRISE');
    const payload = {
      payment_id: 'np_unique_998811',
      payment_status: 'finished',
      order_id: 'ord_prem_99',
      workspace_id: 'ws_prod_01',
      target_tier: 'ENTERPRISE',
      pay_amount: 149.0,
      pay_currency: 'USDT',
    };
    const canonical = canonicalizeNowPaymentsJson(payload);
    const signature = await computeNowPaymentsHmacSha512(canonical, secret);
    const nowTimestamp = String(Math.floor(Date.now() / 1000));

    // First delivery
    const req1 = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: {
        'x-nowpayments-sig': signature,
        'x-nowpayments-timestamp': nowTimestamp,
      },
      body: JSON.stringify(payload),
    });

    const res1 = await postNowPaymentsIpn(req1);
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as Record<string, unknown>;
    expect(body1.ok).toBe(true);
    expect(body1.activated).toBe(true);
    expect(body1.idempotentReplay).toBe(false);
    expect(body1.targetTier).toBe('ENTERPRISE');

    // Idempotent replay
    const req2 = new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: {
        'x-nowpayments-sig': signature,
        'x-nowpayments-timestamp': nowTimestamp,
      },
      body: JSON.stringify(payload),
    });

    const res2 = await postNowPaymentsIpn(req2);
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as Record<string, unknown>;
    expect(body2.ok).toBe(true);
    expect(body2.activated).toBe(false);
    expect(body2.idempotentReplay).toBe(true);
  });

  it('refuses a finished USD-pegged IPN that underpaid the server-recorded order amount (409)', async () => {
    await seedCheckoutOrder('ord_underpaid', 'ws_underpaid', 'PREMIUM');
    const payload = {
      payment_id: 'np_underpaid_1',
      payment_status: 'finished',
      order_id: 'ord_underpaid',
      workspace_id: 'ws_underpaid',
      target_tier: 'PREMIUM',
      pay_amount: 1,
      pay_currency: 'USDT',
    };
    const signature = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), secret);
    const res = await postNowPaymentsIpn(
      new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
        method: 'POST',
        headers: { 'x-nowpayments-sig': signature },
        body: JSON.stringify(payload),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.error)).toContain('IPN_AMOUNT_MISMATCH');
    expect(await defaultSaasEntitlementStore.getWorkspaceTier('ws_underpaid')).toBe('BASIC');
  });

  it('GET /api/ee/billing/nowpayments-ipn rejects cross-workspace lookup when session user is not a member', async () => {
    const res = await getNowPaymentsIpn(
      new Request('http://localhost/api/ee/billing/nowpayments-ipn?workspaceId=ws_foreign', {
        headers: { 'x-user-id': 'usr_unaffiliated' },
      }),
    );
    expect(res.status).toBe(403);
  });
});
