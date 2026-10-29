import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperationsUser } from '../auth';

const Status = z.enum(['open', 'in_progress', 'done', 'cancelled']);
const Id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const StatusBody = z.object({ status: Status }).strict();
type RouteContext = { params: Promise<{ id: string }> };
type EventRow = { id: string; action: 'created' | 'status_changed'; from_status: string | null; to_status: string; created_at: number; item_version: number | null };

const TRANSITIONS: Record<z.infer<typeof Status>, readonly z.infer<typeof Status>[]> = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOperationsUser(request);
  if (auth.response) return auth.response;
  const parsedId = Id.safeParse((await context.params).id);
  if (!parsedId.success) return NextResponse.json({ ok: false, error: 'Invalid item id' }, { status: 400 });
  try {
    const { results } = await auth.db.prepare(
      `SELECT e.id, e.action, e.from_status, e.to_status, e.created_at, e.item_version
       FROM ops_work_item_events e JOIN ops_work_items w ON w.id = e.item_id
       WHERE e.item_id = ? AND e.owner_user_id = ? AND w.owner_user_id = ?
       ORDER BY e.created_at ASC, e.id ASC`,
    ).bind(parsedId.data, auth.userId, auth.userId).all<EventRow>();
    const exists = await auth.db.prepare(
      'SELECT id FROM ops_work_items WHERE id = ? AND owner_user_id = ?',
    ).bind(parsedId.data, auth.userId).first<{ id: string }>();
    if (!exists) return NextResponse.json({ ok: false, error: 'Record not found' }, { status: 404 });
    return NextResponse.json({ ok: true, events: results.map((event) => ({
      id: event.id, action: event.action, fromStatus: event.from_status, toStatus: event.to_status,
      createdAt: event.created_at, version: event.item_version,
    })) });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not load operation history' }, { status: 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireOperationsUser(request);
  if (auth.response) return auth.response;
  const parsedId = Id.safeParse((await context.params).id);
  if (!parsedId.success) return NextResponse.json({ ok: false, error: 'Invalid item id' }, { status: 400 });
  const parsedBody = StatusBody.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });

  try {
    const current = await auth.db.prepare(
      'SELECT status, version FROM ops_work_items WHERE id = ? AND owner_user_id = ?',
    ).bind(parsedId.data, auth.userId).first<{ status: z.infer<typeof Status>; version: number }>();
    if (!current) return NextResponse.json({ ok: false, error: 'Record not found' }, { status: 404 });
    if (current.status === parsedBody.data.status) return NextResponse.json({ ok: true, unchanged: true, version: current.version });
    if (!TRANSITIONS[current.status]?.includes(parsedBody.data.status)) {
      return NextResponse.json({ ok: false, error: 'Invalid state transition' }, { status: 409 });
    }
    const now = Date.now();
    const updated = await auth.db.prepare(
      'UPDATE ops_work_items SET status = ?, updated_at = ?, version = version + 1 WHERE id = ? AND owner_user_id = ? AND status = ? AND version = ? RETURNING status, updated_at, version',
    ).bind(parsedBody.data.status, now, parsedId.data, auth.userId, current.status, current.version)
      .first<{ status: z.infer<typeof Status>; updated_at: number; version: number }>();
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Record changed concurrently; refresh and retry' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: updated.status, updatedAt: updated.updated_at, version: updated.version });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not update operations record' }, { status: 503 });
  }
}
