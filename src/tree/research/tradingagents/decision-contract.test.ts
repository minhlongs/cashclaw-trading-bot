// DecisionProposal contract tests — fail-closed parsing, order-field
// rejection (Debate → Trade forbidden by construction), malformed
// structured output, missing evidence, invalid provenance.

import { describe, expect, it } from 'vitest';
import {
  NO_ORDER_FIELDS,
  parseDecisionProposal,
} from './decision-contract';

const NOW = '2026-08-26T00:00:00.000Z';

function makeProposal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    proposalId: 'prop-1',
    researchGoalId: 'goal-1',
    thesis: 'Funding dislocation may indicate crowded short positioning',
    counterThesis: 'Momentum may persist due to spot inflows',
    evidence: [{ claim: 'funding at -0.05%', source: 'market-data-read' }],
    assumptions: ['liquidation cascade is bounded'],
    invalidationConditions: ['funding flips positive for 3 consecutive prints'],
    catalyst: ['CPI print above consensus'],
    horizon: 5,
    confidence: 0.6,
    proposedDirection: 'long',
    proposedPosition: 0.1,
    proposedEntry: 'spot ask at open',
    proposedExit: 'funding normalization',
    proposedStop: 'invalidation condition hit',
    riskFactors: ['gap risk'],
    dataProvenance: [{ dataset: 'funding-1h', provider: 'exchange-a', timestamp: NOW }],
    agentProvenance: { agentRole: 'analyst', agentId: 'a1', providerId: 'Anthropic', modelId: 'claude-x' },
    modelProvenance: { providerId: 'Anthropic', modelId: 'claude-x', tier: 'REASONING' },
    createdAt: NOW,
    ...overrides,
  };
}

describe('parseDecisionProposal — happy path', () => {
  it('parses a fully valid 20-field proposal', () => {
    const result = parseDecisionProposal(makeProposal());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proposalId).toBe('prop-1');
    expect(result.value.proposedDirection).toBe('long');
    expect(result.value.evidence).toHaveLength(1);
  });

  it('accepts neutral and short directions', () => {
    for (const dir of ['neutral', 'short']) {
      const result = parseDecisionProposal(makeProposal({ proposedDirection: dir }));
      expect(result.ok).toBe(true);
    }
  });

  it('accepts optional token/latency counters in modelProvenance', () => {
    const result = parseDecisionProposal(
      makeProposal({
        modelProvenance: {
          providerId: 'Anthropic', modelId: 'claude-x', tier: 'REASONING',
          promptTokens: 100, completionTokens: 50, latencyMs: 1200,
        },
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('parseDecisionProposal — order surface forbidden (§L)', () => {
  it.each(NO_ORDER_FIELDS.map((f) => [f]))('rejects order field %s', (field) => {
    const result = parseDecisionProposal(makeProposal({ [field]: 'x' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain(`order field '${field}' is forbidden`);
  });
});

describe('parseDecisionProposal — malformed structured output', () => {
  it('rejects non-object input', () => {
    expect(parseDecisionProposal(null).ok).toBe(false);
    expect(parseDecisionProposal('text').ok).toBe(false);
    expect(parseDecisionProposal(42).ok).toBe(false);
  });

  it('rejects missing evidence (min 1)', () => {
    const result = parseDecisionProposal(makeProposal({ evidence: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.startsWith('evidence'))).toBe(true);
  });

  it('rejects confidence outside [0,1]', () => {
    expect(parseDecisionProposal(makeProposal({ confidence: 1.5 })).ok).toBe(false);
    expect(parseDecisionProposal(makeProposal({ confidence: -0.1 })).ok).toBe(false);
  });

  it('rejects non-positive horizon', () => {
    expect(parseDecisionProposal(makeProposal({ horizon: 0 })).ok).toBe(false);
    expect(parseDecisionProposal(makeProposal({ horizon: -3 })).ok).toBe(false);
  });

  it('rejects unknown proposedDirection', () => {
    const result = parseDecisionProposal(makeProposal({ proposedDirection: 'yolo' }));
    expect(result.ok).toBe(false);
  });

  it('rejects invalid createdAt timestamp', () => {
    const result = parseDecisionProposal(makeProposal({ createdAt: 'not-a-date' }));
    expect(result.ok).toBe(false);
  });

  it('collects ALL issues, never partial', () => {
    const result = parseDecisionProposal(
      makeProposal({ thesis: '', confidence: 2, horizon: 0, evidence: [] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('rejects invalid dataProvenance timestamp', () => {
    const result = parseDecisionProposal(
      makeProposal({ dataProvenance: [{ dataset: 'd', provider: 'p', timestamp: 'bad' }] }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects empty agentProvenance providerId (invalid provenance)', () => {
    const result = parseDecisionProposal(
      makeProposal({ agentProvenance: { agentRole: 'analyst', agentId: 'a1', providerId: '', modelId: 'm' } }),
    );
    expect(result.ok).toBe(false);
  });
});
