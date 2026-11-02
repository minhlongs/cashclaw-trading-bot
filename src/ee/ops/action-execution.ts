// Approved outbound_message execution with per-message retry policy.
// Separation of concerns (do not conflate):
//   approval lifecycle — approval_state on the item (approve/reject/revoke via ops_approval_events)
//   execution attempts — ops_action_attempts rows; the INSERT is the atomic attempt consumption
//   delivery outcome   — attempts.outcome + the item's execution_state summary
// Every send consumes an attempt BEFORE any external effect (claim INSERT with UNIQUE(item_id,
// attempt_no)), so two workers can never share one attempt and a crash cannot erase history.

import type { D1Database } from '@/lib/db/types';
import { executeAction, resolveActionTargetDescriptor } from './action-executors';
import { backoffMsFor, computeApprovedSha256, validateRetryPolicy, type RetryPolicy } from './approved-snapshot';
import type { AlertSenders } from '../alerts/alert-channel-senders';

export type AttemptOutcome = 'provider_accepted' | 'failed_retryable' | 'failed_terminal' | 'unknown' | 'discarded';

export interface ExecutionItemRow {
  id: string; owner_user_id: string; action_type: string | null; action_payload_json: string | null;
  approval_state: string; execution_state: 'executed' | 'failed' | null;
  approved_sha256: string | null; approved_target: string | null;
  approval_expires_at_ms: number | null; revoked_at_ms: number | null; version: number;
  max_attempts: number; request_timeout_ms: number; backoff_base_ms: number;
  backoff_max_ms: number; approval_ttl_ms: number; next_attempt_at_ms: number | null;
}

export type Eligibility =
  | { ok: true; attemptNo: number; policy: RetryPolicy; scheduledForMs: number }
  | { ok: false; code: string; error: string };

function policyOf(row: ExecutionItemRow): RetryPolicy {
  return {
    maxAttempts: row.max_attempts,
    requestTimeoutMs: row.request_timeout_ms,
    backoffBaseMs: row.backoff_base_ms,
    backoffMaxMs: row.backoff_max_ms,
    approvalTtlMs: row.approval_ttl_ms,
  };
}

export async function checkExecutionEligibility(row: ExecutionItemRow, nowMs: number, attemptCount: number): Promise<Eligibility> {
  if (!row.action_type) return { ok: false, code: 'not-actionable', error: 'Only action items can be executed' };
  if (row.approval_state !== 'approved') return { ok: false, code: 'not-approved', error: `Cannot execute from state ${row.approval_state}` };
  if (row.revoked_at_ms !== null) return { ok: false, code: 'revoked', error: 'Approval was revoked' };
  if (row.approval_expires_at_ms !== null && row.approval_expires_at_ms <= nowMs) {
    return { ok: false, code: 'expired', error: 'Approval has expired' };
  }
  if (row.execution_state === 'executed') return { ok: false, code: 'already-executed', error: 'Action was already executed' };
  const policy = validateRetryPolicy(policyOf(row));
  if (!policy.ok) return { ok: false, code: 'policy-missing', error: `Execution blocked: ${policy.error}` };
  if (!row.approved_sha256 || !row.approved_target) {
    return { ok: false, code: 'policy-missing', error: 'Execution blocked: approval has no immutable snapshot (re-approval required)' };
  }
  if (attemptCount >= policy.policy.maxAttempts) {
    return { ok: false, code: 'exhausted', error: `Attempt budget exhausted (${attemptCount}/${policy.policy.maxAttempts})` };
  }
  return { ok: true, attemptNo: attemptCount + 1, policy: policy.policy, scheduledForMs: nowMs };
}

export interface ClaimResult {
  ok: boolean;
  code?: string;
  error?: string;
  attemptId?: number;
  attemptNo?: number;
}

