// ResearchHypothesis contract — unit tests.
// Covers: per-field-group Zod rejection, mechanism gate accept/reject table.

import { describe, expect, it } from 'vitest';
import { parseResearchHypothesis } from './types';
import { MECHANISM_MIN_LENGTH } from './mechanism-gate';

const VALID_MECHANISM =
  'Funding dislocation + OI expansion + liquidation imbalance may indicate crowded positioning and short-horizon reversal';

function makeInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'hyp-0001-funding-fade',
    title: 'Funding fade',
    description: 'Extreme negative funding precedes short-horizon reversal',
    rationale: 'Crowded shorts pay funding; positioning unwinds create reversal pressure',
    source: 'vibe-zoo',
    parentHypothesisId: null,
    universe: {
      id: 'perp-majors',
      symbols: ['BTCUSDT', 'ETHUSDT'],
      weighting: 'equal',
      rebalanceRule: 'none',
    },
    timeframe: '1h',
    horizon: 8,
    features: [{ name: 'funding_rate', lookback: 24, params: {} }],
    transformations: ['zscore'],
    regimeConstraints: ['RANGE'],
    expectedMechanism: VALID_MECHANISM,
    expectedDirection: 'long',
    expectedHoldingPeriod: 8,
    costAssumption: 'conservative',
    generatedBy: 'test-generator',
    createdAt: '2026-08-26T00:00:00.000Z',
    experimentVersion: 1,
    ...overrides,
  };
}

describe('parseResearchHypothesis', () => {
  it('accepts a fully valid hypothesis', () => {
    const result = parseResearchHypothesis(makeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('hyp-0001-funding-fade');
      expect(result.value.features).toHaveLength(1);
    }
  });

  describe('fail-closed: per field group', () => {
    it('missing/empty id, title, description, rationale → rejected with all reasons', () => {
      const result = parseResearchHypothesis(
        makeInput({ id: '', title: '', description: '', rationale: '' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.length).toBeGreaterThanOrEqual(4);
        expect(result.reasons.some((r) => r.startsWith('id:'))).toBe(true);
        expect(result.reasons.some((r) => r.startsWith('title:'))).toBe(true);
        expect(result.reasons.some((r) => r.startsWith('description:'))).toBe(true);
        expect(result.reasons.some((r) => r.startsWith('rationale:'))).toBe(true);
      }
    });

    it('invalid source enum → rejected', () => {
      const result = parseResearchHypothesis(makeInput({ source: 'gpt' }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reasons.some((r) => r.startsWith('source:'))).toBe(true);
    });

    it('each valid source enum value accepted', () => {
      for (const source of ['vibe-zoo', 'swarm', 'mcp', 'human', 'import']) {
        expect(parseResearchHypothesis(makeInput({ source })).ok).toBe(true);
      }
    });

    it('empty universe symbols → rejected', () => {
      const result = parseResearchHypothesis(
        makeInput({ universe: { id: 'u', symbols: [], weighting: 'equal', rebalanceRule: 'none' } }),
      );
      expect(result.ok).toBe(false);
    });

    it('non-positive or non-integer horizon → rejected', () => {
      expect(parseResearchHypothesis(makeInput({ horizon: 0 })).ok).toBe(false);
      expect(parseResearchHypothesis(makeInput({ horizon: 2.5 })).ok).toBe(false);
      expect(parseResearchHypothesis(makeInput({ horizon: -3 })).ok).toBe(false);
    });

    it('empty features array → rejected', () => {
      expect(parseResearchHypothesis(makeInput({ features: [] })).ok).toBe(false);
    });

    it('feature with empty name or non-positive lookback → rejected', () => {
      expect(
        parseResearchHypothesis(makeInput({ features: [{ name: '', lookback: 10, params: {} }] }))
          .ok,
      ).toBe(false);
      expect(
        parseResearchHypothesis(makeInput({ features: [{ name: 'x', lookback: 0, params: {} }] }))
          .ok,
      ).toBe(false);
    });

    it('invalid regime constraint → rejected', () => {
      expect(parseResearchHypothesis(makeInput({ regimeConstraints: ['NOT_A_REGIME'] })).ok).toBe(
        false,
      );
    });

    it('invalid expectedDirection → rejected', () => {
      expect(parseResearchHypothesis(makeInput({ expectedDirection: 'sideways' })).ok).toBe(false);
    });

    it('invalid costAssumption → rejected', () => {
      expect(parseResearchHypothesis(makeInput({ costAssumption: 'free' })).ok).toBe(false);
    });

    it('non-ISO createdAt → rejected', () => {
      expect(parseResearchHypothesis(makeInput({ createdAt: 'yesterday' })).ok).toBe(false);
    });

    it('experimentVersion < 1 → rejected', () => {
      expect(parseResearchHypothesis(makeInput({ experimentVersion: 0 })).ok).toBe(false);
    });

    it('parentHypothesisId accepts null and non-empty string', () => {
      expect(parseResearchHypothesis(makeInput({ parentHypothesisId: null })).ok).toBe(true);
      expect(parseResearchHypothesis(makeInput({ parentHypothesisId: 'hyp-0000' })).ok).toBe(true);
      expect(parseResearchHypothesis(makeInput({ parentHypothesisId: '' })).ok).toBe(false);
    });

    it('non-object input → rejected', () => {
      expect(parseResearchHypothesis(null).ok).toBe(false);
      expect(parseResearchHypothesis('hypothesis').ok).toBe(false);
    });
  });

  describe('mechanism gate', () => {
    it('"LLM thinks price will go up" → rejected with mechanism-gate reason', () => {
      const result = parseResearchHypothesis(
        makeInput({ expectedMechanism: 'LLM thinks price will go up' }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.some((r) => r.includes('mechanism gate'))).toBe(true);
      }
    });

    it('funding-dislocation mechanism → accepted', () => {
      const result = parseResearchHypothesis(makeInput());
      expect(result.ok).toBe(true);
    });

    it('empty mechanism → rejected', () => {
      expect(parseResearchHypothesis(makeInput({ expectedMechanism: '' })).ok).toBe(false);
    });

    it('short mechanism below min length → rejected', () => {
      const result = parseResearchHypothesis(makeInput({ expectedMechanism: 'funding leads to x' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.join(' ')).toContain(`${MECHANISM_MIN_LENGTH} chars`);
      }
    });
  });
});
