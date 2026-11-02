// Execution runner: one place that sequences claim → post-claim re-check → send → outcome record
// → summary/audit. Used by the approvals route (manual execute) and the cron retry drain (auto
// retry within the approved budget — the owner accepted possible duplicate messages).

import type { D1Database } from '@/lib/db/types';
import type { AlertSenders } from '../alerts/alert-channel-senders';
import {
  claimAttempt, checkExecutionEligibility, executeAction, finalizeAttempt,
  markStaleInFlightUnknown, summarizeAttempt, verifyApprovedSnapshot, isRetryableOutcome, backoffMsFor,
  policyOf, type AttemptOutcome, type ExecutionItemRow,
} from './action-execution';

export type { ExecutionItemRow };

export interface RunAttemptResult {
  itemId: string;
  ok: boolean;
  code?: string;
  error?: string;
  attemptNo?: number;
  outcome?: AttemptOutcome;
  detail?: string;
  state?: string;
  executionState?: 'executed' | 'failed' | null;
  version?: number;
}

const WORKER_ID = `ops-runner-${Math.random().toString(36).slice(2, 10)}`;

export async function loadExecutionItem(db: D1Database, itemId: string, ownerUserId: string): Promise<ExecutionItemRow | null> {
  return db.prepare(`SELECT * FROM ops_work_items WHERE id = ? AND owner_user_id = ?`)
    .bind(itemId, ownerUserId).first<ExecutionItemRow>();
}

// Post-claim gate: re-check approval state after the claim (revocation/expiry/snapshot drift may
// have landed mid-flight) — long awaits never skip the final gate before a side effect.
async function postClaimGate(db: D1Database, fresh: ExecutionItemRow, senders: AlertSenders, nowMs: number): Promise<{ ok: true } | { ok: false; code: string; reason: string }> {
  const snapshotCheck = await verifyApprovedSnapshot(fresh, senders);
  if (fresh.revoked_at_ms !== null) return { ok: false, code: 'revoked', reason: 'approval revoked after claim' };
  if (fresh.approval_expires_at_ms !== null && fresh.approval_expires_at_ms <= nowMs) return { ok: false, code: 'expired', reason: 'approval expired after claim' };
  if (!snapshotCheck.ok) return { ok: false, code: snapshotCheck.code!, reason: snapshotCheck.error! };
  return { ok: true };
}

// Delivery summary + retry scheduling. The audit INSERT performs the summary transition atomically
// (0018/0019 trigger contract: one statement = one state change).
async function recordSummary(db: D1Database, fresh: ExecutionItemRow, input: {
  attemptNo: number; attemptOutcome: AttemptOutcome; detail: string; attemptCount: number;
  retryAfterMs?: number; claimedBy: string;
}): Promise<{ summary: 'executed' | 'failed' | null; nextAttemptAtMs: number | null; after: ExecutionItemRow | null }> {
  const policy = policyOf(fresh);
  const summary = summarizeAttempt(input.attemptOutcome);
  let nextAttemptAtMs: number | null = null;
  if (summary === 'failed' && isRetryableOutcome(input.attemptOutcome) && input.attemptCount < policy.maxAttempts) {
    const backoff = Math.max(backoffMsFor(policy, input.attemptNo), input.retryAfterMs ?? 0);
    nextAttemptAtMs = Date.now() + backoff;
  }
  await db.prepare(`UPDATE ops_work_items SET next_attempt_at_ms = ? WHERE id = ?`)
    .bind(nextAttemptAtMs, fresh.id).run();
  if (summary === null) return { summary, nextAttemptAtMs, after: null };
  await db.prepare(
    `INSERT INTO ops_approval_events (item_id, owner_user_id, actor, from_state, to_state, reason, item_version, created_at_ms)
     VALUES (?, ?, ?, 'approved', ?, ?, ?, ?)`,
  ).bind(fresh.id, fresh.owner_user_id, input.claimedBy, summary, `${input.attemptOutcome}: ${input.detail}`.slice(0, 500), fresh.version, Date.now()).run();
  return { summary, nextAttemptAtMs, after: await loadExecutionItem(db, fresh.id, fresh.owner_user_id) };
}

