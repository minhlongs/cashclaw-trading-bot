// The IPN verifier once fell back to the literal 'test_ipn_secret' when
// NOWPAYMENTS_IPN_SECRET was absent. Anyone could sign a payment callback with
// that string, so the fallback is gone and absence must fail closed. These tests
// pin that, and pin the edge-binding read that replaces `process.env` on Workers.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { verifyNowPaymentsIpnHttpRequest, resolveIpnSecret } from '../nowpayments-ipn-verifier';
import {
  IPN_MISSING_SECRET_ERROR,
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '../nowpayments-ipn';

const SECRET = 'unit-ipn-secret-value';

async function signedRequest(payload: Record<string, unknown>, secret: string): Promise<Request> {
  const sig = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), secret);
  return new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
    method: 'POST',
    headers: { 'x-nowpayments-sig': sig },
    body: JSON.stringify(payload),
  });
}

const validPayload = {
  payment_id: 'np_fail_closed_1',
  payment_status: 'finished',
  order_id: 'ord_fc_1',
  workspace_id: 'ws_fc',
  target_tier: 'PREMIUM',
  pay_amount: 29,
  pay_currency: 'USDT',
};

describe('resolveIpnSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when no secret is configured anywhere', () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', undefined);
    expect(resolveIpnSecret()).toBeNull();
  });

  it('treats a blank secret as unconfigured', () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', '   ');
    expect(resolveIpnSecret()).toBeNull();
  });

  it('returns the trimmed secret when configured', () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', `  ${SECRET}  `);
    expect(resolveIpnSecret()).toBe(SECRET);
  });
});

describe('verifyNowPaymentsIpnHttpRequest fail-closed behavior', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects with 503 and IPN_CONFIG_ERROR when no secret is configured', async () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', undefined);

    const result = await verifyNowPaymentsIpnHttpRequest(await signedRequest(validPayload, 'anything'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toBe(IPN_MISSING_SECRET_ERROR);
    }
  });

  it('does not accept the removed default literal as a signature', async () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', undefined);

    // Signed with the value the code used to fall back to. With the fallback
    // gone this must be rejected for a missing secret, never accepted.
    const result = await verifyNowPaymentsIpnHttpRequest(
      await signedRequest(validPayload, 'test_ipn_secret'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('IPN_CONFIG_ERROR');
  });

  it('treats a blank override as unconfigured rather than as a secret', async () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', undefined);

    const result = await verifyNowPaymentsIpnHttpRequest(await signedRequest(validPayload, SECRET), '  ');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it('verifies a correctly signed request when the secret is configured', async () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', SECRET);

    const result = await verifyNowPaymentsIpnHttpRequest(await signedRequest(validPayload, SECRET));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.payment_id).toBe('np_fail_closed_1');
  });

  it('rejects a signature computed with a different secret', async () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', SECRET);

    const result = await verifyNowPaymentsIpnHttpRequest(await signedRequest(validPayload, 'some-other-secret'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toContain('Invalid HMAC signature');
    }
  });

  it('honors an explicit override over the configured environment secret', async () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', 'env-secret-not-used');

    const result = await verifyNowPaymentsIpnHttpRequest(await signedRequest(validPayload, 'override-secret'), 'override-secret');

    expect(result.ok).toBe(true);
  });

  it('still reports a missing signature header before the secret check', async () => {
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', SECRET);

    const result = await verifyNowPaymentsIpnHttpRequest(
      new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });
});
