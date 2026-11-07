// Step 18: NOWPayments IPN Webhook & Crypto Billing Engine
// Uses WebCrypto HMAC-SHA512 over canonical sorted JSON per NOWPayments IPN specification.
// (Polar is strictly prohibited per handover rules).

import { z } from 'zod';
import { type Result, ok, err } from '../../lib/result';
import { SaasTierSchema, type SaasTier } from '../tenancy/tenant-policy';

/** One string both the HTTP verifier and this pure seam return when the secret
 *  is absent, so a deploy that forgot the secret fails identically everywhere.
 *  There is no default secret: a literal in a public repo would let anyone sign
 *  their own payment callback. */
export const IPN_MISSING_SECRET_ERROR = 'IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET';

/** `workspace_id` and `target_tier` are optional and are *not* provider fields:
 *  NOWPayments echoes back only its own values (`payment_id`, `payment_status`,
 *  `order_id`, `pay_amount`, `pay_currency`, ...). Both are carried through here
 *  only so a callback that happens to include them still validates; the tier and
 *  workspace an IPN is allowed to change are resolved from the checkout order the
 *  server wrote when it created the invoice (see `CheckoutOrderStore`). Trusting
 *  these fields meant anyone holding a valid signature could name their own tier. */
export const NowPaymentsIpnPayloadSchema = z.object({
  payment_id: z.string().min(1),
  payment_status: z.enum([
    'waiting', 'confirming', 'confirmed', 'sending',
    'partially_paid', 'finished', 'failed', 'refunded', 'expired',
  ]),
  order_id: z.string().min(1),
  workspace_id: z.string().min(1).optional(),
  target_tier: SaasTierSchema.optional(),
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
  /** The tier and workspace this callback is allowed to act on, resolved by the
   *  caller from the checkout order the server recorded. The callback's own
   *  `workspace_id` / `target_tier` fields are never used for this decision. */
  orderDecision?: { readonly workspaceId: string; readonly targetTier: SaasTier },
): Promise<
  Result<{
    readonly activated: boolean;
    readonly workspaceId: string;
    readonly newTier: SaasTier;
    readonly idempotentReplay: boolean;
  }>
> {
  if (!ipnSecret || ipnSecret.trim().length === 0) {
    return err(IPN_MISSING_SECRET_ERROR);
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
  if (!orderDecision) {
    // No server-issued order backs this callback, so there is nothing to upgrade
    // and no way to check the tier the callback claims.
    return err('IPN_ORDER_UNKNOWN: no checkout order matches this order_id');
  }
  const { workspaceId, targetTier } = orderDecision;

  if (processedPaymentIds.has(data.payment_id)) {
    return ok({ activated: false, workspaceId, newTier: targetTier, idempotentReplay: true });
  }

  if (data.payment_status === 'finished' || data.payment_status === 'confirmed') {
    processedPaymentIds.add(data.payment_id);
    return ok({ activated: true, workspaceId, newTier: targetTier, idempotentReplay: false });
  }

  return ok({ activated: false, workspaceId, newTier: targetTier, idempotentReplay: false });
}
