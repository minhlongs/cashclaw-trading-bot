// Pure approval/execution state machine for action-bearing Operations work items.
// Lifecycle: draft -> pending_approval -> approved | rejected; approved -> executed | failed
// (failed executions may be retried). Plain work items (approval_state 'none') never enter this
// machine. The database trigger in migration 0018 enforces the same transitions atomically; this
// module produces the audited transition plan and the human-readable errors.

export type ApprovalState = 'none' | 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type ExecutionState = 'executed' | 'failed';
export type ApprovalAction = 'submit' | 'approve' | 'reject' | 'execute';
export type TransitionToState = 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface ApprovalItemSnapshot {
  readonly id: string;
  readonly ownerUserId: string;
  readonly actionType: string | null;
  readonly approvalState: ApprovalState;
  readonly executionState: ExecutionState | null;
  readonly version: number;
}

export interface ApprovalTransition {
  readonly kind: 'approval' | 'execution';
  readonly fromState: string;
  readonly toState: TransitionToState;
  readonly reason: string | null;
  readonly itemVersion: number;
}

export type ApprovalPlan =
  | { ok: true; transition: ApprovalTransition }
  | { ok: false; code: 'not-actionable' | 'invalid-state-transition' | 'reason-required'; error: string };

const MAX_REASON_LENGTH = 500;

function planSubmit(item: ApprovalItemSnapshot, reason: string | null): ApprovalPlan {
  if (!item.actionType) return { ok: false, code: 'not-actionable', error: 'Only action items enter the approval flow' };
  if (item.approvalState !== 'draft') {
    return { ok: false, code: 'invalid-state-transition', error: `Cannot submit from state ${item.approvalState}` };
  }
  return { ok: true, transition: { kind: 'approval', fromState: 'draft', toState: 'pending_approval', reason, itemVersion: item.version } };
}

function planApprove(item: ApprovalItemSnapshot, reason: string | null): ApprovalPlan {
  if (item.approvalState !== 'pending_approval') {
    return { ok: false, code: 'invalid-state-transition', error: `Cannot approve from state ${item.approvalState}` };
  }
  return { ok: true, transition: { kind: 'approval', fromState: 'pending_approval', toState: 'approved', reason, itemVersion: item.version } };
}

function planReject(item: ApprovalItemSnapshot, reason: string | null): ApprovalPlan {
  if (item.approvalState !== 'pending_approval') {
    return { ok: false, code: 'invalid-state-transition', error: `Cannot reject from state ${item.approvalState}` };
  }
  if (!reason) return { ok: false, code: 'reason-required', error: 'Rejecting an action requires a reason' };
  return { ok: true, transition: { kind: 'approval', fromState: 'pending_approval', toState: 'rejected', reason, itemVersion: item.version } };
}

function planExecute(item: ApprovalItemSnapshot, reason: string | null): ApprovalPlan {
  if (!item.actionType) return { ok: false, code: 'not-actionable', error: 'Only action items can be executed' };
  if (item.approvalState !== 'approved') {
    return { ok: false, code: 'invalid-state-transition', error: `Cannot execute from state ${item.approvalState}` };
  }
  if (item.executionState === 'executed') {
    return { ok: false, code: 'invalid-state-transition', error: 'Action was already executed' };
  }
  return { ok: true, transition: { kind: 'execution', fromState: 'approved', toState: 'executed', reason, itemVersion: item.version } };
}

export function planApprovalAction(
  action: ApprovalAction,
  item: ApprovalItemSnapshot,
  rawReason?: string | null,
): ApprovalPlan {
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, code: 'reason-required', error: `Reason must be at most ${MAX_REASON_LENGTH} characters` };
  }
  const normalized = reason || null;
  switch (action) {
    case 'submit': return planSubmit(item, normalized);
    case 'approve': return planApprove(item, normalized);
    case 'reject': return planReject(item, normalized);
    case 'execute': return planExecute(item, normalized);
    default:
      return { ok: false, code: 'invalid-state-transition', error: 'Unknown approval action' };
  }
}
