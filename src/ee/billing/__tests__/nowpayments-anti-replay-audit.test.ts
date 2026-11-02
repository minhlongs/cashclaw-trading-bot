// Signature primitives only. Durable idempotency and entitlement mutations are tested against D1.
import { describe, it, expect } from 'vitest';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
  constantTimeHexEqual,
  NowPaymentsIpnPayloadSchema,
} from '../nowpayments-ipn';

describe('NOWPayments signature and callback schema primitives', () => {
  const secret = 'secret_test_nowpayments_ipn_key_123';
  const payload = {
    payment_id: 'pay_99887766', payment_status: 'finished', order_id: 'ord_premium_month_01',
    price_amount: 29, price_currency: 'USD', pay_amount: 29, pay_currency: 'usdttrc20',
  };

  it('detects amount tampering against the signed canonical body', async () => {
    const signature = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), secret);
    const altered = { ...payload, price_amount: 1 };
    const alteredSignature = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(altered), secret);
    expect(constantTimeHexEqual(signature, alteredSignature)).toBe(false);
  });

  it('accepts order amounts and currencies but rejects caller-supplied workspace/tier authority', () => {
    expect(NowPaymentsIpnPayloadSchema.safeParse(payload).success).toBe(true);
    expect(NowPaymentsIpnPayloadSchema.safeParse({ ...payload, workspace_id: 'attacker', target_tier: 'MASTER' }).success).toBe(false);
  });

  it('rejects malformed or truncated signature bytes', async () => {
    const signature = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), secret);
    expect(constantTimeHexEqual('badsignature', signature)).toBe(false);
  });
});
