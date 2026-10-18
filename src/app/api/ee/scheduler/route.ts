import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultCloudSchedulerCoordinator } from '@/ee/scheduler/cloud-scheduler-coordinator';

const LeaseRequestSchema = z.object({
  botId: z.string().min(1),
  workspaceId: z.string().min(1),
  isolateId: z.string().min(1),
  nowMs: z.number().int().positive().default(() => Date.now()),
  leaseDurationMs: z.number().int().positive().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawNow = url.searchParams.get('nowMs');
  const workspaceId = url.searchParams.get('workspaceId')?.trim() || undefined;
  const parsedNow = rawNow ? Number(rawNow) : Date.now();
  const nowMs = Number.isFinite(parsedNow) && parsedNow > 0 ? parsedNow : Date.now();

  return NextResponse.json({
    ok: true,
    nowMs,
    ...(workspaceId ? { workspaceId } : {}),
    activeLeaseCount: defaultCloudSchedulerCoordinator.activeLeaseCount(nowMs, workspaceId),
  });
}

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

    const result = defaultCloudSchedulerCoordinator.acquireTickLease(parsed.data);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, lease: result.data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
