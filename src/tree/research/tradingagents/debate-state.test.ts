// DebateCheckpoint tests — checkpoint adapter (task §9): serialize/
// deserialize round-trip, resultHash binding, tamper detection,
// fail-closed validation. Zero LangGraph dependency.

import { describe, expect, it } from 'vitest';
import {
  computeDebateResultHash,
  debateCheckpointSchema,
  deserializeCheckpoint,
  serializeCheckpoint,
  type DebateCheckpoint,
  type DebateState,
} from './debate-state';

const NOW = '2026-08-26T00:00:00.000Z';

function makeState(overrides: Partial<DebateState> = {}): DebateState {
  return {
    researchGoalId: 'goal-1',
    proposalId: 'prop-1',
    rounds: [
      { agentRole: 'bull-researcher', agentId: 'b1', content: 'bull case', round: 0 },
      { agentRole: 'bear-researcher', agentId: 'r1', content: 'bear case', round: 1 },
    ],
    status: 'complete',
    ...overrides,
  };
}

async function makeCheckpoint(overrides: Partial<DebateCheckpoint> = {}): Promise<DebateCheckpoint> {
  const state = makeState();
  return {
    researchGoalId: 'goal-1',
    proposalId: 'prop-1',
    debateState: state,
    modelProvenance: [{ providerId: 'Anthropic', modelId: 'claude-x', tier: 'REASONING' }],
    toolProvenance: [{ toolName: 'market-data-read', allowlisted: true }],
    timestamp: NOW,
    resultHash: await computeDebateResultHash(state),
    ...overrides,
  };
}

describe('computeDebateResultHash', () => {
  it('is deterministic for identical states', async () => {
    const a = await computeDebateResultHash(makeState());
    const b = await computeDebateResultHash(makeState());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when state changes', async () => {
    const a = await computeDebateResultHash(makeState());
    const b = await computeDebateResultHash(makeState({ status: 'aborted' }));
    expect(a).not.toBe(b);
  });

  it('is order-insensitive to key insertion (canonical)', async () => {
    const s1: DebateState = { researchGoalId: 'g', proposalId: 'p', rounds: [], status: 'complete' };
    const s2 = { status: 'complete', rounds: [], proposalId: 'p', researchGoalId: 'g' } as DebateState;
    expect(await computeDebateResultHash(s1)).toBe(await computeDebateResultHash(s2));
  });
});

describe('serializeCheckpoint + deserializeCheckpoint round-trip', () => {
  it('round-trips a valid checkpoint', async () => {
    const checkpoint = await makeCheckpoint();
    const serialized = await serializeCheckpoint(checkpoint);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const deserialized = await deserializeCheckpoint(serialized.json);
    expect(deserialized.ok).toBe(true);
    if (!deserialized.ok) return;
    expect(deserialized.value.researchGoalId).toBe('goal-1');
    expect(deserialized.value.debateState.rounds).toHaveLength(2);
  });

  it('serialization is deterministic canonical JSON', async () => {
    const checkpoint = await makeCheckpoint();
    const a = await serializeCheckpoint(checkpoint);
    const b = await serializeCheckpoint(checkpoint);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.json).toBe(b.json);
  });
});

describe('serializeCheckpoint — fail-closed', () => {
  it('rejects a tampered resultHash', async () => {
    const checkpoint = await makeCheckpoint({ resultHash: '0'.repeat(64) });
    const result = await serializeCheckpoint(checkpoint);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain('resultHash does not match');
  });

  it('rejects mismatched researchGoalId between top level and debateState', async () => {
    const checkpoint = await makeCheckpoint({ researchGoalId: 'other-goal' });
    const result = await serializeCheckpoint(checkpoint);
    expect(result.ok).toBe(false);
  });

  it('rejects mismatched proposalId between top level and debateState', async () => {
    const checkpoint = await makeCheckpoint({ proposalId: 'other-prop' });
    const result = await serializeCheckpoint(checkpoint);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid timestamp', async () => {
    const checkpoint = await makeCheckpoint({ timestamp: 'not-a-date' });
    const result = await serializeCheckpoint(checkpoint);
    expect(result.ok).toBe(false);
  });

  it('rejects invalid model tier', async () => {
    const checkpoint = await makeCheckpoint({
      modelProvenance: [{ providerId: 'Anthropic', modelId: 'm', tier: 'ULTRA' as never }],
    });
    const result = await serializeCheckpoint(checkpoint);
    expect(result.ok).toBe(false);
  });
});

describe('deserializeCheckpoint — fail-closed', () => {
  it('rejects invalid JSON', async () => {
    const result = await deserializeCheckpoint('{not json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain('not valid JSON');
  });

  it('rejects schema violations', async () => {
    const result = await deserializeCheckpoint(JSON.stringify({ researchGoalId: '' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a tampered hash after serialization', async () => {
    const checkpoint = await makeCheckpoint();
    const serialized = await serializeCheckpoint(checkpoint);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const parsed = JSON.parse(serialized.json) as Record<string, unknown>;
    parsed.resultHash = 'f'.repeat(64);
    const result = await deserializeCheckpoint(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain('resultHash does not match');
  });

  it('rejects tampered debateState content after serialization', async () => {
    const checkpoint = await makeCheckpoint();
    const serialized = await serializeCheckpoint(checkpoint);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const parsed = JSON.parse(serialized.json) as { debateState: { status: string } };
    parsed.debateState.status = 'aborted';
    const result = await deserializeCheckpoint(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
  });
});

describe('debateCheckpointSchema', () => {
  it('requires exactly the 7 §9 fields', () => {
    const keys = Object.keys(debateCheckpointSchema.shape);
    expect(keys.sort()).toEqual(
      ['debateState', 'modelProvenance', 'proposalId', 'researchGoalId', 'resultHash', 'timestamp', 'toolProvenance'].sort(),
    );
  });
});
