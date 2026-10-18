// Step 18: NOWPayments IPN Webhook & Crypto Billing Engine
// Uses WebCrypto HMAC-SHA512 over canonical sorted JSON per NOWPayments IPN specification.
// (Polar is strictly prohibited per handover rules).

import { z } from 'zod';
import { type Result, ok, err } from '../../lib/result';
import { SaasTierSchema, type SaasTier } from '../tenancy/tenant-policy';

export const NowPaymentsIpnPayloadSchema = z.object({
  payment_id: z.string().min(1),
  payment_status: z.enum([
    'waiting', 'confirming', 'confirmed', 'sending',
    'partially_paid', 'finished', 'failed', 'refunded', 'expired',
  ]),
  order_id: z.string().min(1),
  workspace_id: z.string().min(1),
  target_tier: SaasTierSchema,
  pay_amount: z.number().positive(),
  pay_currency: z.string().min(2),
});

export type NowPaymentsIpnPayload = z.infer<typeof NowPaymentsIpnPayloadSchema>;

export function canonicalizeNowPaymentsJson(payload: Record<string, unknown>): string {
  const sortedKeys = Object.keys(payload).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sortedObj[key] = payload[key];
  }
  return JSON.stringify(sortedObj);
}

export async function computeNowPaymentsHmacSha512(
  canonicalJson: string,
  ipnSecret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(ipnSecret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(canonicalJson));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyAndProcessNowPaymentsIpn(
  rawPayload: Record<string, unknown>,
  receivedSignatureHex: string,
  ipnSecret: string,
  processedPaymentIds: Set<string>,
): Promise<
  Result<{
    readonly activated: boolean;
    readonly workspaceId: string;
    readonly newTier: SaasTier;
    readonly idempotentReplay: boolean;
  }>
> {
  if (!ipnSecret || ipnSecret.trim().length === 0) {
    return err('IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET');
  }

  const canonical = canonicalizeNowPaymentsJson(rawPayload);
  const expectedSig = await computeNowPaymentsHmacSha512(canonical, ipnSecret);
  if (expectedSig !== receivedSignatureHex.trim().toLowerCase()) {
    return err('IPN_SIGNATURE_INVALID: HMAC-SHA512 verification failed');
  }

  const parsed = NowPaymentsIpnPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return err(`IPN_SCHEMA_INVALID: ${parsed.error.message}`);
  }

  const data = parsed.data;
  if (processedPaymentIds.has(data.payment_id)) {
    return ok({ activated: false, workspaceId: data.workspace_id, newTier: data.target_tier, idempotentReplay: true });
  }

  if (data.payment_status === 'finished' || data.payment_status === 'confirmed') {
    processedPaymentIds.add(data.payment_id);
    return ok({ activated: true, workspaceId: data.workspace_id, newTier: data.target_tier, idempotentReplay: false });
  }

  return ok({ activated: false, workspaceId: data.workspace_id, newTier: data.target_tier, idempotentReplay: false });
}
