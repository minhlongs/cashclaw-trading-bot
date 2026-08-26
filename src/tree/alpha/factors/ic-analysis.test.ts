import { describe, expect, it } from 'vitest';
import { computeTurnover } from '@/tree/alpha/cross-sectional/turnover';
import { analyzeIc } from './ic-analysis';
import type { SymbolPanel } from './panel';

function makePanel(symbol: string, closes: readonly number[]): SymbolPanel {
  return {
    symbol,
    timestamps: Array.from({ length: closes.length }, (_, i) => i * 1000),
    open: closes,
    high: closes,
    low: closes,
    close: closes,
    volume: Array.from({ length: closes.length }, () => 1),
  };
}

/** Panel whose close grows at a constant per-bar rate → constant fwd return. */
function geometric(symbol: string, n: number, rate: number): SymbolPanel {
  return makePanel(symbol, Array.from({ length: n }, (_, i) => 100 * (1 + rate) ** i));
}

function constantScores(
  symbols: readonly string[],
  n: number,
  values: readonly number[],
): Record<string, (number | null)[]> {
  const out: Record<string, (number | null)[]> = {};
  symbols.forEach((s, i) => {
    out[s] = new Array<number | null>(n).fill(values[i]);
  });
  return out;
}

const SYMBOLS = ['A', 'B', 'C'] as const;

/** 3 symbols with constant per-bar returns 1%/2%/3% and scores 1/2/3. */
function perfectRankFixture(n: number) {
  const panels = [geometric('A', n, 0.01), geometric('B', n, 0.02), geometric('C', n, 0.03)];
  const scores = constantScores(SYMBOLS, n, [1, 2, 3]);
  return { panels, scores };
}

describe('analyzeIc — IC series', () => {
  it('perfect-rank fixture yields rankIC = 1 exactly at every valid rebalance', () => {
    const { panels, scores } = perfectRankFixture(5);
    const result = analyzeIc(panels, scores, { horizonBars: 1 });
    for (let i = 0; i < 4; i++) {
      expect(result.icSeries[i].rankIc).toBe(1);
      expect(result.icSeries[i].ic).toBeCloseTo(1, 10);
      expect(result.icSeries[i].validSymbols).toBe(3);
    }
  });

  it('trailing horizon bars produce null ICs (never extrapolated)', () => {
    const { panels, scores } = perfectRankFixture(5);
    const result = analyzeIc(panels, scores, { horizonBars: 1 });
    expect(result.icSeries).toHaveLength(5);
    expect(result.icSeries[4].ic).toBeNull();
    expect(result.icSeries[4].rankIc).toBeNull();
    expect(result.icSeries[4].validSymbols).toBe(0);
  });

  it('Pearson diverges from Spearman under a monotone outlier', () => {
    // 5 bars → 4 valid rebalances; fwd returns 1%, 2%, 1000%: ranks perfectly
    // aligned (rho=1) but the outlier drags the linear correlation down.
    const panels = [
      geometric('A', 5, 0.01),
      geometric('B', 5, 0.02),
      geometric('C', 5, 10),
    ];
    const scores = constantScores(SYMBOLS, 5, [1, 2, 3]);
    const result = analyzeIc(panels, scores, { horizonBars: 1 });
    expect(result.icSeries[0].rankIc).toBe(1);
    expect(result.icSeries[0].ic).toBeLessThan(0.9);
  });

  it('insufficient symbols at a date → null IC recorded honestly', () => {
    const { panels, scores } = perfectRankFixture(5);
    scores['C'][0] = null;
    const result = analyzeIc(panels, scores, { horizonBars: 1 });
    expect(result.icSeries[0].validSymbols).toBe(2);
    expect(result.icSeries[0].ic).toBeNull();
    expect(result.icSeries[0].rankIc).toBeNull();
    expect(result.validIcCount).toBe(3); // only i=1..3 remain valid
  });

  it('rebalanceStride thins the grid deterministically', () => {
    const { panels, scores } = perfectRankFixture(6);
    const result = analyzeIc(panels, scores, { horizonBars: 1, rebalanceStride: 2 });
    expect(result.icSeries.map((p) => p.timestamp)).toEqual([0, 2000, 4000]);
  });

  it('empty valid set → null summary stats', () => {
    const panels = [geometric('A', 1, 0.01), geometric('B', 1, 0.02), geometric('C', 1, 0.03)];
    const scores = constantScores(SYMBOLS, 1, [1, 2, 3]);
    const result = analyzeIc(panels, scores, { horizonBars: 1 });
    expect(result.icMean).toBeNull();
    expect(result.icStd).toBeNull();
    expect(result.icIr).toBeNull();
    expect(result.rankIcMean).toBeNull();
    expect(result.validIcCount).toBe(0);
  });
});

describe('analyzeIc — summary stats', () => {
  it('zero-variance IC series → IR null (flagged, not fabricated)', () => {
    const { panels, scores } = perfectRankFixture(5); // ic ≈ 1 at every valid date
    const result = analyzeIc(panels, scores, { horizonBars: 1 });
    expect(result.icMean).toBeCloseTo(1, 10);
    expect(result.icStd).toBe(0);
    expect(result.icIr).toBeNull();
  });

  it('stability = 1 when every rolling window shares the full-sample sign', () => {
    const { panels, scores } = perfectRankFixture(8);
    const result = analyzeIc(panels, scores, { horizonBars: 1, stabilityWindow: 2 });
    expect(result.stability).toBe(1);
  });

  it('flags <30 valid IC observations and clears the flag at ≥30', () => {
    const small = perfectRankFixture(5);
    expect(analyzeIc(small.panels, small.scores, { horizonBars: 1 }).insufficientIcObservations).toBe(true);
    const large = perfectRankFixture(35); // 34 valid points ≥ 30
    const result = analyzeIc(large.panels, large.scores, { horizonBars: 1 });
    expect(result.insufficientIcObservations).toBe(false);
    expect(result.validIcCount).toBe(34);
  });
});

