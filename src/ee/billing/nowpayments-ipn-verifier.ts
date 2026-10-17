// Shared NOWPayments IPN HTTP Request Verifier
// Centralizes signature presence, 300s timestamp anti-replay, canonical JSON HMAC-SHA512,
// and Zod schema verification across `/api/ee/billing/nowpayments-ipn` and `/api/ee/billing/ipn`.

import {
  NowPaymentsIpnPayloadSchema,
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
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
      readonly status: 400 | 401 | 403;
      readonly error: string;
    };

export async function verifyNowPaymentsIpnHttpRequest(
  req: Request,
  ipnSecretOverride?: string,
): Promise<NowPaymentsIpnHttpVerifyResult> {
  const signature = req.headers.get('x-nowpayments-sig');
  if (!signature) {
    return {
      ok: false,
      status: 401,
      error: 'Missing x-nowpayments-sig header',
    };
  }

  const timestampHeader = req.headers.get('x-nowpayments-timestamp');
  if (timestampHeader) {
    const sentTime = parseInt(timestampHeader, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Number.isNaN(sentTime) || Math.abs(currentTime - sentTime) > MAX_TIMESTAMP_AGE_SECONDS) {
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

  const secret = ipnSecretOverride ?? process.env.NOWPAYMENTS_IPN_SECRET ?? 'test_ipn_secret';
  const canonicalJson = canonicalizeNowPaymentsJson(parsedJson);
  const expectedSig = await computeNowPaymentsHmacSha512(canonicalJson, secret);

  if (expectedSig !== signature.trim().toLowerCase()) {
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
