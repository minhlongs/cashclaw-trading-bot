// Pinning tests for Cloud Alert webhook secret resolution and fail-closed behavior.
// Ensures /api/ee/alerts never signs webhook envelopes with a public literal when
// CASHCLAW_ALERT_WEBHOOK_SECRET is absent, reads Cloudflare Workers edge bindings
// before process.env, and does not poison the deduplicator cooldown on 503 errors.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockCloudflareEnv: Record<string, string | undefined> = {};
let throwOnCloudflareContext = true;

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    if (throwOnCloudflareContext) {
      throw new Error('No Cloudflare request context');
    }
    return { env: mockCloudflareEnv };
  },
}));

import {
  ALERT_MISSING_SECRET_ERROR,
  readAlertWebhookSecret,
} from '../alert-webhook-secret';
import { signAlertWebhookPayload } from '../cloud-alert-dispatcher';
import { POST as postCloudAlert } from '@/app/api/ee/alerts/route';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';

describe('readAlertWebhookSecret', () => {
  beforeEach(() => {
    throwOnCloudflareContext = true;
    for (const key of Object.keys(mockCloudflareEnv)) {
      delete mockCloudflareEnv[key];
    }
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when no secret is configured in explicit args, edge bindings, or process.env', () => {
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', undefined);
    vi.stubEnv('CASHCLAW_ALERT_SIGNING_SECRET', undefined);
    expect(readAlertWebhookSecret()).toBeNull();
    expect(readAlertWebhookSecret('   ')).toBeNull();
  });

  it('prefers an explicit per-request signingSecret when non-blank', () => {
    throwOnCloudflareContext = false;
    mockCloudflareEnv.CASHCLAW_ALERT_WEBHOOK_SECRET = 'edge-secret-value';
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', 'env-secret-value');

    expect(readAlertWebhookSecret('  explicit-secret-value  ')).toBe('explicit-secret-value');
  });

  it('reads CASHCLAW_ALERT_WEBHOOK_SECRET or CASHCLAW_ALERT_SIGNING_SECRET from Cloudflare edge binding before process.env', () => {
    throwOnCloudflareContext = false;
    mockCloudflareEnv.CASHCLAW_ALERT_WEBHOOK_SECRET = '  edge-webhook-secret  ';
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', 'process-env-secret');

    expect(readAlertWebhookSecret()).toBe('edge-webhook-secret');

    delete mockCloudflareEnv.CASHCLAW_ALERT_WEBHOOK_SECRET;
    mockCloudflareEnv.CASHCLAW_ALERT_SIGNING_SECRET = 'edge-signing-alias';
    expect(readAlertWebhookSecret()).toBe('edge-signing-alias');
  });

  it('falls back to process.env when Cloudflare edge context is unavailable or blank', () => {
    throwOnCloudflareContext = true;
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', '  process-webhook-secret  ');
    expect(readAlertWebhookSecret()).toBe('process-webhook-secret');

    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', '   ');
    vi.stubEnv('CASHCLAW_ALERT_SIGNING_SECRET', 'process-signing-alias');
    expect(readAlertWebhookSecret()).toBe('process-signing-alias');
  });
});

describe('POST /api/ee/alerts fail-closed secret behavior', () => {
  beforeEach(async () => {
    throwOnCloudflareContext = true;
    for (const key of Object.keys(mockCloudflareEnv)) {
      delete mockCloudflareEnv[key];
    }
    vi.unstubAllEnvs();
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
    await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_alert_fc',
      workspaceId: 'ws_alert_fc',
      targetTier: 'PREMIUM',
      paymentStatus: 'finished',
      payAmount: 29,
      payCurrency: 'USDT',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed with 503 ALERT_CONFIG_ERROR when no secret is configured and does not poison deduplication cooldown', async () => {
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', undefined);
    vi.stubEnv('CASHCLAW_ALERT_SIGNING_SECRET', undefined);

    const payload = {
      eventId: 'evt_fail_closed_001',
      workspaceId: 'ws_alert_fc',
      botId: 'bot_fc_1',
      channel: 'WEBHOOK',
      message: 'Volatility threshold crossed',
      timestampMs: 1_770_000_000_000,
    };

    const failRes = await postCloudAlert(
      new Request('http://localhost/api/ee/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );

    expect(failRes.status).toBe(503);
    const failBody = (await failRes.json()) as { ok: boolean; code: string; error: string };
    expect(failBody.ok).toBe(false);
    expect(failBody.code).toBe('ALERT_CONFIG_ERROR');
    expect(failBody.error).toBe(ALERT_MISSING_SECRET_ERROR);

    // Once the secret is configured on the edge binding, retrying the same event
    // within the cooldown window must succeed and must never match 'default_alert_secret'.
    throwOnCloudflareContext = false;
    mockCloudflareEnv.CASHCLAW_ALERT_WEBHOOK_SECRET = 'configured-edge-alert-secret';

    const retryRes = await postCloudAlert(
      new Request('http://localhost/api/ee/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );

    expect(retryRes.status).toBe(200);
    const retryBody = (await retryRes.json()) as {
      ok: boolean;
      dispatched: boolean;
      deduplicated: boolean;
      signatureHex: string;
      envelope: { payloadJson: string };
    };
    expect(retryBody.ok).toBe(true);
    expect(retryBody.dispatched).toBe(true);
    expect(retryBody.deduplicated).toBe(false);

    const defaultLiteralSig = await signAlertWebhookPayload(
      retryBody.envelope.payloadJson,
      'default_alert_secret',
    );
    expect(retryBody.signatureHex).not.toBe(defaultLiteralSig);
  });
});