describe('analyzeIc — quantile spread and turnover', () => {
  it('spread equals meanFwd(top) − meanFwd(bottom) exactly', () => {
    const panels = [
      geometric('A', 4, 0.01),
      geometric('B', 4, 0.02),
      geometric('C', 4, 0.03),
      geometric('D', 4, 0.04),
    ];
    const scores = constantScores(['A', 'B', 'C', 'D'], 4, [1, 2, 3, 4]);
    const result = analyzeIc(panels, scores, { horizonBars: 1, quantiles: 2 });
    // top {C,D}: (0.03+0.04)/2; bottom {A,B}: (0.01+0.02)/2 → spread 0.02.
    expect(result.quantileSpread[0].spread).toBeCloseTo(0.02, 10);
  });

  it('turnover matches direct computeTurnover on the same long-leg weights', () => {
    // 4 bars → 3 valid rebalances (i=3 is the trailing null).
    const panels = ['A', 'B', 'C', 'D'].map((s) => geometric(s, 4, 0.01));
    const scores: Record<string, (number | null)[]> = {
      A: [4, 1, 4, 0],
      B: [3, 2, 3, 0],
      C: [2, 3, 2, 0],
      D: [1, 4, 1, 0],
    };
    const result = analyzeIc(panels, scores, { horizonBars: 1, quantiles: 2 });
    // Top bucket rotates {A,B} → {C,D} → {A,B}.
    const wAB = { A: 0.5, B: 0.5 };
    const wCD = { C: 0.5, D: 0.5 };
    expect(result.quantileTurnover).toHaveLength(4);
    expect(result.quantileTurnover[0]).toBeCloseTo(computeTurnover({}, wAB), 12);
    expect(result.quantileTurnover[1]).toBeCloseTo(computeTurnover(wAB, wCD), 12);
    expect(result.quantileTurnover[2]).toBeCloseTo(computeTurnover(wCD, wAB), 12);
    expect(result.quantileTurnover[3]).toBeCloseTo(computeTurnover(wAB, {}), 12); // trailing null
    expect(result.quantileTurnover[1]).toBeCloseTo(1, 12); // full rotation
  });
});

describe('analyzeIc — regime breakdown', () => {
  it('groups valid ICs by injected timestamp labels', () => {
    const { panels, scores } = perfectRankFixture(5);
    const result = analyzeIc(panels, scores, {
      horizonBars: 1,
      regimeLabels: { 0: 'UP', 1000: 'UP', 2000: 'DOWN', 3000: 'DOWN' },
    });
    expect(result.regimeBreakdown).toEqual([
      { label: 'DOWN', icMean: expect.closeTo(1, 10), count: 2 },
      { label: 'UP', icMean: expect.closeTo(1, 10), count: 2 },
    ]);
  });

  it('returns an empty breakdown when no labels are supplied', () => {
    const { panels, scores } = perfectRankFixture(5);
    expect(analyzeIc(panels, scores, { horizonBars: 1 }).regimeBreakdown).toEqual([]);
  });
});

describe('analyzeIc — fail-closed validation', () => {
  it('rejects invalid config values', () => {
    const { panels, scores } = perfectRankFixture(5);
    expect(() => analyzeIc(panels, scores, { horizonBars: 0 })).toThrow(/horizonBars/);
    expect(() => analyzeIc(panels, scores, { horizonBars: 1, rebalanceStride: 0 })).toThrow(/rebalanceStride/);
    expect(() => analyzeIc(panels, scores, { horizonBars: 1, quantiles: 6 })).toThrow(/quantiles/);
    expect(() => analyzeIc(panels, scores, { horizonBars: 1, quantiles: 1 })).toThrow(/quantiles/);
    expect(() =>
      analyzeIc(panels, scores, { horizonBars: 1, minCrossSectionalSymbols: 1 }),
    ).toThrow(/minCrossSectionalSymbols/);
  });

  it('throws when a symbol has no score series', () => {
    const { panels } = perfectRankFixture(5);
    expect(() => analyzeIc(panels, {}, { horizonBars: 1 })).toThrow(/no score series for symbol 'A'/);
  });

  it('throws on score/panel length mismatch', () => {
    const { panels, scores } = perfectRankFixture(5);
    scores['A'] = [1, 2];
    expect(() => analyzeIc(panels, scores, { horizonBars: 1 })).toThrow(/length 2 !== panel length 5/);
  });

  it('rejects misaligned panels', () => {
    const a = geometric('A', 3, 0.01);
    const b = makePanel('B', [100, 101, 102]);
    const shifted: SymbolPanel = { ...b, timestamps: [0, 1000, 9999] };
    const scores = constantScores(['A', 'B'], 3, [1, 2]);
    expect(() => analyzeIc([a, shifted], scores, { horizonBars: 1 })).toThrow(/timestamp mismatch/);
  });
});
