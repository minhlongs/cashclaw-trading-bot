import { describe, expect, it } from 'vitest';
import {
  buildForwardReturnSeries,
  materializeVwap,
  validateAlignedPanels,
  validateSymbolPanel,
  type SymbolPanel,
} from './panel';

function makePanel(symbol: string, closes: readonly number[], overrides?: Partial<SymbolPanel>): SymbolPanel {
  const n = closes.length;
  return {
    symbol,
    timestamps: Array.from({ length: n }, (_, i) => i * 1000),
    open: closes,
    high: closes,
    low: closes,
    close: closes,
    volume: Array.from({ length: n }, () => 1),
    ...overrides,
  };
}

describe('validateSymbolPanel', () => {
  it('accepts a valid panel', () => {
    expect(() => validateSymbolPanel(makePanel('A', [1, 2, 3]))).not.toThrow();
  });

  it('throws on empty timestamps', () => {
    expect(() => validateSymbolPanel(makePanel('A', []))).toThrow(/empty timestamps/);
  });

  it('throws on field length mismatch', () => {
    const panel = makePanel('A', [1, 2, 3], { open: [1, 2] });
    expect(() => validateSymbolPanel(panel)).toThrow(/'open' length 2 !== timestamps length 3/);
  });

  it('throws on vwap length mismatch', () => {
    const panel = makePanel('A', [1, 2, 3], { vwap: [1, 2] });
    expect(() => validateSymbolPanel(panel)).toThrow(/'vwap' length 2 !== timestamps length 3/);
  });

  it('throws on non-strictly-increasing timestamps', () => {
    const panel = makePanel('A', [1, 2, 3], { timestamps: [1000, 2000, 2000] });
    expect(() => validateSymbolPanel(panel)).toThrow(/not strictly increasing/);
  });

  it('throws on non-finite timestamp', () => {
    const panel = makePanel('A', [1, 2], { timestamps: [1000, Number.NaN] });
    expect(() => validateSymbolPanel(panel)).toThrow(/non-finite timestamp/);
  });

  it('throws on non-finite OHLCV value', () => {
    const panel = makePanel('A', [1, Number.POSITIVE_INFINITY]);
    expect(() => validateSymbolPanel(panel)).toThrow(/non-finite value at index 1/);
  });

  it('throws on non-finite vwap value', () => {
    const panel = makePanel('A', [1, 2], { vwap: [1, Number.NaN] });
    expect(() => validateSymbolPanel(panel)).toThrow(/'vwap' has non-finite value at index 1/);
  });
});

describe('materializeVwap', () => {
  it('falls back to typical price (o+h+l+c)/4 when vwap absent', () => {
    const panel = makePanel('A', [4], { open: [1], high: [2], low: [3], close: [4] });
    expect(materializeVwap(panel)).toEqual([2.5]);
  });

  it('uses the supplied vwap verbatim when present', () => {
    const panel = makePanel('A', [4, 8], { vwap: [3.5, 7.5] });
    expect(materializeVwap(panel)).toEqual([3.5, 7.5]);
  });

  it('throws on an invalid panel', () => {
    const panel = makePanel('A', [1, 2], { timestamps: [2000, 1000] });
    expect(() => materializeVwap(panel)).toThrow(/not strictly increasing/);
  });
});

describe('buildForwardReturnSeries', () => {
  it('computes exact h-bar forward returns with trailing nulls', () => {
    const series = buildForwardReturnSeries(makePanel('A', [100, 110, 121, 133.1]), 2);
    expect(series.symbol).toBe('A');
    expect(series.timestamps).toEqual([0, 1000, 2000, 3000]);
    expect(series.forwardReturns[0]).toBeCloseTo(0.21, 12);
    expect(series.forwardReturns[1]).toBeCloseTo(0.21, 12);
    expect(series.forwardReturns[2]).toBeNull();
    expect(series.forwardReturns[3]).toBeNull();
  });

  it('computes h=1 returns exactly', () => {
    const series = buildForwardReturnSeries(makePanel('A', [100, 110, 121]), 1);
    expect(series.forwardReturns[0]).toBeCloseTo(0.1, 12);
    expect(series.forwardReturns[1]).toBeCloseTo(0.1, 12);
    expect(series.forwardReturns[2]).toBeNull();
  });

  it('yields null when the base close is zero (fail-closed)', () => {
    const series = buildForwardReturnSeries(makePanel('A', [0, 100, 110]), 1);
    expect(series.forwardReturns[0]).toBeNull();
    expect(series.forwardReturns[1]).toBeCloseTo(0.1, 12);
  });

  it('rejects non-positive or non-integer horizons', () => {
    const panel = makePanel('A', [1, 2]);
    expect(() => buildForwardReturnSeries(panel, 0)).toThrow(/positive integer/);
    expect(() => buildForwardReturnSeries(panel, -1)).toThrow(/positive integer/);
    expect(() => buildForwardReturnSeries(panel, 1.5)).toThrow(/positive integer/);
  });

  it('rejects an invalid panel', () => {
    const panel = makePanel('A', [1, Number.NaN]);
    expect(() => buildForwardReturnSeries(panel, 1)).toThrow(/non-finite value/);
  });
});

describe('validateAlignedPanels', () => {
  it('accepts panels sharing one timestamp grid', () => {
    expect(() =>
      validateAlignedPanels([makePanel('A', [1, 2]), makePanel('B', [3, 4])]),
    ).not.toThrow();
  });

  it('throws on empty input', () => {
    expect(() => validateAlignedPanels([])).toThrow(/non-empty/);
  });

  it('rejects length-mismatched panels', () => {
    expect(() =>
      validateAlignedPanels([makePanel('A', [1, 2, 3]), makePanel('B', [1, 2])]),
    ).toThrow(/'B' length 2 !== reference length 3/);
  });

  it('rejects timestamp-value-mismatched panels', () => {
    const b = makePanel('B', [1, 2], { timestamps: [0, 9999] });
    expect(() => validateAlignedPanels([makePanel('A', [1, 2]), b])).toThrow(
      /'B' timestamp mismatch at index 1/,
    );
  });

  it('rejects an individually invalid panel', () => {
    const bad = makePanel('B', [1, 2], { timestamps: [2000, 1000] });
    expect(() => validateAlignedPanels([makePanel('A', [1, 2]), bad])).toThrow(
      /not strictly increasing/,
    );
  });
});
