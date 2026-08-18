// Integration tests for triple-barrier labeling on synthetic candles.
import { describe, it, expect } from 'vitest';
import { labelEvent, type BarrierConfig } from '@/tree/alpha/labeling';
import type { Candle } from '@/forest/backtest/ohlcv';

const CONFIG: BarrierConfig = {
  takeProfitPct: 0.02,
  stopLossPct: 0.01,
  maxHoldingMs: 30 * 60_000, // 30 min
};

const BASE_TS = 1_700_000_000_000;

function c(ts: number, open: number, high: number, low: number, close: number): Candle {
  return { timestamp: ts, open, high, low, close, volume: 100 };
}

describe('labeling integration', () => {
  it('trending up with high TP → TAKE_PROFIT label', () => {
    const candles: Candle[] = [
      c(BASE_TS, 100, 100, 99.5, 100),
      c(BASE_TS + 60_000, 100, 103.5, 99.8, 103),
      c(BASE_TS + 120_000, 103, 103, 102.5, 102.8),
    ];
    const ev = labelEvent(candles, 0, { ...CONFIG, takeProfitPct: 0.02 });
    expect(ev).not.toBeNull();
    expect(ev!.label).toBe(1);
  });

  it('trending down with low SL → STOP_LOSS label', () => {
    const candles: Candle[] = [
      c(BASE_TS, 100, 100, 99.5, 100),
      c(BASE_TS + 60_000, 100, 100.2, 98.9, 99),
    ];
    const ev = labelEvent(candles, 0, { ...CONFIG, stopLossPct: 0.01 });
    expect(ev).not.toBeNull();
    expect(ev!.label).toBe(-1);
  });

  it('short timeout → timeout label when maxHoldingMs expires before barriers', () => {
    const candles: Candle[] = [];
    let ts = BASE_TS;
    let close = 100;
    for (let i = 0; i < 10; i++) {
      const open = close;
      close = open + 0.05;
      candles.push(c(ts, open, open + 0.1, open - 0.1, close));
      ts += 60_000;
    }
    const ev = labelEvent(candles, 0, {
      takeProfitPct: 0.5,
      stopLossPct: 0.5,
      maxHoldingMs: 180_000, // 3 min
    });
    expect(ev).not.toBeNull();
    expect(ev!.label).toBe(0);
  });

  it('labels are causal (no future data used)', () => {
    // Build candles with a TP hit only visible at the last bar
    const candles: Candle[] = [
      c(BASE_TS, 100, 100, 99.5, 100),
      c(BASE_TS + 60_000, 100, 100, 99.5, 99.8),
      c(BASE_TS + 120_000, 99.8, 103, 99.5, 103),
    ];
    const ev = labelEvent(candles, 0, { ...CONFIG, takeProfitPct: 0.02 });
    expect(ev).not.toBeNull();
    expect(ev!.label).toBe(1);
    // TP hit at bar index 2 — label should reference bar 2 price, not future
    expect(ev!.exitTimestamp).toBe(BASE_TS + 120_000);
  });
});