// POST /api/ee/alerts — authenticated workspace alerts with server-controlled signing and REAL
// delivery attempts through configured channel senders (Telegram / webhook / email).
// Every outcome is reported honestly: `delivered` is only true when a provider accepted the
// message; unconfigured or failed channels say so. Dedup/retry state is durable (D1) so
// suppression survives worker restarts and coordinates across isolates.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CloudAlertDeduplicator, signAlertWebhookPayload, type CloudAlertEvent, type SignedWebhookEnvelope } from '@/ee/alerts/cloud-alert-dispatcher';
import { createAlertDispatchService, createD1DispatchLogStore, type AlertDispatchRecord } from '@/ee/alerts/alert-dispatch-service';
import { createSendersFromEnv } from '@/ee/alerts/alert-channel-senders';
import { getEntitlementsForTier } from '@/ee/billing/tier-entitlements';
import { resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';

const CloudAlertEventSchema = z.object({
  eventId: z.string().min(1).max(128),
  workspaceId: z.string().min(1).max(128),
  botId: z.string().min(1).max(128),
  channel: z.enum(['TELEGRAM', 'WEBHOOK', 'EMAIL']),
  message: z.string().min(1).max(4000),
  timestampMs: z.number().int().positive(),
  cooldownMs: z.number().int().positive().optional(),
});

export const defaultAlertDeduplicator = new CloudAlertDeduplicator();

export async function POST(req: Request) {
  try {
    const parsed = CloudAlertEventSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid alert payload' }, { status: 400 });

    const context = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: parsed.data.workspaceId });
    if (!['OWNER', 'ADMIN', 'TRADER'].includes(context.role)) {
      return NextResponse.json({ ok: false, error: 'Workspace role cannot dispatch alerts' }, { status: 403 });
    }
    const bot = await context.db.prepare('SELECT id FROM bots WHERE id = ? AND workspace_id = ?')
      .bind(parsed.data.botId, context.workspaceId).first<{ id: string }>();
    if (!bot) return NextResponse.json({ ok: false, error: 'Bot not found' }, { status: 404 });

    const entitlements = getEntitlementsForTier(context.tier);
    if (parsed.data.channel === 'WEBHOOK' && !entitlements.customWebhookAlertsAllowed) {
      return NextResponse.json({
        ok: false, code: 'QUOTA_EXCEEDED', tier: context.tier,
        error: `Custom webhook alerts require PREMIUM or higher (current tier: ${context.tier})`,
      }, { status: 402 });
    }
    const secret = process.env.CASHCLAW_ALERT_WEBHOOK_SECRET;
    if (!secret || secret.trim().length < 8) {
      return NextResponse.json({ ok: false, error: 'Alert signing is not configured' }, { status: 503 });
    }

    const event: CloudAlertEvent = { ...parsed.data, workspaceId: context.workspaceId };
    const shouldSend = defaultAlertDeduplicator.shouldDispatch(event, parsed.data.cooldownMs ?? 60_000);
    if (!shouldSend) {
      return NextResponse.json({ ok: true, dispatched: false, delivered: false, deliveryStatus: 'suppressed',
        deduplicated: true, suppressed: true,
        eventId: event.eventId, tier: context.tier, workspaceId: event.workspaceId });
    }

    const payloadJson = JSON.stringify(event);
    const signatureHex = await signAlertWebhookPayload(payloadJson, secret);
    const envelope: SignedWebhookEnvelope = { eventId: event.eventId, signatureHex, payloadJson };

    const service = createAlertDispatchService({
      senders: createSendersFromEnv(process.env as Record<string, string | undefined>),
      logStore: createD1DispatchLogStore(context.db),
    });
    const record: AlertDispatchRecord = await service.dispatch({
      eventId: event.eventId,
      workspaceId: event.workspaceId,
      botId: event.botId,
      channel: event.channel,
      message: event.message,
      timestampMs: event.timestampMs,
    });
    if (record.deliveryStatus === 'suppressed') {
      return NextResponse.json({ ok: true, dispatched: false, delivered: false, deliveryStatus: 'suppressed',
        deduplicated: true, suppressed: true,
        eventId: event.eventId, tier: context.tier, workspaceId: event.workspaceId });
    }
    return NextResponse.json({ ok: true,
      dispatched: record.dispatched, delivered: record.delivered, deliveryStatus: record.deliveryStatus,
      attempts: record.attempts, providerRef: record.providerRef ?? null, error: record.error ?? null,
      deduplicated: false, suppressed: false,
      tier: context.tier, workspaceId: event.workspaceId, signatureHex, envelope });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}
