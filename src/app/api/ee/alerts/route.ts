import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  signAlertWebhookPayload,
  CloudAlertDeduplicator,
  type AlertChannel,
} from '@/ee/alerts/cloud-alert-dispatcher';

const AlertRequestSchema = z.object({
  eventId: z.string().min(1),
  workspaceId: z.string().min(1),
  botId: z.string().min(1),
  channel: z.enum(['TELEGRAM', 'WEBHOOK', 'EMAIL']),
  message: z.string().min(1),
  timestampMs: z.number().int().positive().default(() => Date.now()),
  signingSecret: z.string().min(8).optional(),
});

const globalAlertDedup = new CloudAlertDeduplicator();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = AlertRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid alert payload', details: parsed.error.format() },
        { status: 400 },
      );
    }

    const event = {
      eventId: parsed.data.eventId,
      workspaceId: parsed.data.workspaceId,
      botId: parsed.data.botId,
      channel: parsed.data.channel as AlertChannel,
      message: parsed.data.message,
      timestampMs: parsed.data.timestampMs,
    };

    const allowed = globalAlertDedup.shouldDispatch(event, 60_000);
    if (!allowed) {
      return NextResponse.json({
        ok: true,
        suppressed: true,
        reason: 'Duplicate alert suppressed within deduplication window',
        eventId: event.eventId,
      });
    }

    let signatureHex: string | null = null;
    if (parsed.data.signingSecret) {
      signatureHex = await signAlertWebhookPayload(
        JSON.stringify(event),
        parsed.data.signingSecret,
      );
    }

    return NextResponse.json({
      ok: true,
      suppressed: false,
      eventId: event.eventId,
      channel: event.channel,
      signatureHex,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
