// Shared NOWPayments IPN HTTP Request Verifier
// Centralizes signature presence, 300s timestamp anti-replay, canonical JSON HMAC-SHA512,
// and Zod schema verification across `/api/ee/billing/nowpayments-ipn` and `/api/ee/billing/ipn`.

import {
  IPN_MISSING_SECRET_ERROR,
  NowPaymentsIpnPayloadSchema,
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
  type NowPaymentsIpnPayload,
} from './nowpayments-ipn';
import { readIpnSecret } from './nowpayments-ipn-secret';

const MAX_TIMESTAMP_AGE_SECONDS = 300;

/** Re-exported so route handlers can name the same failure without importing
 *  the pure billing seam they do not otherwise use. */
export { IPN_MISSING_SECRET_ERROR };

export type NowPaymentsIpnHttpVerifyResult =
  | {
      readonly ok: true;
      readonly payload: NowPaymentsIpnPayload;
    }
  | {
      readonly ok: false;
      // 503: the worker is reachable but not configured to verify signatures.
      readonly status: 400 | 401 | 403 | 503;
      readonly error: string;
    };

/**
 * Resolves the NOWPayments IPN secret, or fails closed.
 *
 * There is deliberately no default value. An empty or absent secret means the
 * worker cannot verify a signature at all, and falling back to any literal would
 * let an attacker sign their own payment callback with a string committed to a
 * public repository. On Cloudflare Workers the secret arrives as an edge binding
 * rather than `process.env`, so the binding is read first.
 */
export function resolveIpnSecret(): string | null {
  const secret = readIpnSecret();
  if (!secret || secret.trim().length === 0) return null;
  return secret.trim();
}

export async function verifyNowPaymentsIpnHttpRequest(
  req: Request,
  ipnSecretOverride?: string,
): Promise<NowPaymentsIpnHttpVerifyResult> {
  const secret = ipnSecretOverride?.trim() || resolveIpnSecret();
  if (!secret) {
    return { ok: false, status: 503, error: IPN_MISSING_SECRET_ERROR };
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

  const secretOverride = ipnSecretOverride?.trim();
  const effectiveSecret = secretOverride && secretOverride.length > 0 ? secretOverride : resolveIpnSecret();
  if (!effectiveSecret) {
    return { ok: false, status: 503, error: IPN_MISSING_SECRET_ERROR };
  }

  const canonicalJson = canonicalizeNowPaymentsJson(parsedJson);
  const expectedSig = await computeNowPaymentsHmacSha512(canonicalJson, effectiveSecret);

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
