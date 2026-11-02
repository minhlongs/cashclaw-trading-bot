import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperationsUser } from '../auth';
import { planApprovalAction, type ApprovalItemSnapshot, type ApprovalState, type ExecutionState } from '../approval-machine';
import { computeApprovedSha256, validateRetryPolicy, type RetryPolicy } from '@/ee/ops/approved-snapshot';
import { resolveActionTargetDescriptor } from '@/ee/ops/action-executors';
import { runApprovedAttempt, loadExecutionItem, type ExecutionItemRow } from '@/ee/ops/action-execution-runner';
import { createSendersFromEnv } from '@/ee/alerts/alert-channel-senders';

// POST /api/ops/work-items/approvals — approval lifecycle + approved execution.
// Single ({itemId}) or batch ({itemIds}); each item transitions independently. Approval stamps an
// immutable SHA-256 snapshot (action type + payload + resolved target + retry policy); any later
// change requires re-approval. Execute runs ONE attempt through the atomic claim machinery.

const Id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const BodySchema = z.object({
  action: z.enum(['submit', 'approve', 'reject', 'execute', 'revoke']),
  itemId: Id.optional(),
  itemIds: z.array(Id).min(1).max(50).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict().refine((value) => Boolean(value.itemId) !== Boolean(value.itemIds), {
  message: 'Provide exactly one of itemId or itemIds',
});

type ItemRow = ExecutionItemRow & {
  action_payload_json: string | null;
  max_attempts: number; request_timeout_ms: number; backoff_base_ms: number;
  backoff_max_ms: number; approval_ttl_ms: number;
};

type ItemResult = {
  itemId: string; ok: boolean; version?: number; state?: string; executionState?: string | null;
  attemptNo?: number; outcome?: string; code?: string; error?: string;
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

function policyOfRow(row: ItemRow): RetryPolicy {
  return {
    maxAttempts: row.max_attempts,
    requestTimeoutMs: row.request_timeout_ms,
    backoffBaseMs: row.backoff_base_ms,
    backoffMaxMs: row.backoff_max_ms,
    approvalTtlMs: row.approval_ttl_ms,
  };
}

async function applyOne(
  auth: { db: import('@/lib/db/types').D1Database; userId: string },
  action: 'submit' | 'approve' | 'reject' | 'execute' | 'revoke',
  itemId: string,
  reason: string | null,
): Promise<ItemResult> {
  try {
    const row = await loadExecutionItem(auth.db, itemId, auth.userId) as ItemRow | null;
    if (!row) return { itemId, ok: false, code: 'not-found', error: 'Record not found' };
    const snapshot: ApprovalItemSnapshot = {
      id: row.id,
      ownerUserId: row.owner_user_id,
      actionType: row.action_type,
      approvalState: row.approval_state as ApprovalState,
      executionState: row.execution_state as ExecutionState | null,
      version: row.version,
    };
    const plan = planApprovalAction(action, snapshot, reason);
    if (!plan.ok) return { itemId, ok: false, code: plan.code, error: plan.error };

    if (action === 'execute') {
      const senders = createSendersFromEnv(process.env as Record<string, string | undefined>);
      const outcome = await runApprovedAttempt({ db: auth.db, item: row, senders, nowMs: Date.now(), claimedBy: auth.userId });
      return {
        itemId, ok: outcome.ok, code: outcome.code, error: outcome.error,
        attemptNo: outcome.attemptNo, outcome: outcome.outcome,
        state: outcome.state, executionState: outcome.executionState, version: outcome.version,
      };
    }

    const transition = plan.transition;
    let approvedSha256: string | null = null;
    let approvedTarget: string | null = null;
    if (action === 'approve') {
      // Approval freezes the snapshot: payload, resolved target descriptor and retry policy.
      // Policy is validated at creation; a missing/invalid policy must never reach approval.
      const policyCheck = validateRetryPolicy(policyOfRow(row));
      if (!policyCheck.ok) return { itemId, ok: false, code: 'policy-missing', error: `Approval blocked: ${policyCheck.error}` };
      const payload = row.action_payload_json ? (JSON.parse(row.action_payload_json) as unknown) : null;
      const senders = createSendersFromEnv(process.env as Record<string, string | undefined>);
      const target = resolveActionTargetDescriptor(row.action_type ?? 'record_only', payload, senders);
      if (!target) return { itemId, ok: false, code: 'target-unconfigured', error: 'Approval blocked: no configured channel resolves the approved target' };
      approvedTarget = target;
      approvedSha256 = await computeApprovedSha256({ actionType: row.action_type!, payload, target, policy: policyCheck.policy });
    }

    const now = Date.now();
    await auth.db.prepare(
      `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms, approved_sha256, approved_target)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(itemId, auth.userId, auth.userId, transition.fromState, transition.toState, transition.reason, transition.itemVersion, now, approvedSha256, approvedTarget).run();

    const updated = await loadExecutionItem(auth.db, itemId, auth.userId);
    return {
      itemId, ok: true, version: updated?.version,
      state: updated?.approval_state, executionState: updated?.execution_state,
    };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (/approval transition did not land/i.test(message) || /ops approval events are append-only/i.test(message)) {
      return { itemId, ok: false, code: 'concurrent-change', error: 'Record changed concurrently; refresh and retry' };
    }
    return { itemId, ok: false, code: 'storage-error', error: 'Could not update operations record' };
  }
}
