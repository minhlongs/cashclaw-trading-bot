// Step 15 HTTP Endpoint: POST /api/ee/alerts
// Validates CloudAlertEvent, checks optional SaaS tier entitlement, suppresses
// duplicates within cooldown, and signs webhook payloads with WebCrypto HMAC-SHA256.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CloudAlertDeduplicator,
  signAlertWebhookPayload,
  type CloudAlertEvent,
  type SignedWebhookEnvelope,
} from '@/ee/alerts/cloud-alert-dispatcher';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import { resolveWorkspaceTierContext } from '@/ee/tenancy/workspace-request-context';

const CloudAlertEventSchema = z.object({
  eventId: z.string().min(1),
  workspaceId: z.string().min(1),
  botId: z.string().min(1),
  channel: z.enum(['TELEGRAM', 'WEBHOOK', 'EMAIL']),
  message: z.string().min(1),
  timestampMs: z.number().int().positive(),
  cooldownMs: z.number().int().positive().optional(),
  signingSecret: z.string().min(8).optional(),
  tier: z.string().optional(),
});

export const defaultAlertDeduplicator = new CloudAlertDeduplicator();

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = CloudAlertEventSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 },
      );
    }

    const tierContext = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: parsed.data.workspaceId,
      explicitTier: parsed.data.tier,
    });
    if (tierContext.invalidExplicitTier) {
      return NextResponse.json(
        { ok: false, error: `Invalid tier: ${tierContext.invalidExplicitTier}` },
        { status: 400 },
      );
    }

    const entitlements = getEntitlementsForTier(tierContext.tier);
    if (parsed.data.channel === 'WEBHOOK' && !entitlements.customWebhookAlertsAllowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'QUOTA_EXCEEDED',
          tier: tierContext.tier,
          error: `Custom webhook alerts require PREMIUM or higher (current tier: ${tierContext.tier})`,
        },
        { status: 402 },
      );
    }

    const event: CloudAlertEvent = {
      eventId: parsed.data.eventId,
      workspaceId: parsed.data.workspaceId,
      botId: parsed.data.botId,
      channel: parsed.data.channel,
      message: parsed.data.message,
      timestampMs: parsed.data.timestampMs,
    };

    const shouldSend = defaultAlertDeduplicator.shouldDispatch(event, parsed.data.cooldownMs ?? 60_000);
    if (!shouldSend) {
      return NextResponse.json({
        ok: true, dispatched: false, deduplicated: true, suppressed: true,
        eventId: event.eventId, tier: tierContext.tier,
      });
    }

    const secret = parsed.data.signingSecret || process.env.CASHCLAW_ALERT_WEBHOOK_SECRET || 'default_alert_secret';
    const payloadJson = JSON.stringify(event);
    const signatureHex = await signAlertWebhookPayload(payloadJson, secret);
    const envelope: SignedWebhookEnvelope = { eventId: event.eventId, signatureHex, payloadJson };

    return NextResponse.json({
      ok: true, dispatched: true, deduplicated: false, suppressed: false,
      tier: tierContext.tier, signatureHex, envelope,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to dispatch cloud alert' }, { status: 500 });
  }
}
