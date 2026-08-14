import { describe, it, expect } from 'vitest';
import { buildTradesFromFills, buildEquity, computeSharpe } from './metrics';
import type { Candle } from './ohlcv';
import type { BacktestTrade, BacktestEquityPoint } from './types';
import type { Fill } from './paper-exchange';
function mkFill(side: 'buy' | 'sell', price: number, qty: number, o: Partial<Fill> = {}): Fill {
  return { candleIndex: 0, timestamp: 0, fee: 0, side, price, quantity: qty, ...o };
}
function mkCandle(close: number, ts = 0): Candle {
  return { timestamp: ts, open: close, high: close, low: close, close, volume: 1 };
}
function mkTrade(o: Partial<BacktestTrade>): BacktestTrade {
  return { entryTimestamp: 0, exitTimestamp: 0, side: 'buy', entryPrice: 100, exitPrice: 100, quantity: 1, pnl: 0, fee: 0, pnlPct: 0, holdingMinutes: 0, ...o };
}
// ── buildTradesFromFills ─────────────────────────
describe('buildTradesFromFills', () => {
  it('returns empty for no fills', () => {
    expect(buildTradesFromFills([], 0, 0)).toEqual([]);
  });

  it('FIFO pairs buy then sell with correct fields', () => {
    const fills = [mkFill('buy', 100, 1, { timestamp: 1 }), mkFill('sell', 110, 1, { timestamp: 2 })];
    const t = buildTradesFromFills(fills, 0, 0);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ entryPrice: 100, exitPrice: 110, side: 'buy', entryTimestamp: 1, exitTimestamp: 2 });
  });

  it('uses Fill.fee and computes PnL net of fees', () => {
    const fills = [mkFill('buy', 100, 2, { timestamp: 1, fee: 0.2 }), mkFill('sell', 120, 2, { timestamp: 2, fee: 0.24 })];
    const t = buildTradesFromFills(fills, 0.05, 1000);
    expect(t[0]!.fee).toBeCloseTo(0.44);
    expect(t[0]!.pnl).toBeCloseTo(39.56);
  });

  it('skips sells with no pending buy (no shorts)', () => {
    const fills = [mkFill('sell', 200, 1, { timestamp: 1 }), mkFill('buy', 180, 1, { timestamp: 2 })];
    expect(buildTradesFromFills(fills, 0, 1000)).toEqual([]);
  });

  it('uses buy.quantity for partial fills', () => {
    const fills = [mkFill('buy', 100, 2, { timestamp: 1 }), mkFill('sell', 110, 1, { timestamp: 2 })];
    const t = buildTradesFromFills(fills, 0, 1000);
    expect(t[0]!.quantity).toBe(2);
    expect(t[0]!.pnl).toBeCloseTo(20);
  });

  it('skips unpaired buys and FIFO matches oldest first', () => {
    expect(buildTradesFromFills([mkFill('buy', 100, 1, { timestamp: 1 })], 0, 1000)).toEqual([]);
    const fills = [
      mkFill('buy', 100, 1, { timestamp: 1 }),
      mkFill('buy', 150, 1, { timestamp: 2 }),
      mkFill('sell', 200, 1, { timestamp: 3 }),
    ];
    const t = buildTradesFromFills(fills, 0, 1000);
    expect(t[0]!.entryPrice).toBe(100);
  });

  it('handles multiple round trips', () => {
    const fills = [
      mkFill('buy', 100, 1, { timestamp: 1 }), mkFill('sell', 120, 1, { timestamp: 2 }),
      mkFill('buy', 80, 1, { timestamp: 3 }), mkFill('sell', 90, 1, { timestamp: 4 }),
    ];
    const t = buildTradesFromFills(fills, 0, 1000);
    expect(t).toHaveLength(2);
    expect(t[0]!.pnl).toBeCloseTo(20);
    expect(t[1]!.pnl).toBeCloseTo(10);
  });

  it('computes holdingMinutes and clamps negatives', () => {
    const t1 = buildTradesFromFills([mkFill('buy', 100, 1, { timestamp: 0 }), mkFill('sell', 110, 1, { timestamp: 120_000 })], 0, 1000);
    expect(t1[0]!.holdingMinutes).toBe(2);
    const t2 = buildTradesFromFills([mkFill('buy', 100, 1, { timestamp: 200 }), mkFill('sell', 110, 1, { timestamp: 100 })], 0, 1000);
    expect(t2[0]!.holdingMinutes).toBe(0);
  });

  it('handles zero fee and zero buy price', () => {
    const t1 = buildTradesFromFills([mkFill('buy', 50, 10, { fee: 0 }), mkFill('sell', 55, 10, { fee: 0 })], 0, 1000);
    expect(t1[0]!.fee).toBe(0);
    expect(t1[0]!.pnl).toBeCloseTo(50);
    const t2 = buildTradesFromFills([mkFill('buy', 0, 1), mkFill('sell', 100, 1)], 0, 1000);
    expect(t2[0]!.pnlPct).toBe(0);
  });
});
describe('buildEquity', () => {
  it('returns empty when no candles', () => {
    expect(buildEquity(1000, [], [])).toEqual([]);
  });

  it('starts equity at capitalStart', () => {
    const curve = buildEquity(1000, [mkCandle(100, 1)], []);
    expect(curve[0]).toMatchObject({ equity: 1000, drawdownPct: 0 });
  });

  it('adds realized PnL at exit timestamp', () => {
    const curve = buildEquity(1000, [mkCandle(100, 1), mkCandle(110, 2)], [mkTrade({ exitTimestamp: 2, pnl: 10 })]);
    expect(curve[0]!.equity).toBe(1000);
    expect(curve[1]!.equity).toBe(1010);
  });

  it('reports drawdown when equity drops from peak', () => {
    const trades = [mkTrade({ exitTimestamp: 1, pnl: 10 }), mkTrade({ exitTimestamp: 2, pnl: 0 }), mkTrade({ exitTimestamp: 3, pnl: -30 })];
    const curve = buildEquity(1000, [mkCandle(100, 1), mkCandle(110, 2), mkCandle(120, 3)], trades);
    expect(curve[2]!.drawdownPct).toBeCloseTo((1010 - 980) / 1010 * 100);
  });

  it('reports negative dd when equity rises above old maxEq (dd computed before update)', () => {
    const curve = buildEquity(1000, [mkCandle(100, 1), mkCandle(110, 2)], [mkTrade({ exitTimestamp: 1, pnl: 10 })]);
    expect(curve[0]!.drawdownPct).toBeCloseTo(-1);
    expect(curve[1]!.drawdownPct).toBeCloseTo(0);
  });

  it('drawdown is 0 when maxEq is 0', () => {
    const curve = buildEquity(0, [mkCandle(100, 1), mkCandle(100, 2)], [mkTrade({ exitTimestamp: 1, pnl: -100 }), mkTrade({ exitTimestamp: 2, pnl: -200 })]);
    expect(curve[0]!.drawdownPct).toBe(0);
    expect(curve[1]!.drawdownPct).toBe(0);
  });

  it('does not credit trades not yet exited', () => {
    const curve = buildEquity(1000, [mkCandle(100, 1)], [mkTrade({ exitTimestamp: 5, pnl: 100 })]);
    expect(curve[0]!.equity).toBe(1000);
  });
});