export async function runApprovedAttempt(input: {
  db: D1Database;
  item: ExecutionItemRow;
  senders: AlertSenders;
  nowMs: number;
  claimedBy?: string;
}): Promise<RunAttemptResult> {
  const { db, item, senders } = input;
  const nowMs = input.nowMs;
  const claimedBy = input.claimedBy ?? WORKER_ID;
  await markStaleInFlightUnknown(db, item, nowMs);
  const attemptCountRow = await db.prepare(`SELECT COUNT(*) AS n FROM ops_action_attempts WHERE item_id = ?`)
    .bind(item.id).first<{ n: number }>();
  const attemptCount = attemptCountRow?.n ?? 0;
  const eligibility = await checkExecutionEligibility(item, nowMs, attemptCount);
  if (!eligibility.ok) return { itemId: item.id, ok: false, code: eligibility.code, error: eligibility.error };

  // The claim INSERT is the atomic attempt consumption — before any external effect.
  const claim = await claimAttempt(db, {
    item,
    attemptNo: eligibility.attemptNo,
    claimedBy,
    timeoutMs: eligibility.policy.requestTimeoutMs,
    scheduledForMs: eligibility.scheduledForMs,
    nowMs,
  });
  if (!claim.ok) return { itemId: item.id, ok: false, code: claim.code, error: claim.error };

  const fresh = await loadExecutionItem(db, item.id, item.owner_user_id);
  const gate = fresh ? await postClaimGate(db, fresh, senders, nowMs) : { ok: false as const, code: 'not-found', reason: 'Record not found' };
  if (!gate.ok) {
    await finalizeAttempt(db, { attemptId: claim.attemptId!, outcome: 'discarded', detail: gate.reason, nowMs: Date.now() });
    return { itemId: item.id, ok: false, code: gate.code, error: gate.reason };
  }

  const payload = fresh!.action_payload_json ? (JSON.parse(fresh!.action_payload_json) as unknown) : {};
  const outcome = await executeAction({
    itemId: fresh!.id,
    actionType: fresh!.action_type ?? 'record_only',
    payload,
    senders,
    timeoutMs: eligibility.policy.requestTimeoutMs,
  });
  const attemptOutcome: AttemptOutcome = outcome.kind === 'recorded' ? 'provider_accepted' : outcome.kind;
  await finalizeAttempt(db, {
    attemptId: claim.attemptId!, outcome: attemptOutcome, detail: outcome.detail,
    providerRef: outcome.providerRef, httpStatus: outcome.httpStatus, nowMs: Date.now(),
  });

  const recorded = await recordSummary(db, fresh!, {
    attemptNo: eligibility.attemptNo, attemptOutcome, detail: outcome.detail,
    attemptCount: attemptCount + 1, retryAfterMs: outcome.retryAfterMs, claimedBy,
  });
  if (recorded.summary === null) {
    return { itemId: item.id, ok: false, code: 'discarded', error: outcome.detail, attemptNo: eligibility.attemptNo, outcome: attemptOutcome };
  }
  return {
    itemId: item.id, ok: recorded.summary === 'executed', attemptNo: eligibility.attemptNo, outcome: attemptOutcome,
    detail: outcome.detail, state: recorded.after?.approval_state,
    executionState: recorded.after?.execution_state ?? recorded.summary, version: recorded.after?.version,
  };
}

// Auto-retry drain for the cron handler: picks up approved items whose next_attempt_at_ms is due,
// strictly within the approved attempt budget. Missed ticks are NOT backfilled — only due items at
// drain time run; a backlog of past-due items is processed one attempt each per drain (no burst).
export async function drainDueActionRetries(input: {
  db: D1Database;
  senders: AlertSenders;
  nowMs: number;
  limit?: number;
  claimedBy?: string;
}): Promise<RunAttemptResult[]> {
  const { results } = await input.db.prepare(
    `SELECT * FROM ops_work_items
     WHERE approval_state = 'approved' AND revoked_at_ms IS NULL AND action_type IS NOT NULL
       AND (execution_state IS NULL OR execution_state = 'failed')
       AND next_attempt_at_ms IS NOT NULL AND next_attempt_at_ms <= ?
     ORDER BY next_attempt_at_ms ASC LIMIT ?`,
  ).bind(input.nowMs, input.limit ?? 5).all<ExecutionItemRow>();
  const outcomes: RunAttemptResult[] = [];
  for (const item of results) {
    try {
      outcomes.push(await runApprovedAttempt({ db: input.db, item, senders: input.senders, nowMs: input.nowMs, claimedBy: input.claimedBy }));
    } catch (error) {
      outcomes.push({ itemId: item.id, ok: false, code: 'storage-error', error: String(error instanceof Error ? error.message : error).slice(0, 200) });
    }
  }
  return outcomes;
}