// Atomic attempt consumption: the INSERT is the claim. UNIQUE(item_id, attempt_no) elects exactly
// one winner; the loser gets a constraint error and never sends. Attempts are never deleted, so a
// restart cannot reset the counter (attempt numbers continue from history).
export async function claimAttempt(db: D1Database, input: {
  item: ExecutionItemRow;
  attemptNo: number;
  claimedBy: string;
  timeoutMs: number;
  scheduledForMs: number;
  nowMs: number;
}): Promise<ClaimResult> {
  try {
    const inserted = await db.prepare(
      `INSERT INTO ops_action_attempts
         (item_id, owner_user_id, attempt_no, claimed_by, claimed_at_ms, timeout_ms, scheduled_for_ms, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'in_flight')
       RETURNING id`,
    ).bind(input.item.id, input.item.owner_user_id, input.attemptNo, input.claimedBy, input.nowMs, input.timeoutMs, input.scheduledForMs)
      .first<{ id: number }>();
    if (inserted) return { ok: true, attemptId: inserted.id, attemptNo: input.attemptNo };
    return { ok: false, code: 'claim-conflict', error: 'Attempt already claimed' };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    return { ok: false, code: /UNIQUE constraint failed/i.test(message) ? 'claim-conflict' : 'storage-error', error: message.slice(0, 300) };
  }
}

// Record the outcome exactly once (guarded by the immutability trigger: only in_flight rows can
// change). 'discarded' = the claim was invalidated AFTER claim (e.g. revoked mid-flight) and no
// external effect happened.
export async function finalizeAttempt(db: D1Database, input: {
  attemptId: number;
  outcome: AttemptOutcome;
  detail: string;
  providerRef?: string;
  httpStatus?: number;
  nowMs: number;
}): Promise<boolean> {
  const updated = await db.prepare(
    `UPDATE ops_action_attempts
     SET outcome = ?, outcome_detail = ?, provider_ref = ?, http_status = ?, finished_at_ms = ?
     WHERE id = ? AND outcome = 'in_flight'
     RETURNING id`,
  ).bind(input.outcome, input.detail.slice(0, 500), input.providerRef ?? null, input.httpStatus ?? null, input.nowMs, input.attemptId)
    .first<{ id: number }>();
  return updated !== null;
}

export async function markStaleInFlightUnknown(db: D1Database, item: ExecutionItemRow, nowMs: number): Promise<void> {
  // A claim older than its request timeout (+5s grace) whose process died mid-send is ambiguous:
  // the provider may have received the request. It is recorded as 'unknown', never as success.
  await db.prepare(
    `UPDATE ops_action_attempts
     SET outcome = 'unknown', outcome_detail = 'stale in_flight claim (process died or clock skew); delivery ambiguous', finished_at_ms = ?
     WHERE item_id = ? AND outcome = 'in_flight' AND claimed_at_ms + timeout_ms + 5000 < ?
     RETURNING id`,
  ).bind(nowMs, item.id, nowMs).first<{ id: number }>();
}

export async function computeNextAttemptNo(db: D1Database, itemId: string): Promise<number> {
  const row = await db.prepare(`SELECT MAX(attempt_no) AS n FROM ops_action_attempts WHERE item_id = ?`)
    .bind(itemId).first<{ n: number | null }>();
  return (row?.n ?? 0) + 1;
}

export async function verifyApprovedSnapshot(row: ExecutionItemRow, senders: AlertSenders): Promise<{ ok: boolean; code?: string; error?: string }> {
  if (!row.action_type || !row.approved_sha256 || !row.approved_target) {
    return { ok: false, code: 'policy-missing', error: 'Execution blocked: approval has no immutable snapshot (re-approval required)' };
  }
  const payload = row.action_payload_json ? (JSON.parse(row.action_payload_json) as unknown) : null;
  const target = resolveActionTargetDescriptor(row.action_type, payload, senders);
  if (!target) return { ok: false, code: 'target-changed', error: 'Execution blocked: channel not configured for the approved target' };
  if (target !== row.approved_target) {
    return { ok: false, code: 'target-changed', error: 'Execution blocked: configured target differs from the approved target (re-approval required)' };
  }
  const current = await computeApprovedSha256({ actionType: row.action_type, payload, target, policy: policyOf(row) });
  if (current !== row.approved_sha256) {
    return { ok: false, code: 'snapshot-mismatch', error: 'Execution blocked: payload/policy changed after approval (re-approval required)' };
  }
  return { ok: true };
}

export function summarizeAttempt(outcome: AttemptOutcome): 'executed' | 'failed' | null {
  return outcome === 'provider_accepted' ? 'executed' : outcome === 'discarded' ? null : 'failed';
}

export function isRetryableOutcome(outcome: AttemptOutcome): boolean {
  return outcome === 'failed_retryable' || outcome === 'unknown';
}

export { executeAction, backoffMsFor, policyOf };
export type { RetryPolicy };