// ── computeSharpe ────────────────────────────────
describe('computeSharpe', () => {
  it('returns 0 for empty or single-point curve', () => {
    expect(computeSharpe([])).toBe(0);
    expect(computeSharpe([{ timestamp: 1, equity: 1000, drawdownPct: 0 }])).toBe(0);
  });

  it('returns 0 when std is 0 (constant equity)', () => {
    const curve: BacktestEquityPoint[] = [
      { timestamp: 1, equity: 1000, drawdownPct: 0 },
      { timestamp: 2, equity: 1000, drawdownPct: 0 },
      { timestamp: 3, equity: 1000, drawdownPct: 0 },
    ];
    expect(computeSharpe(curve)).toBe(0);
  });

  it('returns positive Sharpe for steadily increasing equity', () => {
    const curve: BacktestEquityPoint[] = [
      { timestamp: 1, equity: 1000, drawdownPct: 0 },
      { timestamp: 2, equity: 1010, drawdownPct: 0 },
      { timestamp: 3, equity: 1020, drawdownPct: 0 },
      { timestamp: 4, equity: 1030, drawdownPct: 0 },
    ];
    expect(computeSharpe(curve)).toBeGreaterThan(0);
  });

  it('returns negative Sharpe for steadily decreasing equity', () => {
    const curve: BacktestEquityPoint[] = [
      { timestamp: 1, equity: 1000, drawdownPct: 0 },
      { timestamp: 2, equity: 990, drawdownPct: 0 },
      { timestamp: 3, equity: 980, drawdownPct: 0 },
      { timestamp: 4, equity: 970, drawdownPct: 0 },
    ];
    expect(computeSharpe(curve)).toBeLessThan(0);
  });

  it('skips zero-prev transitions and requires 2+ non-zero returns', () => {
    // 0→100 skipped; 100→110 = +0.1 → single return → std=0 → 0
    expect(computeSharpe([
      { timestamp: 1, equity: 0, drawdownPct: 0 },
      { timestamp: 2, equity: 100, drawdownPct: 0 },
      { timestamp: 3, equity: 110, drawdownPct: 0 },
    ])).toBe(0);
    // mid-curve zero: 1000→0 skipped; 0→100 skipped; 100→200 = +1.0 → single return → 0
    expect(computeSharpe([
      { timestamp: 1, equity: 1000, drawdownPct: 0 },
      { timestamp: 2, equity: 0, drawdownPct: 100 },
      { timestamp: 3, equity: 100, drawdownPct: 0 },
      { timestamp: 4, equity: 200, drawdownPct: 0 },
    ])).toBe(0);
  });

  it('annualization uses sqrt(8760)', () => {
    const curve: BacktestEquityPoint[] = [
      { timestamp: 1, equity: 1000, drawdownPct: 0 },
      { timestamp: 2, equity: 1100, drawdownPct: 0 },
      { timestamp: 3, equity: 1050, drawdownPct: 0 },
    ];
    const rets = [0.1, (1050 - 1100) / 1100];
    const mean = (rets[0] + rets[1]) / 2;
    const variance = ((rets[0] - mean) ** 2 + (rets[1] - mean) ** 2) / 2;
    expect(computeSharpe(curve)).toBeCloseTo((mean / Math.sqrt(variance)) * Math.sqrt(8760));
  });

  it('produces valid numeric result with mixed returns', () => {
    const s = computeSharpe([
      { timestamp: 1, equity: 100, drawdownPct: 0 },
      { timestamp: 2, equity: 120, drawdownPct: 0 },
      { timestamp: 3, equity: 90, drawdownPct: 0 },
      { timestamp: 4, equity: 150, drawdownPct: 0 },
    ]);
    expect(typeof s).toBe('number');
    expect(s).not.toBeNaN();
  });
});
