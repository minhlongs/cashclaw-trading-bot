import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperationsUser } from '../auth';
import { planApprovalAction, type ApprovalItemSnapshot, type ApprovalState, type ExecutionState } from '../approval-machine';
import { executeAction } from '@/ee/ops/action-executors';
import { createSendersFromEnv } from '@/ee/alerts/alert-channel-senders';

// POST /api/ops/work-items/approvals — approved-execution transitions for action-bearing items.
// Single ({itemId}) or batch ({itemIds}); each item transitions independently and reports its own
// outcome. The audit INSERT performs the state change atomically (migration 0018 trigger, CAS on
// prior state + optimistic version), so a stale/concurrent transition aborts with nothing written.

const BodySchema = z.object({
  action: z.enum(['submit', 'approve', 'reject', 'execute']),
  itemId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  itemIds: z.array(z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)).min(1).max(50).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict().refine((value) => Boolean(value.itemId) !== Boolean(value.itemIds), {
  message: 'Provide exactly one of itemId or itemIds',
});

type ItemRow = {
  id: string; owner_user_id: string; action_type: string | null; action_payload_json: string | null;
  approval_state: ApprovalState; execution_state: ExecutionState | null; version: number;
};

type ItemResult = {
  itemId: string; ok: boolean; version?: number; state?: string; executionState?: string | null;
  code?: string; error?: string;
};

export async function POST(request: Request) {
  const auth = await requireOperationsUser(request);
  if (auth.response) return auth.response;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid approval request' }, { status: 400 });
  const itemIds = parsed.data.itemIds ?? [parsed.data.itemId as string];
  const results: ItemResult[] = [];
  for (const itemId of itemIds) {
    results.push(await applyOne(auth, parsed.data.action, itemId, parsed.data.reason ?? null));
  }
  return NextResponse.json({ ok: true, results });
}

async function applyOne(
  auth: { db: import('@/lib/db/types').D1Database; userId: string },
  action: 'submit' | 'approve' | 'reject' | 'execute',
  itemId: string,
  reason: string | null,
): Promise<ItemResult> {
  try {
    const row = await auth.db.prepare(
      'SELECT * FROM ops_work_items WHERE id = ? AND owner_user_id = ?',
    ).bind(itemId, auth.userId).first<ItemRow>();
    if (!row) return { itemId, ok: false, code: 'not-found', error: 'Record not found' };
    const snapshot: ApprovalItemSnapshot = {
      id: row.id,
      ownerUserId: row.owner_user_id,
      actionType: row.action_type,
      approvalState: row.approval_state,
      executionState: row.execution_state,
      version: row.version,
    };
    const plan = planApprovalAction(action, snapshot, reason);
    if (!plan.ok) return { itemId, ok: false, code: plan.code, error: plan.error };

    let transition = plan.transition;
    if (action === 'execute') {
      // External effect first (at-least-once; documented), then the audited state change. The
      // outcome decides whether the audit lands 'executed' or 'failed' — both are recorded.
      const payload = row.action_payload_json ? (JSON.parse(row.action_payload_json) as unknown) : {};
      const outcome = await executeAction({
        itemId: row.id,
        actionType: row.action_type ?? 'record_only',
        payload,
        senders: createSendersFromEnv(process.env as Record<string, string | undefined>),
      });
      transition = {
        ...transition,
        toState: outcome.ok ? 'executed' : 'failed',
        reason: outcome.providerRef ? `${outcome.detail} (${outcome.providerRef})` : outcome.detail,
      };
    }

    const now = Date.now();
    await auth.db.prepare(
      `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(itemId, auth.userId, auth.userId, transition.fromState, transition.toState, transition.reason, transition.itemVersion, now).run();

    const updated = await auth.db.prepare(
      'SELECT version, approval_state, execution_state FROM ops_work_items WHERE id = ? AND owner_user_id = ?',
    ).bind(itemId, auth.userId).first<{ version: number; approval_state: ApprovalState; execution_state: ExecutionState | null }>();
    return {
      itemId, ok: true, version: updated?.version,
      state: updated?.approval_state, executionState: updated?.execution_state,
    };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (/approval transition did not land/i.test(message)) {
      return { itemId, ok: false, code: 'concurrent-change', error: 'Record changed concurrently; refresh and retry' };
    }
    if (/ops approval events are append-only/i.test(message)) {
      return { itemId, ok: false, code: 'concurrent-change', error: 'Record changed concurrently; refresh and retry' };
    }
    return { itemId, ok: false, code: 'storage-error', error: 'Could not update operations record' };
  }
}
