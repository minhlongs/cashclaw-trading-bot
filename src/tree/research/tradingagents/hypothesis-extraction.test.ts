// Hypothesis extraction tests — bull→A + bear→B, deterministic ids,
// mechanism-gate enforcement, conflicting claims, missing evidence,
// no winner selection.

import { describe, expect, it } from 'vitest';
import {
  buildHypothesisId,
  extractHypotheses,
  fnv1a32,
  type DebateInput,
  type DebateThesis,
  type HypothesisExtractionConfig,
} from './hypothesis-extraction';
import type { Universe } from '@/tree/alpha/universe/types';

const UNIVERSE: Universe = {
  id: 'us-equity', symbols: ['AAPL', 'MSFT'], weighting: 'equal', rebalanceRule: 'daily',
};

const CONFIG: HypothesisExtractionConfig = {
  universe: UNIVERSE,
  timeframe: '1d',
  nowIso: '2026-08-26T00:00:00.000Z',
  importerVersion: 'tradingagents-adapter@1',
  defaultCostMode: 'conservative',
};

const VALID_MECHANISM =
  'Funding dislocation + OI expansion + liquidation imbalance may indicate crowded positioning and short-horizon reversal';

function makeThesis(role: 'bull' | 'bear', overrides: Partial<DebateThesis> = {}): DebateThesis {
  return {
    role,
    thesis: `${role} case: funding dislocation drives reversal`,
    mechanism: VALID_MECHANISM,
    evidence: ['funding at -0.05%', 'OI expanding'],
    expectedDirection: role === 'bull' ? 'long' : 'short',
    horizon: 5,
    features: [{ name: 'funding_rate', lookback: 10, params: {} }],
    ...overrides,
  };
}

function makeDebate(overrides: Partial<DebateInput> = {}): DebateInput {
  return {
    goalId: 'goal-1',
    bull: makeThesis('bull'),
    bear: makeThesis('bear'),
    ...overrides,
  };
}

describe('extractHypotheses — happy path', () => {
  it('extracts hypothesis A (bull) and B (bear)', () => {
    const result = extractHypotheses(makeDebate(), CONFIG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hypothesisA.expectedDirection).toBe('long');
    expect(result.value.hypothesisB.expectedDirection).toBe('short');
    expect(result.value.hypothesisA.source).toBe('deliberation');
    expect(result.value.hypothesisB.source).toBe('deliberation');
  });

  it('assigns distinct deterministic ids to A and B', () => {
    const result = extractHypotheses(makeDebate(), CONFIG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hypothesisA.id).not.toBe(result.value.hypothesisB.id);
    expect(result.value.hypothesisA.id).toMatch(/^delib-bull-[0-9a-f]{8}$/);
    expect(result.value.hypothesisB.id).toMatch(/^delib-bear-[0-9a-f]{8}$/);
  });

  it('is deterministic across repeated calls (no wall clock)', () => {
    const a = extractHypotheses(makeDebate(), CONFIG);
    const b = extractHypotheses(makeDebate(), CONFIG);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.hypothesisA.id).toBe(b.value.hypothesisA.id);
    expect(a.value.hypothesisB.id).toBe(b.value.hypothesisB.id);
  });

  it('does not select a winner — both hypotheses are returned', () => {
    const result = extractHypotheses(makeDebate(), CONFIG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hypothesisA).toBeDefined();
    expect(result.value.hypothesisB).toBeDefined();
  });
});

describe('extractHypotheses — mechanism gate', () => {
  it('rejects a bull thesis with a non-causal mechanism', () => {
    const debate = makeDebate({ bull: makeThesis('bull', { mechanism: 'price will go up' }) });
    const result = extractHypotheses(debate, CONFIG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.startsWith('hypothesisA(bull):'))).toBe(true);
  });

  it('rejects a bear thesis with a too-short mechanism', () => {
    const debate = makeDebate({ bear: makeThesis('bear', { mechanism: 'short it' }) });
    const result = extractHypotheses(debate, CONFIG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.startsWith('hypothesisB(bear):'))).toBe(true);
  });

  it('collects reasons from BOTH sides when both fail', () => {
    const debate = makeDebate({
      bull: makeThesis('bull', { mechanism: 'price will go up' }),
      bear: makeThesis('bear', { mechanism: 'price will go down' }),
    });
    const result = extractHypotheses(debate, CONFIG);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.startsWith('hypothesisA(bull):'))).toBe(true);
    expect(result.reasons.some((r) => r.startsWith('hypothesisB(bear):'))).toBe(true);
  });
});

describe('extractHypotheses — invalid inputs', () => {
  it('rejects a thesis with no features', () => {
    const debate = makeDebate({ bull: makeThesis('bull', { features: [] }) });
    const result = extractHypotheses(debate, CONFIG);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-positive horizon', () => {
    const debate = makeDebate({ bear: makeThesis('bear', { horizon: 0 }) });
    const result = extractHypotheses(debate, CONFIG);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown expectedDirection', () => {
    const debate = makeDebate({
      bull: makeThesis('bull', { expectedDirection: 'sideways' as never }),
    });
    const result = extractHypotheses(debate, CONFIG);
    expect(result.ok).toBe(false);
  });
});

describe('fnv1a32 + buildHypothesisId', () => {
  it('fnv1a32 is deterministic and 32-bit unsigned', () => {
    expect(fnv1a32('abc')).toBe(fnv1a32('abc'));
    expect(fnv1a32('abc')).not.toBe(fnv1a32('abd'));
    expect(fnv1a32('abc')).toBeGreaterThanOrEqual(0);
    expect(fnv1a32('abc')).toBeLessThan(2 ** 32);
  });

  it('buildHypothesisId is stable for identical theses', () => {
    const t = makeThesis('bull');
    expect(buildHypothesisId('g', t)).toBe(buildHypothesisId('g', t));
  });

  it('buildHypothesisId differs across goals', () => {
    const t = makeThesis('bull');
    expect(buildHypothesisId('g1', t)).not.toBe(buildHypothesisId('g2', t));
  });
});
