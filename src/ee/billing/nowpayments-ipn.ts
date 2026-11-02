// NOWPayments callback payload validation and HMAC-SHA512 primitives.
// Entitlements are never granted from payload workspace/tier fields; callback identity is bound
// to a server-created order in the D1-backed atomic order store.

import { z } from 'zod';

export const NowPaymentsIpnPayloadSchema = z.object({
  payment_id: z.string().min(1).max(128),
  payment_status: z.enum([
    'waiting', 'confirming', 'confirmed', 'sending',
    'partially_paid', 'finished', 'failed', 'refunded', 'expired',
  ]),
  order_id: z.string().min(1).max(128),
  price_amount: z.coerce.number().positive(),
  price_currency: z.string().min(3).max(10),
  pay_amount: z.coerce.number().positive(),
  pay_currency: z.string().min(2).max(16),
}).strict();

export type NowPaymentsIpnPayload = z.infer<typeof NowPaymentsIpnPayloadSchema>;

export function canonicalizeNowPaymentsJson(payload: Record<string, unknown>): string {
  const sortedObj: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) sortedObj[key] = payload[key];
  return JSON.stringify(sortedObj);
}

export function constantTimeHexEqual(received: string, expected: string): boolean {
  const normalized = received.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(normalized) || !/^[0-9a-f]{128}$/.test(expected)) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= normalized.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function computeNowPaymentsHmacSha512(
  canonicalJson: string,
  ipnSecret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(ipnSecret),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(canonicalJson));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
