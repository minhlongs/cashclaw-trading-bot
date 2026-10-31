import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createD1TickLeaseStore } from '@/ee/scheduler/tick-lease-store';
import { resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';

// Tick leases are acquired through the D1-backed store so duplicate-tick protection holds across
// worker isolates and survives restarts (the in-memory coordinator cannot). Semantics: one lease
// per workspace/bot/minute, takeover of expired leases only, exactly-one-row CAS on takeover.

const LeaseRequestSchema = z.object({
  botId: z.string().min(1).max(128),
  workspaceId: z.string().min(1).max(128).optional(),
  isolateId: z.string().min(1).max(128),
  nowMs: z.number().int().positive().default(() => Date.now()),
  leaseDurationMs: z.number().int().positive().optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawNow = url.searchParams.get('nowMs');
    const parsedNow = rawNow ? Number(rawNow) : Date.now();
    const nowMs = Number.isFinite(parsedNow) && parsedNow > 0 ? parsedNow : Date.now();
    const context = await resolveWorkspaceTierContext(req, {
      explicitWorkspaceId: url.searchParams.get('workspaceId')?.trim() || undefined,
    });
    const store = createD1TickLeaseStore(context.db);
    return NextResponse.json({ ok: true, nowMs, workspaceId: context.workspaceId,
      activeLeaseCount: await store.activeLeaseCount(nowMs, context.workspaceId) });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const parsed = LeaseRequestSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid lease request' }, { status: 400 });
    const context = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: parsed.data.workspaceId });
    if (!['OWNER', 'ADMIN', 'TRADER'].includes(context.role)) {
      return NextResponse.json({ ok: false, error: 'Workspace role cannot schedule bots' }, { status: 403 });
    }
    const bot = await context.db.prepare('SELECT id FROM bots WHERE id = ? AND workspace_id = ?')
      .bind(parsed.data.botId, context.workspaceId).first<{ id: string }>();
    if (!bot) return NextResponse.json({ ok: false, error: 'Bot not found' }, { status: 404 });
    const store = createD1TickLeaseStore(context.db);
    const result = await store.acquireTickLease({ ...parsed.data, workspaceId: context.workspaceId });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, lease: result.data });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}
