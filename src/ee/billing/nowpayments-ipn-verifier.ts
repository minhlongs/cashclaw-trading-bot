// Shared NOWPayments IPN HTTP Request Verifier
// Centralizes signature presence, optional timestamp freshness checks, canonical JSON HMAC-SHA512,
// and Zod schema verification across both NOWPayments callback routes. Durable payment_id idempotency
// is enforced separately by the D1-backed entitlement store; the timestamp header is not HMAC-signed.

import {
  NowPaymentsIpnPayloadSchema,
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
  constantTimeHexEqual,
  type NowPaymentsIpnPayload,
} from './nowpayments-ipn';

const MAX_TIMESTAMP_AGE_SECONDS = 300;

export type NowPaymentsIpnHttpVerifyResult =
  | {
      readonly ok: true;
      readonly payload: NowPaymentsIpnPayload;
    }
  | {
      readonly ok: false;
      readonly status: 400 | 401 | 403 | 503;
      readonly error: string;
    };

export async function verifyNowPaymentsIpnHttpRequest(
  req: Request,
  ipnSecretOverride?: string,
): Promise<NowPaymentsIpnHttpVerifyResult> {
  const secret = ipnSecretOverride ?? process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || secret.trim().length === 0) {
    return { ok: false, status: 503, error: 'IPN verification is not configured' };
  }

  const signature = req.headers.get('x-nowpayments-sig');
  if (!signature) {
    return {
      ok: false,
      status: 401,
      error: 'Missing x-nowpayments-sig header',
    };
  }

  const timestampHeader = req.headers.get('x-nowpayments-timestamp');
  if (timestampHeader !== null) {
    const sentTime = /^\d+$/.test(timestampHeader) ? Number(timestampHeader) : Number.NaN;
    const currentTime = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(sentTime) || Math.abs(currentTime - sentTime) > MAX_TIMESTAMP_AGE_SECONDS) {
      return {
        ok: false,
        status: 403,
        error: 'Timestamp outside 300s anti-replay tolerance window',
      };
    }
  }

  const rawBody = await req.text();
  let parsedJson: Record<string, unknown>;
  try {
    parsedJson = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'Invalid JSON body',
    };
  }

  const canonicalJson = canonicalizeNowPaymentsJson(parsedJson);
  const expectedSig = await computeNowPaymentsHmacSha512(canonicalJson, secret);

  if (!constantTimeHexEqual(signature, expectedSig)) {
    return {
      ok: false,
      status: 403,
      error: 'Invalid HMAC signature',
    };
  }

  const validated = NowPaymentsIpnPayloadSchema.safeParse(parsedJson);
  if (!validated.success) {
    return {
      ok: false,
      status: 400,
      error: validated.error.message,
    };
  }

  return {
    ok: true,
    payload: validated.data,
  };
}
