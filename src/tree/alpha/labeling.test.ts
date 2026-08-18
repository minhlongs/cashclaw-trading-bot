// Alpha Lab — Triple-Barrier Labeling Tests

import { describe, it, expect } from 'vitest';
import { labelEvent, type BarrierConfig } from './labeling';
import type { Candle } from '@/forest/backtest/ohlcv';

const DEFAULT_CONFIG: BarrierConfig = {
  takeProfitPct: 0.02,
  stopLossPct: 0.01,
  maxHoldingMs: 5 * 60 * 1000,
};

const BASE_TS = 1_700_000_000_000;

function c(ts: number, high: number, low: number, close: number): Candle {
  return { timestamp: ts, open: close, high, low, close, volume: 100 };
}

const base = (ts = BASE_TS) => c(ts, 100, 99, 100);

describe('labelEvent', () => {
  it('returns null for out-of-bounds entryIdx', () => {
    expect(labelEvent([base()], -1, DEFAULT_CONFIG)).toBeNull();
    expect(labelEvent([base()], 5, DEFAULT_CONFIG)).toBeNull();
  });

  it('returns null for empty candle list', () => {
    expect(labelEvent([], 0, DEFAULT_CONFIG)).toBeNull();
  });

  it('returns null when entry price is zero', () => {
    const cs: Candle[] = [c(BASE_TS, 0, 0, 0), c(BASE_TS + 1000, 101, 99, 100)];
    expect(labelEvent(cs, 0, DEFAULT_CONFIG)).toBeNull();
  });

  it('TP first — labels 1', () => {
    // high=103 → 3% > 2% TP; low=99.5 avoids SL
    const cs: Candle[] = [base(), c(BASE_TS + 1000, 103, 99.5, 102)];
    const r = labelEvent(cs, 0, DEFAULT_CONFIG)!;
    expect(r.label).toBe(1);
    expect(r.exitPrice).toBeCloseTo(102, 8);
    expect(r.pnl).toBeCloseTo(2, 8);
    expect(r.duration).toBe(1000);
  });

  it('SL first — labels -1', () => {
    // low=98.5 → 1.5% > 1% SL; high=100 avoids TP
    const cs: Candle[] = [base(), c(BASE_TS + 1000, 100, 98.5, 99)];
    const r = labelEvent(cs, 0, DEFAULT_CONFIG)!;
    expect(r.label).toBe(-1);
    expect(r.exitPrice).toBeCloseTo(99, 8);
    expect(r.pnl).toBeCloseTo(-1, 8);
  });

  it('simultaneous TP/SL → label 0', () => {
    // high=103 (3% > TP), low=98 (2% > SL)
    const cs: Candle[] = [base(), c(BASE_TS + 1000, 103, 98, 100)];
    expect(labelEvent(cs, 0, DEFAULT_CONFIG)!.label).toBe(0);
  });

  it('timeout — labels 0 when maxHoldingMs exceeded', () => {
    const cs: Candle[] = [base(), c(BASE_TS + 6 * 60_000, 100.5, 99.5, 100.3)];
    const r = labelEvent(cs, 0, DEFAULT_CONFIG)!;
    expect(r.label).toBe(0);
    expect(r.duration).toBe(0); // no candle within window
  });

  it('timeout — uses last candle within window as exit', () => {
    const cs: Candle[] = [
      base(),
      c(BASE_TS + 2000, 100.5, 99.5, 100.3),  // within window
      c(BASE_TS + 7 * 60_000, 100.5, 99.5, 100.4), // past window
    ];
    const r = labelEvent(cs, 0, DEFAULT_CONFIG)!;
    expect(r.label).toBe(0);
    expect(r.exitTimestamp).toBe(BASE_TS + 2000);
    expect(r.exitPrice).toBeCloseTo(100.3, 8);
  });

  it('handles large timestamp gaps without breaking', () => {
    const cs: Candle[] = [base(), c(BASE_TS + 7_200_000, 100.5, 99.5, 100.3)];
    expect(labelEvent(cs, 0, DEFAULT_CONFIG)!.label).toBe(0);
  });

  it('resolves barrier across candles with gaps', () => {
    const cs: Candle[] = [
      base(),
      c(BASE_TS + 1000, 100.1, 99.9, 100.05),
      c(BASE_TS + 4 * 60_000, 103, 99.5, 102),
    ];
    expect(labelEvent(cs, 0, DEFAULT_CONFIG)!.label).toBe(1);
  });

  it('works correctly near Unix epoch', () => {
    const nearZero = 1000;
    const cs: Candle[] = [
      c(nearZero, 100, 99, 100),
      c(nearZero + 1000, 103, 99.5, 102),
    ];
    const r = labelEvent(cs, 0, DEFAULT_CONFIG)!;
    expect(r.label).toBe(1);
    expect(r.entryTimestamp).toBe(nearZero);
  });

  it('handles large timestamps gracefully', () => {
    const largeTs = 4_000_000_000_000;
    const cs: Candle[] = [
      c(largeTs, 100, 99, 100),
      c(largeTs + 3000, 102.5, 99.5, 102),
    ];
    const r = labelEvent(cs, 0, DEFAULT_CONFIG)!;
    expect(r.label).toBe(1);
    expect(r.exitTimestamp).toBe(largeTs + 3000);
  });

  it('includes last candle if its timestamp passes threshold', () => {
    const cs: Candle[] = [base(), c(BASE_TS + 3000, 103, 99.5, 102)];
    const r = labelEvent(cs, 0, DEFAULT_CONFIG)!;
    expect(r.label).toBe(1);
    expect(r.exitTimestamp).toBe(BASE_TS + 3000);
  });

  it('returns null when only entry candle exists', () => {
    expect(labelEvent([base()], 0, DEFAULT_CONFIG)).toBeNull();
  });

  it('returns null when candles run out without resolving', () => {
    const cs: Candle[] = [
      base(),
      c(BASE_TS + 1000, 100.5, 99.5, 100.3),
      c(BASE_TS + 2000, 100.5, 99.5, 100.3),
    ];
    expect(labelEvent(cs, 0, DEFAULT_CONFIG)).toBeNull();
  });

  it('TP at exactly the threshold', () => {
    const cs: Candle[] = [base(), c(BASE_TS + 1000, 102, 99.5, 101)];
    expect(labelEvent(cs, 0, DEFAULT_CONFIG)!.label).toBe(1);
  });

  it('SL at exactly the threshold', () => {
    const cs: Candle[] = [base(), c(BASE_TS + 1000, 100.5, 99, 99.5)];
    expect(labelEvent(cs, 0, DEFAULT_CONFIG)!.label).toBe(-1);
  });
});
