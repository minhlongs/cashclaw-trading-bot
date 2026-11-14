import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  defaultFunnelSink,
  FunnelEventSchema,
  recordOptInFunnelEvent,
  summarizeConversionFunnel,
} from '@/ee/telemetry/conversion-funnel';
import {
  detectCrossWorkspaceIdor,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';

const TelemetryPayloadSchema = z.object({
  workspaceId: z.string().trim().min(1).optional(),
  telemetryOptIn: z.boolean().default(false),
  event: FunnelEventSchema,
});

export async function GET(req?: Request) {
  if (req) {
    const tierContext = await resolveWorkspaceTierContext(req);
    const idor = detectCrossWorkspaceIdor(req, tierContext);
    if (idor) {
      return NextResponse.json(
        { ok: false, code: idor.code, error: idor.error },
        { status: idor.status },
      );
    }
  }
  return NextResponse.json({
    ok: true,
    totalEvents: defaultFunnelSink.length,
    summary: summarizeConversionFunnel(defaultFunnelSink),
  });
}

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

    const result = recordOptInFunnelEvent(
      parsed.data.telemetryOptIn,
      parsed.data.event,
      defaultFunnelSink,
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
