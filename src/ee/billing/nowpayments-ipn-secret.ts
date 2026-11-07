// Resolution of the NOWPayments IPN secret for the Cloudflare Workers edge runtime.
// Kept separate from the verifier so "where does the secret come from" has exactly
// one answer, and so the verifier never contains a default literal.

import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Reads the IPN secret from the Workers edge binding when there is a request
 * context, then from `process.env` for local scripts and unit tests.
 *
 * The edge binding is preferred because `process.env` is not populated for
 * secrets on Cloudflare Workers — a secret set with `wrangler secret put`
 * arrives on `env`, so reading only `process.env` would make a correctly
 * configured production deploy look unconfigured. Returns null when neither
 * source has one; the caller must fail closed rather than substitute a default.
 */
export function readIpnSecret(): string | null {
  try {
    const { env } = getCloudflareContext();
    const fromBinding = (env as unknown as { NOWPAYMENTS_IPN_SECRET?: string }).NOWPAYMENTS_IPN_SECRET;
    if (fromBinding && fromBinding.trim().length > 0) return fromBinding.trim();
  } catch {
    // No request context (unit tests, plain Node) — fall through to process.env.
  }

  const fromProcessEnv = typeof process !== 'undefined' ? process.env.NOWPAYMENTS_IPN_SECRET : undefined;
  if (fromProcessEnv && fromProcessEnv.trim().length > 0) return fromProcessEnv.trim();
  return null;
}
