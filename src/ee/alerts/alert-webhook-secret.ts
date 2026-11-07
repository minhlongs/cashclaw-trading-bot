// Resolution of the Cloud Alert webhook signing secret for the Cloudflare Workers edge runtime.
// Kept separate from the route handler so secret resolution has a single source of truth
// and never falls back to a public literal.

import { getCloudflareContext } from '@opennextjs/cloudflare';

export const ALERT_MISSING_SECRET_ERROR =
  'ALERT_CONFIG_ERROR: Missing CASHCLAW_ALERT_WEBHOOK_SECRET';

interface AlertWebhookEnvBindings {
  readonly CASHCLAW_ALERT_WEBHOOK_SECRET?: string;
  readonly CASHCLAW_ALERT_SIGNING_SECRET?: string;
}

/**
 * Resolves the HMAC-SHA256 signing secret for outbound Cloud Alert webhooks.
 *
 * Precedence:
 * 1. Explicit per-request `signingSecret` when non-blank.
 * 2. Cloudflare Workers edge binding (`getCloudflareContext().env`) for
 *    `CASHCLAW_ALERT_WEBHOOK_SECRET` or `CASHCLAW_ALERT_SIGNING_SECRET`.
 * 3. `process.env.CASHCLAW_ALERT_WEBHOOK_SECRET` or `process.env.CASHCLAW_ALERT_SIGNING_SECRET`
 *    for local development and unit tests.
 *
 * Returns `null` when none is configured; callers must fail closed (HTTP 503)
 * rather than sign with a default literal.
 */
function firstNonBlank(...candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
}

export function readAlertWebhookSecret(explicitSecret?: string): string | null {
  const fromExplicit = firstNonBlank(explicitSecret);
  if (fromExplicit !== null) {
    return fromExplicit;
  }

  try {
    const { env } = getCloudflareContext();
    const bindings = env as unknown as AlertWebhookEnvBindings;
    const fromBinding = firstNonBlank(
      bindings.CASHCLAW_ALERT_WEBHOOK_SECRET,
      bindings.CASHCLAW_ALERT_SIGNING_SECRET,
    );
    if (fromBinding !== null) {
      return fromBinding;
    }
  } catch {
    // No Cloudflare request context (unit tests, plain Node) — fall through to process.env.
  }

  if (typeof process !== 'undefined') {
    const fromProcessEnv = firstNonBlank(
      process.env.CASHCLAW_ALERT_WEBHOOK_SECRET,
      process.env.CASHCLAW_ALERT_SIGNING_SECRET,
    );
    if (fromProcessEnv !== null) {
      return fromProcessEnv;
    }
  }

  return null;
}
