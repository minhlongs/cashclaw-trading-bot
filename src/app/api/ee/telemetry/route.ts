import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  FunnelEventSchema,
  recordOptInFunnelEvent,
  type FunnelEvent,
} from '@/ee/telemetry/conversion-funnel';

const TelemetryPayloadSchema = z.object({
  telemetryOptIn: z.boolean().default(false),
  event: FunnelEventSchema,
});

const globalFunnelSink: FunnelEvent[] = [];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = TelemetryPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid telemetry payload', details: parsed.error.format() },
        { status: 400 },
      );
    }

    const result = recordOptInFunnelEvent(
      parsed.data.telemetryOptIn,
      parsed.data.event,
      globalFunnelSink,
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      recorded: result.data.recorded,
      optedIn: parsed.data.telemetryOptIn,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
