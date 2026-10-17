import { describe, it, expect } from 'vitest';
import { POST as postNowPaymentsIpn } from './route';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '@/ee/billing/nowpayments-ipn';

describe('POST /api/ee/billing/nowpayments-ipn', () => {
  const secret = 'test_ipn_secret';

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

  it('processes valid IPN and activates tier, then handles replay idempotently', async () => {
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
});
