// Tests for evaluate-validate: input validation at the seam boundary.
// Fail-closed: every error propagates without swallowing.

import { describe, it, expect } from 'vitest';
import { validateEvalInputs } from './evaluate-validate';
import type { PairPanel } from '@/tree/alpha/relative-value';
import type { RelativeValueEvalConfig } from './types';

const T0 = 1_700_000_000_000;
const N = 30;

function goodPanel(): PairPanel {
  return {
    legA: 'AAA',
    legB: 'BBB',
    timestamps: Array.from({ length: N }, (_, i) => T0 + i * 60_000),
    closesA: Array.from({ length: N }, (_, i) => 100 + i * 10),
    closesB: Array.from({ length: N }, (_, i) => 2 * (100 + i * 10)),
  };
}

function goodConfig(): RelativeValueEvalConfig {
  return {
    hedgeWindow: N,
    zWindow: 6,
    minObs: 10,
    entryZ: 2.0,
    exitZ: 0.5,
    maxHalfLife: 50,
    minCorrelation: 0.0,
    validationWindow: N,
    revalidateEvery: 10_000,
    costBps: 0,
    minObservations: 4,
    experimentId: 'E1',
    timeframe: '1h',
    periodsPerYear: 365 * 24,
  };
}

function badEntryExitConfig(): RelativeValueEvalConfig {
  return { ...goodConfig(), entryZ: 0.5, exitZ: 2.0 };
}

function benchSeries(ts: readonly number[], vals: readonly number[]) {
  return { symbol: 'benchmark', timestamps: ts, returns: vals };
}

describe('validateEvalInputs', () => {
  it('accepts valid panel + config', () => {
    expect(() => validateEvalInputs(goodPanel(), goodConfig())).not.toThrow();
  });

  it('rejects entryZ <= exitZ', () => {
    expect(() => validateEvalInputs(goodPanel(), badEntryExitConfig())).toThrow(
      'entryZ must be strictly greater than exitZ',
    );
  });

  it('rejects empty panel', () => {
    const panel: PairPanel = {
      legA: 'A', legB: 'B', timestamps: [], closesA: [], closesB: [],
    };
    expect(() => validateEvalInputs(panel, goodConfig())).toThrow('panel must be non-empty');
  });

  it('rejects non-finite periodsPerYear', () => {
    expect(() =>
      validateEvalInputs(goodPanel(), { ...goodConfig(), periodsPerYear: 0 }),
    ).toThrow('periodsPerYear');
  });

  it('rejects empty benchmarkReturns', () => {
    const config: RelativeValueEvalConfig = {
      ...goodConfig(),
      benchmarkReturns: benchSeries([], []),
    };
    expect(() => validateEvalInputs(goodPanel(), config)).toThrow(
      'benchmarkReturns must be non-empty',
    );
  });

  it('rejects mismatched benchmark lengths', () => {
    const config: RelativeValueEvalConfig = {
      ...goodConfig(),
      benchmarkReturns: benchSeries([1, 2, 3], [0.1]),
    };
    expect(() => validateEvalInputs(goodPanel(), config)).toThrow(
      'benchmarkReturns timestamps/returns length mismatch',
    );
  });

  it('rejects non-positive minObservations', () => {
    expect(() =>
      validateEvalInputs(goodPanel(), { ...goodConfig(), minObservations: 0 }),
    ).toThrow('minObservations');
  });

  it('rejects non-integer revalidateEvery', () => {
    expect(() =>
      validateEvalInputs(goodPanel(), { ...goodConfig(), revalidateEvery: 0.5 }),
    ).toThrow('revalidateEvery');
  });

  it('rejects empty experimentId', () => {
    expect(() =>
      validateEvalInputs(goodPanel(), { ...goodConfig(), experimentId: '' }),
    ).toThrow('experimentId');
  });

  it('rejects empty timeframe', () => {
    expect(() =>
      validateEvalInputs(goodPanel(), { ...goodConfig(), timeframe: '' }),
    ).toThrow('timeframe');
  });
});
