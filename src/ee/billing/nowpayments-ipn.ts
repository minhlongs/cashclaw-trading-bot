// Step 18 & Gate G11: NOWPayments IPN Webhook & Crypto Billing Engine
// Uses WebCrypto HMAC-SHA512 over canonical sorted JSON per NOWPayments IPN specification.
// Enforces non-activation on partially_paid/pending/failed statuses, underpayment rejection,
// and atomic in-flight + persisted replay defense across concurrent callbacks.

import { z } from 'zod';
import { type Result, ok, err } from '../../lib/result';
import { SaasTierSchema, type SaasTier } from '../tenancy/tenant-policy';

export const IPN_MISSING_SECRET_ERROR = 'IPN_CONFIG_ERROR: Missing NOWPAYMENTS_IPN_SECRET';

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
  actually_paid: z.number().nonnegative().optional(),
  outcome_amount: z.number().nonnegative().optional(),
  outcome_currency: z.string().min(2).optional(),
  price_amount: z.number().positive().optional(),
  price_currency: z.string().min(2).optional(),
});

export type NowPaymentsIpnPayload = z.infer<typeof NowPaymentsIpnPayloadSchema>;

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = sortJsonValue(record[key]);
    return sorted;
  }
  return value;
}

export function canonicalizeNowPaymentsJson(payload: Record<string, unknown>): string {
  return JSON.stringify(sortJsonValue(payload));
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

export function isActivatingIpnStatus(status: NowPaymentsIpnPayload['payment_status']): boolean {
  return status === 'finished' || status === 'confirmed';
}

function isUsdPeggedCurrency(currency?: string): boolean {
  return !currency || /^(usd|usdt|usdc|busd|dai|fdusd)/i.test(currency.trim());
}

export function detectNowPaymentsUnderpayment(
  payload: NowPaymentsIpnPayload,
  expectedAmountUsd?: number,
): string | null {
  const eps = 1e-9;
  if (typeof payload.actually_paid === 'number' && payload.actually_paid + eps < payload.pay_amount) {
    return `IPN_AMOUNT_MISMATCH: actually_paid ${payload.actually_paid} ${payload.pay_currency} < required pay_amount ${payload.pay_amount}`;
  }
  if (typeof expectedAmountUsd !== 'number' || expectedAmountUsd <= 0) return null;
  if (isUsdPeggedCurrency(payload.pay_currency)) {
    if (payload.pay_amount + eps < expectedAmountUsd) {
      return `IPN_AMOUNT_MISMATCH: paid ${payload.pay_amount} ${payload.pay_currency} < expected ${expectedAmountUsd} USD`;
    }
    if (typeof payload.actually_paid === 'number' && payload.actually_paid + eps < expectedAmountUsd) {
      return `IPN_AMOUNT_MISMATCH: actually_paid ${payload.actually_paid} ${payload.pay_currency} < expected ${expectedAmountUsd} USD`;
    }
  }
  if (
    typeof payload.outcome_amount === 'number' &&
    isUsdPeggedCurrency(payload.outcome_currency) &&
    payload.outcome_amount + eps < expectedAmountUsd
  ) {
    return `IPN_AMOUNT_MISMATCH: outcome_amount ${payload.outcome_amount} < expected ${expectedAmountUsd} USD`;
  }
  if (
    typeof payload.price_amount === 'number' &&
    isUsdPeggedCurrency(payload.price_currency) &&
    payload.price_amount + eps < expectedAmountUsd
  ) {
    return `IPN_AMOUNT_MISMATCH: price_amount ${payload.price_amount} < expected ${expectedAmountUsd} USD`;
  }
  return null;
}

const inFlightPureSets = new WeakMap<Set<string>, Set<string>>();

function getInFlightSet(processedSet: Set<string>): Set<string> {
  let set = inFlightPureSets.get(processedSet);
  if (!set) {
    set = new Set<string>();
    inFlightPureSets.set(processedSet, set);
  }
  return set;
}

export async function verifyAndProcessNowPaymentsIpn(
  rawPayload: Record<string, unknown>,
  receivedSignatureHex: string,
  ipnSecret: string,
  processedPaymentIds: Set<string>,
  orderDecision?: {
    readonly workspaceId: string;
    readonly targetTier: SaasTier;
    readonly expectedAmountUsd?: number;
  },
): Promise<
  Result<{
    readonly activated: boolean;
    readonly workspaceId: string;
    readonly newTier: SaasTier;
    readonly idempotentReplay: boolean;
    readonly duplicate: boolean;
  }>
> {
  if (!ipnSecret || ipnSecret.trim().length === 0) return err(IPN_MISSING_SECRET_ERROR);

  const canonical = canonicalizeNowPaymentsJson(rawPayload);
  const expectedSig = await computeNowPaymentsHmacSha512(canonical, ipnSecret);
  if (expectedSig !== receivedSignatureHex.trim().toLowerCase()) {
    return err('IPN_SIGNATURE_INVALID: HMAC-SHA512 verification failed');
  }

  const parsed = NowPaymentsIpnPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) return err(`IPN_SCHEMA_INVALID: ${parsed.error.message}`);

  const data = parsed.data;
  if (!orderDecision) return err('IPN_ORDER_UNKNOWN: no checkout order matches this order_id');
  const { workspaceId, targetTier, expectedAmountUsd } = orderDecision;

  const inFlight = getInFlightSet(processedPaymentIds);
  if (processedPaymentIds.has(data.payment_id) || inFlight.has(data.payment_id)) {
    return ok({ activated: false, workspaceId, newTier: targetTier, idempotentReplay: true, duplicate: true });
  }
  if (!isActivatingIpnStatus(data.payment_status)) {
    return ok({ activated: false, workspaceId, newTier: targetTier, idempotentReplay: false, duplicate: false });
  }

  const underpayment = detectNowPaymentsUnderpayment(data, expectedAmountUsd);
  if (underpayment) return err(underpayment);

  inFlight.add(data.payment_id);
  processedPaymentIds.add(data.payment_id);
  inFlight.delete(data.payment_id);
  return ok({ activated: true, workspaceId, newTier: targetTier, idempotentReplay: false, duplicate: false });
}
