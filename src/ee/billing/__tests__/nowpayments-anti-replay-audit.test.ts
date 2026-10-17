// Security Audit Test Suite for NOWPayments IPN Anti-Replay & Tampering
// Verifies HMAC-SHA512 cryptographic signature and idempotent payment deduplication.

import { describe, it, expect } from 'vitest';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
  verifyAndProcessNowPaymentsIpn,
} from '../nowpayments-ipn';

describe('Security Audit: NOWPayments IPN Anti-Replay & Cryptographic Integrity', () => {
  const ipnSecret = 'secret_test_nowpayments_ipn_key_123';

  const validPayload = {
    payment_id: 'pay_99887766',
    payment_status: 'finished',
    order_id: 'ord_premium_month_01',
    workspace_id: 'ws_vip_alpha',
    target_tier: 'PREMIUM',
    pay_amount: 29.0,
    pay_currency: 'usdttrc20',
  };

  it('rejects tampered payload where amount was altered after signing', async () => {
    const canonical = canonicalizeNowPaymentsJson(validPayload);
    const signature = await computeNowPaymentsHmacSha512(canonical, ipnSecret);

    const tamperedPayload = {
      ...validPayload,
      pay_amount: 1.0, // Attacker lowered the payment amount
    };

    const cache = new Set<string>();
    const result = await verifyAndProcessNowPaymentsIpn(
      tamperedPayload,
      signature,
      ipnSecret,
      cache,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('IPN_SIGNATURE_INVALID');
    }
    expect(cache.has('pay_99887766')).toBe(false);
  });

  it('detects and nullifies replay attacks via idempotent cache', async () => {
    const canonical = canonicalizeNowPaymentsJson(validPayload);
    const signature = await computeNowPaymentsHmacSha512(canonical, ipnSecret);

    const cache = new Set<string>();

    // First attempt: should activate successfully
    const firstAttempt = await verifyAndProcessNowPaymentsIpn(
      validPayload,
      signature,
      ipnSecret,
      cache,
    );

    expect(firstAttempt.ok).toBe(true);
    if (firstAttempt.ok) {
      expect(firstAttempt.data.activated).toBe(true);
      expect(firstAttempt.data.idempotentReplay).toBe(false);
      expect(firstAttempt.data.newTier).toBe('PREMIUM');
    }

    // Replay attempt: identical payload sent again
    const replayAttempt = await verifyAndProcessNowPaymentsIpn(
      validPayload,
      signature,
      ipnSecret,
      cache,
    );

    expect(replayAttempt.ok).toBe(true);
    if (replayAttempt.ok) {
      expect(replayAttempt.data.activated).toBe(false);
      expect(replayAttempt.data.idempotentReplay).toBe(true);
      expect(replayAttempt.data.workspaceId).toBe('ws_vip_alpha');
    }
  });

  it('fails closed when IPN secret is empty or missing', async () => {
    const cache = new Set<string>();
    const result = await verifyAndProcessNowPaymentsIpn(
      validPayload,
      'any_sig',
      '',
      cache,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('IPN_CONFIG_ERROR');
    }
  });

  it('does not activate tier when payment status is pending or failed', async () => {
    const pendingPayload = {
      ...validPayload,
      payment_id: 'pay_pending_55',
      payment_status: 'waiting',
    };

    const canonical = canonicalizeNowPaymentsJson(pendingPayload);
    const signature = await computeNowPaymentsHmacSha512(canonical, ipnSecret);
    const cache = new Set<string>();

    const result = await verifyAndProcessNowPaymentsIpn(
      pendingPayload,
      signature,
      ipnSecret,
      cache,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.activated).toBe(false);
      expect(result.data.idempotentReplay).toBe(false);
    }
  });
});
