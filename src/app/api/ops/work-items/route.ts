import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/db/client';

const Department = z.enum(['finance', 'operations', 'marketing', 'sales', 'support']);
const DueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
const CreateSchema = z.object({
  department: Department,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(''),
  amountMinor: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
  dueDate: DueDate.nullable().optional(),
}).strict();

type WorkItemRow = {
  id: string;
  owner_user_id: string;
  department: z.infer<typeof Department>;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  amount_minor: number | null;
  due_date: string | null;
  created_at: number;
  updated_at: number;
};

function ownerId(req: Request): string | null {
  const id = req.headers.get('x-user-id');
  return id && id.length <= 128 ? id : null;
}

export async function GET(req: Request) {
  const userId = ownerId(req);
  if (!userId) return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  const db = createServerClient();
  if (!db) return NextResponse.json({ ok: false, error: 'Persistent database unavailable' }, { status: 503 });
  try {
    const departmentValue = new URL(req.url).searchParams.get('department');
    const department = departmentValue ? Department.safeParse(departmentValue) : null;
    if (department && !department.success) return NextResponse.json({ ok: false, error: 'Invalid department' }, { status: 400 });
    const query = department?.success
      ? db.prepare('SELECT * FROM ops_work_items WHERE owner_user_id = ? AND department = ? ORDER BY updated_at DESC LIMIT 200').bind(userId, department.data)
      : db.prepare('SELECT * FROM ops_work_items WHERE owner_user_id = ? ORDER BY updated_at DESC LIMIT 200').bind(userId);
    const { results } = await query.all<WorkItemRow>();
    return NextResponse.json({ ok: true, items: results.map(toClientItem) });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not load operations records' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const userId = ownerId(req);
  if (!userId) return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  const db = createServerClient();
  if (!db) return NextResponse.json({ ok: false, error: 'Persistent database unavailable' }, { status: 503 });
  const input = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ ok: false, error: 'Invalid work item' }, { status: 400 });
  const now = Date.now();
  const id = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare('INSERT INTO ops_work_items (id, owner_user_id, department, title, description, status, amount_minor, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'open\', ?, ?, ?, ?)')
        .bind(id, userId, input.data.department, input.data.title, input.data.description, input.data.amountMinor ?? null, input.data.dueDate ?? null, now, now),
      db.prepare('INSERT INTO ops_work_item_events (id, item_id, owner_user_id, action, from_status, to_status, created_at) VALUES (?, ?, ?, \'created\', NULL, \'open\', ?)')
        .bind(eventId, id, userId, now),
    ]);
    return NextResponse.json({ ok: true, item: {
      id, department: input.data.department, title: input.data.title, description: input.data.description,
      status: 'open', amountMinor: input.data.amountMinor ?? null, dueDate: input.data.dueDate ?? null,
      createdAt: now, updatedAt: now,
    } }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not save operations record' }, { status: 503 });
  }
}

function toClientItem(row: WorkItemRow) {
  return {
    id: row.id, department: row.department, title: row.title, description: row.description,
    status: row.status, amountMinor: row.amount_minor, dueDate: row.due_date,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
