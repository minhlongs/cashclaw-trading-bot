// DecisionLog tests — append-only hash-chained log (task §10). Historical
// evidence is never overwritten: append returns a new log; verify rejects
// any broken link.

import { describe, expect, it } from 'vitest';
import {
  DECISION_LOG_KINDS,
  EMPTY_DECISION_LOG,
  appendDecisionLogEntry,
  computeEntryHash,
  verifyDecisionLog,
} from './decision-log';

const NOW = '2026-08-26T00:00:00.000Z';

function payload(kind: string) {
  return { kind, note: 'evidence payload' };
}

describe('appendDecisionLogEntry — happy path', () => {
  it('appends to the empty log and binds a hash chain', async () => {
    const result = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'analyst-output',
      researchGoalId: 'goal-1',
      proposalId: 'prop-1',
      payload: payload('analyst-output'),
      timestamp: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.seq).toBe(0);
    expect(result.entry.prevHash).toBeNull();
    expect(result.log.tailHash).toBe(result.entry.hash);
    expect(result.log.entries).toHaveLength(1);
  });

  it('chains a second entry onto the first', async () => {
    const r1 = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'analyst-output', researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: payload('analyst-output'), timestamp: NOW,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = await appendDecisionLogEntry(r1.log, {
      kind: 'debate-output', researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: payload('debate-output'), timestamp: NOW,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.entry.seq).toBe(1);
    expect(r2.entry.prevHash).toBe(r1.entry.hash);
    expect(r2.log.tailHash).toBe(r2.entry.hash);
  });

  it('never mutates the input log (append-only)', async () => {
    const r1 = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'analyst-output', researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: payload('analyst-output'), timestamp: NOW,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    await appendDecisionLogEntry(r1.log, {
      kind: 'debate-output', researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: payload('debate-output'), timestamp: NOW,
    });
    expect(r1.log.entries).toHaveLength(1);
    expect(r1.log.tailHash).toBe(r1.entry.hash);
  });

  it('accepts every recorded stage (§10)', async () => {
    for (const kind of DECISION_LOG_KINDS) {
      const result = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
        kind, researchGoalId: 'goal-1', proposalId: 'prop-1',
        payload: payload(kind), timestamp: NOW,
      });
      expect(result.ok).toBe(true);
    }
  });
});

describe('appendDecisionLogEntry — fail-closed', () => {
  it('rejects an unknown kind', async () => {
    const result = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'trade' as never, researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: payload('trade'), timestamp: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain("unknown kind 'trade'");
  });

  it('rejects empty researchGoalId', async () => {
    const result = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'analyst-output', researchGoalId: '', proposalId: 'prop-1',
      payload: payload('x'), timestamp: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects empty proposalId', async () => {
    const result = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'analyst-output', researchGoalId: 'goal-1', proposalId: '',
      payload: payload('x'), timestamp: NOW,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid timestamp', async () => {
    const result = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'analyst-output', researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: payload('x'), timestamp: 'not-a-date',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects non-serializable payload (throwing getter)', async () => {
    const badPayload = {
      get x() { throw new Error('cannot serialize'); }
    };
    const result = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'analyst-output', researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: badPayload, timestamp: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain('payload is not serializable');
  });

  it('accepts a Date payload (canonicalize converts to ISO string)', async () => {
    const result = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'analyst-output', researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: { when: new Date(NOW) }, timestamp: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.payloadJson).toContain(NOW);
  });
});

describe('verifyDecisionLog', () => {
  async function twoEntryLog() {
    const r1 = await appendDecisionLogEntry(EMPTY_DECISION_LOG, {
      kind: 'analyst-output', researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: payload('analyst-output'), timestamp: NOW,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return null;
    const r2 = await appendDecisionLogEntry(r1.log, {
      kind: 'debate-output', researchGoalId: 'goal-1', proposalId: 'prop-1',
      payload: payload('debate-output'), timestamp: NOW,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return null;
    return { first: r1, second: r2 };
  }

  it('verifies a clean chain', async () => {
    const built = await twoEntryLog();
    if (!built) return;
    const verify = await verifyDecisionLog(built.second.log);
    expect(verify.ok).toBe(true);
  });

  it('rejects a tampered entry hash', async () => {
    const built = await twoEntryLog();
    if (!built) return;
    const tampered = {
      ...built.first.log,
      entries: [{ ...built.first.log.entries[0], hash: '0'.repeat(64) }],
    };
    const verify = await verifyDecisionLog(tampered);
    expect(verify.ok).toBe(false);
    if (verify.ok) return;
    expect(verify.reasons[0]).toContain('hash mismatch');
  });

  it('rejects a broken prevHash link', async () => {
    const built = await twoEntryLog();
    if (!built) return;
    const broken = {
      ...built.second.log,
      entries: [{ ...built.second.log.entries[1], prevHash: 'wrong' }],
    };
    const verify = await verifyDecisionLog(broken);
    expect(verify.ok).toBe(false);
  });

  it('verifies the empty log', async () => {
    const verify = await verifyDecisionLog(EMPTY_DECISION_LOG);
    expect(verify.ok).toBe(true);
  });
});

describe('computeEntryHash', () => {
  it('is deterministic', async () => {
    const a = await computeEntryHash(null, {
      kind: 'analyst-output', researchGoalId: 'g', proposalId: 'p',
      payloadJson: '{}', timestamp: NOW,
    });
    const b = await computeEntryHash(null, {
      kind: 'analyst-output', researchGoalId: 'g', proposalId: 'p',
      payloadJson: '{}', timestamp: NOW,
    });
    expect(a).toBe(b);
  });

  it('incorporates prevHash', async () => {
    const a = await computeEntryHash(null, {
      kind: 'analyst-output', researchGoalId: 'g', proposalId: 'p',
      payloadJson: '{}', timestamp: NOW,
    });
    const b = await computeEntryHash('prev', {
      kind: 'analyst-output', researchGoalId: 'g', proposalId: 'p',
      payloadJson: '{}', timestamp: NOW,
    });
    expect(a).not.toBe(b);
  });
});