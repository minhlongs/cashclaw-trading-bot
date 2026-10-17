import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CloudSchedulerCoordinator } from '@/ee/scheduler/cloud-scheduler-coordinator';

const LeaseRequestSchema = z.object({
  botId: z.string().min(1),
  workspaceId: z.string().min(1),
  isolateId: z.string().min(1),
  nowMs: z.number().int().positive().default(() => Date.now()),
  leaseDurationMs: z.number().int().positive().optional(),
});

const globalCoordinator = new CloudSchedulerCoordinator();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = LeaseRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lease request', details: parsed.error.format() },
        { status: 400 },
      );
    }

    const result = globalCoordinator.acquireTickLease(parsed.data);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      lease: result.data,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
