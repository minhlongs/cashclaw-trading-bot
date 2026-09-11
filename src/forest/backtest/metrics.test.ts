import { describe, it, expect } from 'vitest';
import { buildTradesFromFills, buildEquity, computeSharpe } from './metrics';
import type { Fill } from './paper-exchange';
import type { Candle } from './ohlcv';

describe('buildTradesFromFills (Multi-Fill FIFO Unwinding)', () => {
  it('unwinds 3 buy steps with 1 aggregate sell without orphaning lots', () => {
    const fills: Fill[] = [
      { candleIndex: 0, timestamp: 1000, side: 'buy', price: 100, quantity: 1, fee: 0.1 },
      { candleIndex: 1, timestamp: 2000, side: 'buy', price: 90, quantity: 1, fee: 0.09 },
      { candleIndex: 2, timestamp: 3000, side: 'buy', price: 80, quantity: 1, fee: 0.08 },
      { candleIndex: 3, timestamp: 4000, side: 'sell', price: 110, quantity: 3, fee: 0.33 },
    ];

    const trades = buildTradesFromFills(fills, 0.1, 10000);

    expect(trades.length).toBe(3);

    // Lot 1
    expect(trades[0].entryPrice).toBe(100);
    expect(trades[0].exitPrice).toBe(110);
    expect(trades[0].quantity).toBe(1);
    expect(trades[0].fee).toBeCloseTo(0.1 + 0.11, 2);
    expect(trades[0].pnl).toBeCloseTo((110 - 100) * 1 - 0.21, 2);

    // Lot 2
    expect(trades[1].entryPrice).toBe(90);
    expect(trades[1].exitPrice).toBe(110);
    expect(trades[1].quantity).toBe(1);
    expect(trades[1].fee).toBeCloseTo(0.09 + 0.11, 2);
    expect(trades[1].pnl).toBeCloseTo((110 - 90) * 1 - 0.20, 2);

    // Lot 3
    expect(trades[2].entryPrice).toBe(80);
    expect(trades[2].exitPrice).toBe(110);
    expect(trades[2].quantity).toBe(1);
    expect(trades[2].fee).toBeCloseTo(0.08 + 0.11, 2);
    expect(trades[2].pnl).toBeCloseTo((110 - 80) * 1 - 0.19, 2);
  });

  it('handles partial fills and 1:1 round-trips identically', () => {
    const fills: Fill[] = [
      { candleIndex: 0, timestamp: 1000, side: 'buy', price: 100, quantity: 2, fee: 0.2 },
      { candleIndex: 1, timestamp: 2000, side: 'sell', price: 105, quantity: 1, fee: 0.105 },
      { candleIndex: 2, timestamp: 3000, side: 'sell', price: 110, quantity: 1, fee: 0.11 },
    ];

    const trades = buildTradesFromFills(fills, 0.1, 10000);
    expect(trades.length).toBe(2);
    expect(trades[0].quantity).toBe(1);
    expect(trades[0].exitPrice).toBe(105);
    expect(trades[1].quantity).toBe(1);
    expect(trades[1].exitPrice).toBe(110);
  });

  it('ignores sell fills with no matching open buy', () => {
    const fills: Fill[] = [
      { candleIndex: 0, timestamp: 1000, side: 'sell', price: 100, quantity: 1, fee: 0.1 },
    ];
    const trades = buildTradesFromFills(fills, 0.1, 10000);
    expect(trades.length).toBe(0);
  });

  it('computes equity curve and Sharpe ratio correctly', () => {
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 105, low: 95, close: 100, volume: 1000 },
      { timestamp: 2000, open: 100, high: 115, low: 100, close: 110, volume: 1000 },
    ];
    const fills: Fill[] = [
      { candleIndex: 0, timestamp: 1000, side: 'buy', price: 100, quantity: 1, fee: 0.1 },
      { candleIndex: 1, timestamp: 2000, side: 'sell', price: 110, quantity: 1, fee: 0.11 },
    ];
    const trades = buildTradesFromFills(fills, 0.1, 10000);
    const equity = buildEquity(10000, candles, trades);
    expect(equity.length).toBe(2);
    expect(equity[0].equity).toBe(10000);
    expect(equity[1].equity).toBeCloseTo(10000 + trades[0].pnl, 2);

    const sharpe = computeSharpe(equity);
    expect(typeof sharpe).toBe('number');
    expect(computeSharpe([])).toBe(0);
  });
});
