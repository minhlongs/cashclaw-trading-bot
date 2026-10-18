// Regime transition matrix — tests
// Verifies hand-computed statistics, causality (no forward-looking),
// empty-history safety, and determinism.

import { describe, it, expect } from 'vitest';
import { buildTransitionMatrix, alphaDecayByRegime, REGIME_LABELS } from './transition-matrix';
import { RegimeLabel, type RegimeResult, type RegimeFeatures } from './types';

const DUMMY_FEATURES: RegimeFeatures = {
  realizedVol: 0.01, atr: 1, trendStrength: 10, maSlope: 0, returnDispersion: 0.001, volumeAbnormality: 0,
};

function makeResult(label: RegimeLabel, duration: number, index: number): RegimeResult {
  return {
    label, confidence: 0.9, features: DUMMY_FEATURES, timestamp: 1_700_000_000_000 + index * 3_600_000,
    previousLabel: null, duration,
  };
}

function makeHistory(labels: readonly RegimeLabel[]): RegimeResult[] {
  return labels.map((label, i) => makeResult(label, i + 1, i));
}

const U = RegimeLabel.TREND_UP;
const D = RegimeLabel.TREND_DOWN;
const R = RegimeLabel.RANGE;

function idx(label: RegimeLabel): number { return REGIME_LABELS.indexOf(label); }

function makeZeroCounts(): number[][] {
  return Array.from({ length: REGIME_LABELS.length }, () => new Array<number>(REGIME_LABELS.length).fill(0));
}

const FIXTURE = makeHistory([U, U, D, R, U, D]);

describe('buildTransitionMatrix — hand-computed fixture', () => {
  it('counts match consecutive observed pairs exactly', () => {
    const m = buildTransitionMatrix(FIXTURE);
    expect(m.totalTransitions).toBe(5);
    expect(m.counts[idx(U)][idx(U)]).toBe(1);
    expect(m.counts[idx(U)][idx(D)]).toBe(2);
    expect(m.counts[idx(D)][idx(R)]).toBe(1);
    expect(m.counts[idx(R)][idx(U)]).toBe(1);
    let sum = 0;
    for (const row of m.counts) for (const c of row) sum += c;
    expect(sum).toBe(5);
  });

  it('probabilities are row-normalized counts', () => {
    const m = buildTransitionMatrix(FIXTURE);
    expect(m.probabilities[idx(U)][idx(U)]).toBeCloseTo(1 / 3, 12);
    expect(m.probabilities[idx(U)][idx(D)]).toBeCloseTo(2 / 3, 12);
    expect(m.probabilities[idx(D)][idx(R)]).toBe(1);
    expect(m.probabilities[idx(R)][idx(U)]).toBe(1);
    expect(m.probabilities[idx(U)][idx(R)]).toBe(0);
  });

  it('persistence equals the diagonal of the probability matrix', () => {
    const m = buildTransitionMatrix(FIXTURE);
    for (let i = 0; i < REGIME_LABELS.length; i++) {
      expect(m.persistence[REGIME_LABELS[i]]).toBe(m.probabilities[i][i]);
    }
    expect(m.persistence[U]).toBeCloseTo(1 / 3, 12);
    expect(m.persistence[D]).toBe(0);
    expect(m.persistence[R]).toBe(0);
  });

  it('average duration and hazard match hand computation', () => {
    const m = buildTransitionMatrix(FIXTURE);
    expect(m.avgDuration[U]).toBeCloseTo(8 / 3, 12);
    expect(m.avgDuration[D]).toBeCloseTo(9 / 2, 12);
    expect(m.avgDuration[R]).toBeCloseTo(4, 12);
    expect(m.hazard[U]).toBeCloseTo(3 / 8, 12);
    expect(m.hazard[D]).toBeCloseTo(2 / 9, 12);
    expect(m.hazard[R]).toBeCloseTo(1 / 4, 12);
  });

  it('hazard is 1/avgDuration for every regime with data', () => {
    const m = buildTransitionMatrix(FIXTURE);
    for (const label of REGIME_LABELS) {
      if (m.avgDuration[label] > 0) {
        expect(m.hazard[label]).toBeCloseTo(1 / m.avgDuration[label], 12);
      }
    }
  });
});

describe('buildTransitionMatrix — entropy', () => {
  it('entropy is ≥ 0 and ≤ log2(N) for every regime', () => {
    const m = buildTransitionMatrix(FIXTURE);
    const maxEntropy = Math.log2(REGIME_LABELS.length);
    for (const label of REGIME_LABELS) {
      expect(m.entropy[label]).toBeGreaterThanOrEqual(0);
      expect(m.entropy[label]).toBeLessThanOrEqual(maxEntropy + 1e-12);
    }
  });

  it('deterministic rows have entropy 0; mixed row matches Shannon formula', () => {
    const m = buildTransitionMatrix(FIXTURE);
    expect(m.entropy[D]).toBe(0);
    expect(m.entropy[R]).toBe(0);
    const expected = -(1 / 3) * Math.log2(1 / 3) - (2 / 3) * Math.log2(2 / 3);
    expect(m.entropy[U]).toBeCloseTo(expected, 12);
  });

  it('skips 0·log(0) — sparse rows do not produce NaN', () => {
    const m = buildTransitionMatrix(makeHistory([U, U, U]));
    for (const label of REGIME_LABELS) {
      expect(Number.isNaN(m.entropy[label])).toBe(false);
    }
    expect(m.entropy[U]).toBe(0);
  });
});

