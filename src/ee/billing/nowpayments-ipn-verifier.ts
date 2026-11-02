// Shared NOWPayments IPN HTTP verifier.
// The provider HMAC authenticates the canonical JSON body. Timestamp headers are not HMAC-signed,
// so they are not used as an authorization/replay credential; durable order-bound D1 history handles replay.

import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  NowPaymentsIpnPayloadSchema,
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
  constantTimeHexEqual,
  type NowPaymentsIpnPayload,
} from './nowpayments-ipn';

export type NowPaymentsIpnHttpVerifyResult =
  | { readonly ok: true; readonly payload: NowPaymentsIpnPayload }
  | { readonly ok: false; readonly status: 400 | 401 | 403 | 503; readonly error: string };

function getRuntimeIpnSecret(): string | undefined {
  try {
    const env = getCloudflareContext().env as unknown as { NOWPAYMENTS_IPN_SECRET?: string };
    if (typeof env.NOWPAYMENTS_IPN_SECRET === 'string') return env.NOWPAYMENTS_IPN_SECRET;
  } catch {
    // Outside the OpenNext Worker (e.g. local Node tests), use the process environment fallback.
  }
  return process.env.NOWPAYMENTS_IPN_SECRET;
}

export async function verifyNowPaymentsIpnHttpRequest(
  req: Request,
  ipnSecretOverride?: string,
): Promise<NowPaymentsIpnHttpVerifyResult> {
  const secret = ipnSecretOverride ?? getRuntimeIpnSecret();
  if (!secret || secret.trim().length === 0) return { ok: false, status: 503, error: 'IPN verification is not configured' };

  const signature = req.headers.get('x-nowpayments-sig');
  if (!signature) return { ok: false, status: 401, error: 'Missing x-nowpayments-sig header' };

  const rawBody = await req.text();
  let parsedJson: Record<string, unknown>;
  try {
    parsedJson = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  }

  const expectedSig = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(parsedJson), secret);
  if (!constantTimeHexEqual(signature, expectedSig)) return { ok: false, status: 403, error: 'Invalid HMAC signature' };

  const validated = NowPaymentsIpnPayloadSchema.safeParse(parsedJson);
  if (!validated.success) return { ok: false, status: 400, error: validated.error.message };
  return { ok: true, payload: validated.data };
}
