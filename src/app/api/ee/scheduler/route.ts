import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultCloudSchedulerCoordinator } from '@/ee/scheduler/cloud-scheduler-coordinator';
import {
  resolveEffectiveWorkspaceId,
  resolveWorkspaceTierContext,
} from '@/ee/tenancy/workspace-request-context';

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
  const queryWorkspaceId = url.searchParams.get('workspaceId')?.trim() || undefined;
  const parsedNow = rawNow ? Number(rawNow) : Date.now();
  const nowMs = Number.isFinite(parsedNow) && parsedNow > 0 ? parsedNow : Date.now();

  const { workspaceId: resolvedWorkspaceId } = await resolveWorkspaceTierContext(req, {
    explicitWorkspaceId: queryWorkspaceId,
  });
  const effectiveWorkspaceId = resolveEffectiveWorkspaceId(
    req,
    resolvedWorkspaceId,
    queryWorkspaceId,
  );

  return NextResponse.json({
    ok: true,
    nowMs,
    ...(effectiveWorkspaceId ? { workspaceId: effectiveWorkspaceId } : {}),
    activeLeaseCount: defaultCloudSchedulerCoordinator.activeLeaseCount(
      nowMs,
      effectiveWorkspaceId,
    ),
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

    const { workspaceId: resolvedWorkspaceId } = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: parsed.data.workspaceId,
    });
    const effectiveWorkspaceId =
      resolveEffectiveWorkspaceId(req, resolvedWorkspaceId, parsed.data.workspaceId) ??
      parsed.data.workspaceId;

    const result = defaultCloudSchedulerCoordinator.acquireTickLease({
      ...parsed.data,
      workspaceId: effectiveWorkspaceId,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, lease: result.data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
