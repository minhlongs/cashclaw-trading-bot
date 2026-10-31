import { describe, expect, it } from 'vitest';
import { planApprovalAction, type ApprovalItemSnapshot } from './approval-machine';

function item(overrides: Partial<ApprovalItemSnapshot> = {}): ApprovalItemSnapshot {
  return {
    id: 'item-1', ownerUserId: 'user-a', actionType: 'outbound_message',
    approvalState: 'draft', executionState: null, version: 0,
    ...overrides,
  };
}

describe('approval machine', () => {
  it('walks draft -> pending_approval -> approved -> executed with versioned transitions', () => {
    const submit = planApprovalAction('submit', item(), null);
    expect(submit).toMatchObject({ ok: true, transition: { kind: 'approval', fromState: 'draft', toState: 'pending_approval', itemVersion: 0 } });
    const approve = planApprovalAction('approve', item({ approvalState: 'pending_approval', version: 1 }), 'looks good');
    expect(approve).toMatchObject({ ok: true, transition: { kind: 'approval', fromState: 'pending_approval', toState: 'approved', reason: 'looks good', itemVersion: 1 } });
    const execute = planApprovalAction('execute', item({ approvalState: 'approved', version: 2 }), null);
    expect(execute).toMatchObject({ ok: true, transition: { kind: 'execution', fromState: 'approved', toState: 'executed', itemVersion: 2 } });
  });

  it('rejects requires a non-empty reason and lands in rejected', () => {
    const missing = planApprovalAction('reject', item({ approvalState: 'pending_approval' }), '   ');
    expect(missing).toMatchObject({ ok: false, code: 'reason-required' });
    const reject = planApprovalAction('reject', item({ approvalState: 'pending_approval', version: 3 }), 'evidence mismatch');
    expect(reject).toMatchObject({ ok: true, transition: { fromState: 'pending_approval', toState: 'rejected', reason: 'evidence mismatch' } });
  });

  it('blocks plain items and every illegal transition', () => {
    expect(planApprovalAction('submit', item({ actionType: null }))).toMatchObject({ ok: false, code: 'not-actionable' });
    expect(planApprovalAction('execute', item({ actionType: null, approvalState: 'approved' }))).toMatchObject({ ok: false, code: 'not-actionable' });
    expect(planApprovalAction('submit', item({ approvalState: 'none' }))).toMatchObject({ ok: false, code: 'invalid-state-transition' });
    expect(planApprovalAction('approve', item({ approvalState: 'draft' }))).toMatchObject({ ok: false, code: 'invalid-state-transition' });
    expect(planApprovalAction('reject', item({ approvalState: 'approved' }))).toMatchObject({ ok: false, code: 'invalid-state-transition' });
    expect(planApprovalAction('execute', item({ approvalState: 'draft' }))).toMatchObject({ ok: false, code: 'invalid-state-transition' });
    expect(planApprovalAction('execute', item({ approvalState: 'approved', executionState: 'executed' }))).toMatchObject({ ok: false, code: 'invalid-state-transition' });
  });

  it('allows retrying a failed execution but never re-executing a successful one', () => {
    const retry = planApprovalAction('execute', item({ approvalState: 'approved', executionState: 'failed', version: 4 }), null);
    expect(retry).toMatchObject({ ok: true, transition: { toState: 'executed', itemVersion: 4 } });
  });

  it('caps reason length', () => {
    expect(planApprovalAction('reject', item({ approvalState: 'pending_approval' }), 'x'.repeat(501))).toMatchObject({ ok: false, code: 'reason-required' });
  });
});
