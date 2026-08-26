// ResearchLineage + EvidenceObject — unit tests.
// Covers: graph traversal, cycle rejection (fail-closed throw),
// falsified-spawn guard (implicit re-test rejected, explicit lineage accepted),
// EvidenceObject shape constants.

import { describe, expect, it } from 'vitest';
import { buildLineage, spawnFromFalsified } from './lineage';
import { EVIDENCE_KINDS, EVIDENCE_VERDICTS, type EvidenceObject } from './types';
import { parseResearchHypothesis, type ResearchHypothesis } from '@/tree/research/hypothesis/types';

function makeHypothesis(id: string, parentHypothesisId: string | null): ResearchHypothesis {
  const result = parseResearchHypothesis({
    id,
    title: `Hypothesis ${id}`,
    description: 'Test hypothesis for lineage',
    rationale: 'Lineage fixture',
    source: 'human',
    parentHypothesisId,
    universe: {
      id: 'perp-majors',
      symbols: ['BTCUSDT'],
      weighting: 'equal',
      rebalanceRule: 'none',
    },
    timeframe: '1h',
    horizon: 8,
    features: [{ name: 'funding_rate', lookback: 24, params: {} }],
    transformations: [],
    regimeConstraints: [],
    expectedMechanism:
      'Funding dislocation + OI expansion + liquidation imbalance may indicate crowded positioning and short-horizon reversal',
    expectedDirection: 'long',
    expectedHoldingPeriod: 8,
    costAssumption: 'conservative',
    generatedBy: 'test-generator',
    createdAt: '2026-06-15T12:00:00.000Z',
    experimentVersion: 1,
  });
  if (!result.ok) throw new Error(`fixture invalid: ${result.reasons.join('; ')}`);
  return result.value;
}

describe('buildLineage', () => {
  it('builds parent/children maps for a chain', () => {
    const a = makeHypothesis('hyp-a', null);
    const b = makeHypothesis('hyp-b', 'hyp-a');
    const c = makeHypothesis('hyp-c', 'hyp-b');
    const lineage = buildLineage([a, b, c]);

    expect(lineage.parentOf.get('hyp-a')).toBeNull();
    expect(lineage.parentOf.get('hyp-b')).toBe('hyp-a');
    expect(lineage.childrenOf.get('hyp-a')).toEqual(['hyp-b']);
    expect(lineage.childrenOf.get('hyp-b')).toEqual(['hyp-c']);
  });

  it('ancestorsOf walks nearest-first upward', () => {
    const a = makeHypothesis('hyp-a', null);
    const b = makeHypothesis('hyp-b', 'hyp-a');
    const c = makeHypothesis('hyp-c', 'hyp-b');
    const lineage = buildLineage([a, b, c]);
    expect(lineage.ancestorsOf('hyp-c')).toEqual(['hyp-b', 'hyp-a']);
    expect(lineage.ancestorsOf('hyp-a')).toEqual([]);
  });

  it('descendantsOf collects all levels in BFS order', () => {
    const a = makeHypothesis('hyp-a', null);
    const b = makeHypothesis('hyp-b', 'hyp-a');
    const c = makeHypothesis('hyp-c', 'hyp-a');
    const d = makeHypothesis('hyp-d', 'hyp-b');
    const lineage = buildLineage([a, b, c, d]);
    expect(lineage.descendantsOf('hyp-a')).toEqual(['hyp-b', 'hyp-c', 'hyp-d']);
    expect(lineage.descendantsOf('hyp-d')).toEqual([]);
  });

  it('throws fail-closed on a parent cycle', () => {
    const a = makeHypothesis('hyp-a', 'hyp-b');
    const b = makeHypothesis('hyp-b', 'hyp-a');
    expect(() => buildLineage([a, b])).toThrow(/cycle/i);
  });

  it('throws fail-closed on a self-cycle', () => {
    const a = makeHypothesis('hyp-a', 'hyp-a');
    expect(() => buildLineage([a])).toThrow(/cycle/i);
  });

  it('throws on duplicate hypothesis ids', () => {
    const a = makeHypothesis('hyp-a', null);
    const dup = makeHypothesis('hyp-a', null);
    expect(() => buildLineage([a, dup])).toThrow(/duplicate/i);
  });

  it('tolerates a parent id pointing outside the supplied set', () => {
    const b = makeHypothesis('hyp-b', 'hyp-external');
    const lineage = buildLineage([b]);
    expect(lineage.parentOf.get('hyp-b')).toBe('hyp-external');
    expect(lineage.ancestorsOf('hyp-b')).toEqual(['hyp-external']);
  });
});

describe('spawnFromFalsified', () => {
  const parent = makeHypothesis('hyp-dead', null);

  it('rejects implicit re-test (child without parentHypothesisId)', () => {
    const child = makeHypothesis('hyp-retry', null);
    const result = spawnFromFalsified(parent, child, 'changed lookback');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.join(' ')).toContain('implicit re-test');
    }
  });

  it('rejects explicit lineage with empty mutation rationale', () => {
    const child = makeHypothesis('hyp-mutant', 'hyp-dead');
    const result = spawnFromFalsified(parent, child, '   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.join(' ')).toContain('mutation rationale');
    }
  });

  it('rejects when both guards fail and reports both reasons', () => {
    const child = makeHypothesis('hyp-retry', null);
    const result = spawnFromFalsified(parent, child, '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toHaveLength(2);
  });

  it('accepts explicit lineage with non-empty mutation rationale', () => {
    const child = makeHypothesis('hyp-mutant', 'hyp-dead');
    const result = spawnFromFalsified(
      parent,
      child,
      'Parent falsified at 8-bar horizon; mutant tests 24-bar horizon with regime filter',
    );
    expect(result.ok).toBe(true);
  });
});

describe('EvidenceObject contract', () => {
  it('exposes the full kind and verdict vocabularies', () => {
    expect(EVIDENCE_KINDS).toEqual([
      'backtest',
      'oos',
      'robustness',
      'paper',
      'shadow',
      'cost-stress',
      'regime',
      'multiple-testing',
    ]);
    expect(EVIDENCE_VERDICTS).toEqual(['support', 'refute', 'inconclusive']);
  });

  it('accepts a fully populated readonly evidence record', () => {
    const evidence: EvidenceObject = {
      id: 'ev-0001',
      hypothesisId: 'hyp-0001',
      experimentId: 'exp-0001',
      kind: 'oos',
      verdict: 'refute',
      metricsJson: '{"sharpe":0.2}',
      costMode: 'extreme',
      gitCommit: 'abc1234',
      seed: 42,
      createdAt: '2026-08-26T00:00:00.000Z',
    };
    expect(evidence.seed).toBe(42);
    expect(evidence.verdict).toBe('refute');
  });
});
