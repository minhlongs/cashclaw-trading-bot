import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/client';

const Status = z.enum(['open', 'in_progress', 'done', 'cancelled']);
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: RouteContext) {
  const userId = req.headers.get('x-user-id');
  if (!userId || userId.length > 128) return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  const { id } = await context.params;
  if (!id || id.length > 64) return NextResponse.json({ ok: false, error: 'Invalid item id' }, { status: 400 });
  const parsed = z.object({ status: Status }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });
  const db = createServerClient();
  if (!db) return NextResponse.json({ ok: false, error: 'Persistent database unavailable' }, { status: 503 });
  try {
    const current = await db.prepare('SELECT status FROM ops_work_items WHERE id = ? AND owner_user_id = ?')
      .bind(id, userId).first<{ status: z.infer<typeof Status> }>();
    if (!current) return NextResponse.json({ ok: false, error: 'Record not found' }, { status: 404 });
    if (current.status === parsed.data.status) return NextResponse.json({ ok: true, unchanged: true });
    if (current.status === 'done' || current.status === 'cancelled') {
      return NextResponse.json({ ok: false, error: 'Closed records cannot be reopened' }, { status: 409 });
    }
    const now = Date.now();
    const eventId = crypto.randomUUID();
    const [updateResult] = await db.batch([
      db.prepare('UPDATE ops_work_items SET status = ?, updated_at = ? WHERE id = ? AND owner_user_id = ? AND status = ?')
        .bind(parsed.data.status, now, id, userId, current.status),
      db.prepare('INSERT INTO ops_work_item_events (id, item_id, owner_user_id, action, from_status, to_status, created_at) SELECT ?, id, owner_user_id, \'status_changed\', ?, status, ? FROM ops_work_items WHERE id = ? AND owner_user_id = ? AND status = ? AND updated_at = ?')
        .bind(eventId, current.status, now, id, userId, parsed.data.status, now),
    ]) as [{ meta?: { changes?: number } }];
    if (!updateResult?.meta?.changes) return NextResponse.json({ ok: false, error: 'Record changed concurrently; refresh and retry' }, { status: 409 });
    return NextResponse.json({ ok: true, status: parsed.data.status, updatedAt: now });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not update operations record' }, { status: 503 });
  }
}
