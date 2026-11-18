// Step 15 HTTP Endpoint: POST /api/ee/alerts
// Validates CloudAlertEvent, enforces cross-workspace anti-IDOR (403), checks SaaS tier entitlement,
// suppresses duplicates within cooldown, and signs webhook payloads with WebCrypto HMAC-SHA256.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CloudAlertDeduplicator,
  signAlertWebhookPayload,
  type CloudAlertEvent,
  type SignedWebhookEnvelope,
} from '@/ee/alerts/cloud-alert-dispatcher';
import {
  ALERT_MISSING_SECRET_ERROR,
  readAlertWebhookSecret,
} from '@/ee/alerts/alert-webhook-secret';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import {
  detectCrossWorkspaceIdor,
  requireAuthenticatedUser,
  resolveEffectiveWorkspaceId,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';

const CloudAlertEventSchema = z.object({
  eventId: z.string().min(1),
  workspaceId: z.string().min(1),
  botId: z.string().min(1),
  channel: z.enum(['TELEGRAM', 'WEBHOOK', 'EMAIL']),
  message: z.string().min(1),
  timestampMs: z.number().int().positive(),
  cooldownMs: z.number().int().positive().optional(),
  signingSecret: z.string().trim().min(8).optional(),
});

export const defaultAlertDeduplicator = new CloudAlertDeduplicator();

export async function POST(req: Request) {
  try {
    const auth = requireAuthenticatedUser(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, code: auth.violation.code, error: auth.violation.error },
        { status: auth.violation.status },
      );
    }

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
    });
    const idor = detectCrossWorkspaceIdor(req, tierContext, parsed.data.workspaceId);
    if (idor) {
      return NextResponse.json(
        { ok: false, code: idor.code, error: idor.error },
        { status: idor.status },
      );
    }

    const entitlements = getEntitlementsForTier(tierContext.tier);
    if (!entitlements.customWebhookAlertsAllowed) {
      return NextResponse.json(
        {
          ok: false,
          code: 'QUOTA_EXCEEDED',
          tier: tierContext.tier,
          error: `Signed cloud alert dispatch requires PREMIUM or higher (current tier: ${tierContext.tier})`,
        },
        { status: 402 },
      );
    }

    const callerSuppliedSecret =
      typeof parsed.data.signingSecret === 'string' && parsed.data.signingSecret.length >= 8;
    const secret = readAlertWebhookSecret(parsed.data.signingSecret);
    if (!secret) {
      return NextResponse.json(
        { ok: false, code: 'ALERT_CONFIG_ERROR', error: ALERT_MISSING_SECRET_ERROR },
        { status: 503 },
      );
    }

    const effectiveWorkspaceId =
      resolveEffectiveWorkspaceId(req, tierContext.workspaceId, parsed.data.workspaceId) ??
      parsed.data.workspaceId;

    const event: CloudAlertEvent = {
      eventId: parsed.data.eventId,
      workspaceId: effectiveWorkspaceId,
      botId: parsed.data.botId,
      channel: parsed.data.channel,
      message: parsed.data.message,
      timestampMs: parsed.data.timestampMs,
    };

    const shouldSend = defaultAlertDeduplicator.shouldDispatch(event, parsed.data.cooldownMs ?? 60_000);
    if (!shouldSend) {
      return NextResponse.json({
        ok: true,
        dispatched: false,
        deduplicated: true,
        suppressed: true,
        eventId: event.eventId,
        tier: tierContext.tier,
      });
    }

    const payloadJson = JSON.stringify(event);
    const computedSignatureHex = await signAlertWebhookPayload(payloadJson, secret);
    if (!callerSuppliedSecret) {
      void computedSignatureHex;
      return NextResponse.json({
        ok: true,
        dispatched: true,
        deduplicated: false,
        suppressed: false,
        tier: tierContext.tier,
        envelope: { eventId: event.eventId, payloadJson },
      });
    }

    const envelope: SignedWebhookEnvelope = {
      eventId: event.eventId,
      signatureHex: computedSignatureHex,
      payloadJson,
    };

    return NextResponse.json({
      ok: true,
      dispatched: true,
      deduplicated: false,
      suppressed: false,
      tier: tierContext.tier,
      signatureHex: computedSignatureHex,
      envelope,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to dispatch cloud alert' }, { status: 500 });
  }
}