describe('buildTransitionMatrix — causality / no leakage', () => {
  it('appending future history adds only the new consecutive pairs', () => {
    const prefix = makeHistory([U, U, D, R, U]);
    const prefixMatrix = buildTransitionMatrix(prefix);
    const future = makeHistory([RegimeLabel.SHOCK, RegimeLabel.HIGH_VOLATILITY, RegimeLabel.LOW_VOLATILITY]);
    const fullMatrix = buildTransitionMatrix([...prefix, ...future]);

    const newPairs: Array<[RegimeLabel, RegimeLabel]> = [[prefix[prefix.length - 1].label, future[0].label]];
    for (let i = 0; i < future.length - 1; i++) {
      newPairs.push([future[i].label, future[i + 1].label]);
    }
    const expectedDelta = makeZeroCounts();
    for (const [from, to] of newPairs) expectedDelta[idx(from)][idx(to)]++;

    for (let i = 0; i < REGIME_LABELS.length; i++) {
      for (let j = 0; j < REGIME_LABELS.length; j++) {
        expect(fullMatrix.counts[i][j] - prefixMatrix.counts[i][j]).toBe(expectedDelta[i][j]);
      }
    }
  });

  it('prefix counts are invariant to which future is appended', () => {
    const prefix = makeHistory([U, U, D, R, U]);
    const prefixMatrix = buildTransitionMatrix(prefix);
    const matrixA = buildTransitionMatrix([...prefix, ...makeHistory([RegimeLabel.SHOCK, RegimeLabel.SHOCK])]);
    const matrixB = buildTransitionMatrix([...prefix, ...makeHistory([D, R, D, R])]);

    for (let i = 0; i < REGIME_LABELS.length; i++) {
      for (let j = 0; j < REGIME_LABELS.length; j++) {
        expect(matrixA.counts[i][j]).toBeGreaterThanOrEqual(prefixMatrix.counts[i][j]);
        expect(matrixB.counts[i][j]).toBeGreaterThanOrEqual(prefixMatrix.counts[i][j]);
      }
    }
  });

  it('truncating the last element removes only the last observed pair', () => {
    const full = FIXTURE;
    const truncated = buildTransitionMatrix(full.slice(0, -1));
    const fullMatrix = buildTransitionMatrix(full);

    const lastFrom = idx(full[full.length - 2].label);
    const lastTo = idx(full[full.length - 1].label);
    for (let i = 0; i < REGIME_LABELS.length; i++) {
      for (let j = 0; j < REGIME_LABELS.length; j++) {
        const delta = fullMatrix.counts[i][j] - truncated.counts[i][j];
        expect(delta).toBe(i === lastFrom && j === lastTo ? 1 : 0);
      }
    }
  });

  it('reversed history gives a DIFFERENT matrix (direction matters)', () => {
    const forward = buildTransitionMatrix(FIXTURE);
    const reversed = buildTransitionMatrix([...FIXTURE].reverse());
    expect(reversed.counts).not.toEqual(forward.counts);
  });
});

describe('buildTransitionMatrix — edge cases', () => {
  it('empty history: zero matrix and empty stats, no throw', () => {
    const m = buildTransitionMatrix([]);
    expect(m.totalTransitions).toBe(0);
    for (const row of m.counts) for (const c of row) expect(c).toBe(0);
    for (const label of REGIME_LABELS) {
      expect(m.persistence[label]).toBe(0);
      expect(m.entropy[label]).toBe(0);
      expect(m.avgDuration[label]).toBe(0);
      expect(m.hazard[label]).toBe(0);
    }
  });

  it('single element: no transitions, no throw', () => {
    const m = buildTransitionMatrix(makeHistory([U]));
    expect(m.totalTransitions).toBe(0);
    expect(m.avgDuration[U]).toBe(1);
  });

  it('determinism: same input produces identical output', () => {
    expect(buildTransitionMatrix(FIXTURE)).toEqual(buildTransitionMatrix(FIXTURE));
  });
});

describe('alphaDecayByRegime', () => {
  it('constant metric → zero decay', () => {
    const series = [{ regime: U, value: 1 }, { regime: U, value: 1 }, { regime: U, value: 1 }];
    expect(alphaDecayByRegime(series)[U]).toBeCloseTo(0, 12);
  });

  it('halving metric → decay ln(2) per step', () => {
    const series = [{ regime: U, value: 1 }, { regime: U, value: 0.5 }, { regime: U, value: 0.25 }];
    expect(alphaDecayByRegime(series)[U]).toBeCloseTo(Math.log(2), 12);
  });

  it('regimes with fewer than 2 observations → 0', () => {
    const decay = alphaDecayByRegime([{ regime: D, value: 1 }]);
    expect(decay[D]).toBe(0);
    expect(decay[U]).toBe(0);
  });

  it('empty series → all zeros, no throw', () => {
    const decay = alphaDecayByRegime([]);
    for (const label of REGIME_LABELS) expect(decay[label]).toBe(0);
  });
});
