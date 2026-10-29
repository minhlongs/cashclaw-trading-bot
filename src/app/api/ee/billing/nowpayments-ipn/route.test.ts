import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { D1Database } from '@/lib/db/types';

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ createServerClient }));

import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import { POST as postNowPaymentsIpn } from './route';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '@/ee/billing/nowpayments-ipn';

function fakeD1() {
  const payments = new Map<string, Record<string, unknown>>();
  const entitlements = new Map<string, Record<string, unknown>>();
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...args: unknown[]) { values = args; return statement; },
        async first<T>() {
          if (sql.includes('SELECT payment_id')) {
            const row = payments.get(String(values[0]));
            return row && ['finished', 'confirmed'].includes(String(row.payment_status))
              ? { payment_id: row.payment_id } as T : null;
          }
          if (sql.startsWith('SELECT workspace_id')) return (entitlements.get(String(values[0])) ?? null) as T | null;
          return null;
        },
        async run() {
          if (sql.includes('INSERT OR REPLACE INTO saas_nowpayments_ipn_events')) {
            const [payment_id, workspace_id, target_tier, payment_status, pay_amount, pay_currency, processed_at_ms] = values;
            payments.set(String(payment_id), { payment_id, workspace_id, target_tier, payment_status, pay_amount, pay_currency, processed_at_ms });
          } else if (sql.includes('INSERT INTO saas_workspace_entitlements')) {
            const [workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows, monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms] = values;
            entitlements.set(String(workspace_id), { workspace_id, owner_user_id, tier, max_running_bots, max_walk_forward_windows, monthly_llm_credits, managed_llm_pool_enabled, updated_at_ms });
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, payments };
}

const { db, payments } = fakeD1();

describe('POST /api/ee/billing/nowpayments-ipn', () => {
  const secret = 'synthetic-test-secret-for-ipn-tests';

  beforeEach(() => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', secret);
    createServerClient.mockReturnValue(db);
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
    payments.clear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('fails closed when the IPN signing secret is missing', async () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', '');
    const payload = {
      payment_id: 'np_missing_secret', payment_status: 'finished', order_id: 'ord_1',
      workspace_id: 'ws_1', target_tier: 'PREMIUM', pay_amount: 29, pay_currency: 'USDT',
    };
    const signature = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), 'test_ipn_secret');
    const res = await postNowPaymentsIpn(new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST', headers: { 'x-nowpayments-sig': signature }, body: JSON.stringify(payload),
    }));
    expect(res.status).toBe(503);
    expect(payments.size).toBe(0);
  });

  it('fails closed in production when the durable payment database is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    createServerClient.mockReturnValue(null);
    const payload = {
      payment_id: 'np_missing_d1', payment_status: 'finished', order_id: 'ord_2',
      workspace_id: 'ws_2', target_tier: 'PREMIUM', pay_amount: 29, pay_currency: 'USDT',
    };
    const signature = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), secret);
    const res = await postNowPaymentsIpn(new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
      method: 'POST', headers: { 'x-nowpayments-sig': signature }, body: JSON.stringify(payload),
    }));
    expect(res.status).toBe(503);
    expect(payments.size).toBe(0);
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

    // Simulate a Worker restart: the in-memory cache is gone, so D1 must still suppress replay.
    defaultSaasEntitlementStore.resetMemoryForTesting();
    expect(payments.get('np_unique_998811')?.payment_status).toBe('finished');
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
