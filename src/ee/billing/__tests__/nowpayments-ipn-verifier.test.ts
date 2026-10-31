import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalizeNowPaymentsJson, computeNowPaymentsHmacSha512 } from '../nowpayments-ipn';

const { getCloudflareContextMock } = vi.hoisted(() => ({ getCloudflareContextMock: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: getCloudflareContextMock }));

import { verifyNowPaymentsIpnHttpRequest } from '../nowpayments-ipn-verifier';

const payload = {
  payment_id: 'runtime-binding-payment',
  payment_status: 'finished',
  order_id: 'runtime-binding-order',
  price_amount: 29,
  price_currency: 'USD',
  pay_amount: 0.0005,
  pay_currency: 'BTC',
};

async function signedRequest(secret: string): Promise<Request> {
  const signature = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), secret);
  return new Request('https://worker.test/api/ee/billing/nowpayments-ipn', {
    method: 'POST',
    headers: { 'x-nowpayments-sig': signature },
    body: JSON.stringify(payload),
  });
}

describe('NOWPayments Worker secret binding', () => {
  beforeEach(() => {
    getCloudflareContextMock.mockReset();
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', '');
  });

  it('uses the OpenNext Worker secret binding when process.env is empty', async () => {
    const testSecret = 'ephemeral-worker-binding-secret-for-test-only';
    getCloudflareContextMock.mockReturnValue({ env: { NOWPAYMENTS_IPN_SECRET: testSecret } });

    const result = await verifyNowPaymentsIpnHttpRequest(await signedRequest(testSecret));

    expect(result).toEqual({ ok: true, payload });
  });

  it('fails closed if neither Worker binding nor process environment provides a secret', async () => {
    getCloudflareContextMock.mockImplementation(() => { throw new Error('outside Worker context'); });

    const result = await verifyNowPaymentsIpnHttpRequest(await signedRequest('unused-secret'));

    expect(result).toMatchObject({ ok: false, status: 503, error: 'IPN verification is not configured' });
  });
});
