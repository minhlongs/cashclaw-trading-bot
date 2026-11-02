import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn(), processEvent: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('@/ee/billing/nowpayments-order-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ee/billing/nowpayments-order-store')>()),
  processVerifiedNowPaymentsEvent: (...args: unknown[]) => mocks.processEvent(...args),
}));

import { GET as getEntitlement, POST as postIpn } from './route';
import { canonicalizeNowPaymentsJson, computeNowPaymentsHmacSha512 } from '@/ee/billing/nowpayments-ipn';

const secret = 'synthetic-test-secret-for-ipn-tests';
const payload = {
  payment_id: 'pay_1', payment_status: 'finished', order_id: 'order_1',
  price_amount: 29, price_currency: 'USD', pay_amount: 29, pay_currency: 'USDT',
};
const sign = async (value: Record<string, unknown>) => computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(value), secret);

function fakeDb() {
  return { prepare: (sql: string) => ({ bind: (..._args: unknown[]) => ({
    first: async () => sql.includes('FROM user_sessions') ? null : null,
  }) }) };
}

describe('/api/ee/billing/nowpayments-ipn security', () => {
  beforeEach(() => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', secret);
    mocks.createServerClient.mockReturnValue(fakeDb());
    mocks.processEvent.mockResolvedValue({ accepted: true, replay: false, activated: true, status: 'finished', tier: 'PREMIUM', workspaceId: 'server-workspace' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires a verified session for entitlement GET; forged user headers do not help', async () => {
    const response = await getEntitlement(new Request('https://app.example/api/ee/billing/nowpayments-ipn?workspaceId=victim', {
      headers: { 'x-user-id': 'victim', 'x-cashclaw-workspace': 'victim' },
    }));
    expect(response.status).toBe(401);
  });

  it('fails closed when IPN secret is missing or signature header is absent', async () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', '');
    const missingSecret = await postIpn(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
      method: 'POST', body: JSON.stringify(payload),
    }));
    expect(missingSecret.status).toBe(503);
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', secret);
    const missingSignature = await postIpn(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
      method: 'POST', body: JSON.stringify(payload),
    }));
    expect(missingSignature.status).toBe(401);
  });

  it('rejects invalid signatures, malformed JSON, and body authority fields', async () => {
    const invalidSig = await postIpn(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
      method: 'POST', headers: { 'x-nowpayments-sig': '00' }, body: JSON.stringify(payload),
    }));
    expect(invalidSig.status).toBe(403);
    const malformed = await postIpn(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
      method: 'POST', headers: { 'x-nowpayments-sig': '00' }, body: '{bad',
    }));
    expect(malformed.status).toBe(400);
    const forged = { ...payload, workspace_id: 'victim-workspace', target_tier: 'MASTER' };
    const forgedSig = await sign(forged);
    const rejected = await postIpn(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
      method: 'POST', headers: { 'x-nowpayments-sig': forgedSig }, body: JSON.stringify(forged),
    }));
    expect(rejected.status).toBe(400);
    expect(mocks.processEvent).not.toHaveBeenCalled();
  });

  it('does not use an unsigned timestamp header to reject a correctly HMAC-signed retry', async () => {
    const signature = await sign(payload);
    const response = await postIpn(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
      method: 'POST',
      headers: { 'x-nowpayments-sig': signature, 'x-nowpayments-timestamp': String(Math.floor(Date.now() / 1000) - 86_400) },
      body: JSON.stringify(payload),
    }));
    expect(response.status).toBe(200);
    expect(mocks.processEvent).toHaveBeenCalledTimes(1);
  });

  it('requires D1 for durable callback processing and rejects order binding mismatches', async () => {
    const signature = await sign(payload);
    mocks.createServerClient.mockReturnValue(null);
    const unavailable = await postIpn(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
      method: 'POST', headers: { 'x-nowpayments-sig': signature }, body: JSON.stringify(payload),
    }));
    expect(unavailable.status).toBe(503);

    mocks.createServerClient.mockReturnValue(fakeDb());
    mocks.processEvent.mockResolvedValue({ accepted: false, replay: false });
    const mismatch = await postIpn(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
      method: 'POST', headers: { 'x-nowpayments-sig': signature }, body: JSON.stringify(payload),
    }));
    expect(mismatch.status).toBe(404);
  });

  it('returns durable idempotent replay semantics from the order store', async () => {
    const signature = await sign(payload);
    mocks.processEvent.mockResolvedValue({ accepted: true, replay: true, activated: false, status: 'finished', tier: 'PREMIUM', workspaceId: 'server-workspace' });
    const response = await postIpn(new Request('https://app.example/api/ee/billing/nowpayments-ipn', {
      method: 'POST', headers: { 'x-nowpayments-sig': signature }, body: JSON.stringify(payload),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, activated: false, paymentStatus: 'finished', idempotentReplay: true });
    expect(mocks.processEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ order_id: 'order_1' }), expect.any(String));
  });
});
