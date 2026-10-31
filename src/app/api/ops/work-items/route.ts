import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperationsUser } from './auth';
import { isActionKind, parseActionPayload } from '@/ee/ops/action-executors';

const Department = z.enum(['finance', 'operations', 'marketing', 'sales', 'support']);
const Status = z.enum(['open', 'in_progress', 'done', 'cancelled']);
type ApprovalStateValue = 'none' | 'draft' | 'pending_approval' | 'approved' | 'rejected';
const DueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
// Action payloads are typed: outbound_message carries channel+message; record_only carries nothing
// meaningful. Callers can never set approval/execution state — action items are created DRAFT-ONLY
// (the draft-connector contract: anything an agent prepares lands here and waits for a human).
const ActionSchema = z.object({
  type: z.enum(['outbound_message', 'record_only']),
  payload: z.unknown().optional(),
}).strict();
const CreateSchema = z.object({
  department: Department,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(''),
  amountMinor: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
  dueDate: DueDate.nullable().optional(),
  action: ActionSchema.nullable().optional(),
}).strict();

type WorkItemRow = {
  id: string; owner_user_id: string; department: z.infer<typeof Department>; title: string;
  description: string; status: z.infer<typeof Status>; amount_minor: number | null;
  due_date: string | null; created_at: number; updated_at: number; version: number;
  action_type: string | null; action_payload_json: string | null;
  approval_state: ApprovalStateValue; submitted_at_ms: number | null;
  approved_by: string | null; approved_at_ms: number | null; decision_reason: string | null;
  execution_state: 'executed' | 'failed' | null; executed_at_ms: number | null; execution_result: string | null;
};

function validateAction(action: { type: string; payload?: unknown } | null | undefined): { ok: boolean; error?: string } {
  if (!action) return { ok: true };
  if (!isActionKind(action.type)) return { ok: false, error: 'Invalid work item' };
  const payloadCheck = parseActionPayload(action.type, action.payload ?? {});
  return payloadCheck.ok ? { ok: true } : { ok: false, error: 'Invalid action payload' };
}

export async function GET(request: Request) {
  const auth = await requireOperationsUser(request);
  if (auth.response) return auth.response;
  const params = new URL(request.url).searchParams;
  const rawDepartment = params.get('department');
  const rawStatus = params.get('status');
  const department = rawDepartment ? Department.safeParse(rawDepartment) : null;
  const status = rawStatus ? Status.safeParse(rawStatus) : null;
  if ((department && !department.success) || (status && !status.success)) {
    return NextResponse.json({ ok: false, error: 'Invalid filter' }, { status: 400 });
  }
  const overdue = params.get('overdue');
  if (overdue !== null && overdue !== 'true' && overdue !== 'false') {
    return NextResponse.json({ ok: false, error: 'Invalid overdue filter' }, { status: 400 });
  }
  try {
    const clauses = ['owner_user_id = ?'];
    const values: unknown[] = [auth.userId];
    if (department?.success) { clauses.push('department = ?'); values.push(department.data); }
    if (status?.success) { clauses.push('status = ?'); values.push(status.data); }
    if (overdue === 'true') {
      clauses.push("due_date < ? AND status NOT IN ('done', 'cancelled')");
      values.push(new Date().toISOString().slice(0, 10));
    }
    const { results } = await auth.db.prepare(
      `SELECT * FROM ops_work_items WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT 200`,
    ).bind(...values).all<WorkItemRow>();
    return NextResponse.json({ ok: true, items: results.map(toClientItem) });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not load operations records' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOperationsUser(request);
  if (auth.response) return auth.response;
  const input = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ ok: false, error: 'Invalid work item' }, { status: 400 });
  const actionCheck = validateAction(input.data.action);
  if (!actionCheck.ok) return NextResponse.json({ ok: false, error: actionCheck.error }, { status: 400 });
  const now = Date.now();
  const id = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const actionType = input.data.action?.type ?? null;
  const actionPayloadJson = input.data.action ? JSON.stringify(input.data.action.payload ?? {}) : null;
  // Draft-only enforcement: action items always enter the approval queue as 'draft'; callers can
  // never set approval/execution state (CreateSchema is strict and rejects such fields outright).
  const approvalState = actionType ? 'draft' : 'none';
  try {
    await auth.db.batch([
      auth.db.prepare('INSERT INTO ops_work_items (id, owner_user_id, department, title, description, status, amount_minor, due_date, created_at, updated_at, action_type, action_payload_json, approval_state) VALUES (?, ?, ?, ?, ?, \'open\', ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, auth.userId, input.data.department, input.data.title, input.data.description, input.data.amountMinor ?? null, input.data.dueDate ?? null, now, now, actionType, actionPayloadJson, approvalState),
      auth.db.prepare('INSERT INTO ops_work_item_events (id, item_id, owner_user_id, action, from_status, to_status, created_at, item_version) VALUES (?, ?, ?, \'created\', NULL, \'open\', ?, 0)')
        .bind(eventId, id, auth.userId, now),
    ]);
    return NextResponse.json({ ok: true, item: {
      id, department: input.data.department, title: input.data.title, description: input.data.description,
      status: 'open', amountMinor: input.data.amountMinor ?? null, dueDate: input.data.dueDate ?? null,
      createdAt: now, updatedAt: now, version: 0,
      actionType, approvalState, executionState: null,
    } }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not save operations record' }, { status: 503 });
  }
}

function toClientItem(row: WorkItemRow) {
  return {
    id: row.id, department: row.department, title: row.title, description: row.description,
    status: row.status, amountMinor: row.amount_minor, dueDate: row.due_date,
    createdAt: row.created_at, updatedAt: row.updated_at, version: row.version,
    actionType: row.action_type, approvalState: row.approval_state,
    executionState: row.execution_state, decisionReason: row.decision_reason,
  };
}
