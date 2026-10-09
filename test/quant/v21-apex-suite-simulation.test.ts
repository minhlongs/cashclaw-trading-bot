import { describe, it, expect } from 'vitest';
import { AvellanedaStoikovEngine } from '../../src/tree/quantlib/marketmaking/avellaneda-stoikov-engine';
import { EkopPinEngine } from '../../src/tree/quantlib/microstructure/ekop-pin-engine';
import { labelEvent } from '../../src/tree/alpha/labeling';
import { checkMinTrades, checkMinNetExpectancy } from '../../src/forest/alpha/gate/financial-checks';
import type { Candle } from '../../src/forest/backtest/ohlcv';

describe('Triad v21 Apex Suite End-to-End Simulation', () => {
  const asEngine = new AvellanedaStoikovEngine();
  const ekopEngine = new EkopPinEngine();

  it('runs unified market making, toxicity gating, event labeling, and gate verification', () => {
    // 1. Microstructure EKOP PIN toxicity gate
    const orderFlowBuckets = [
      { buys: 120, sells: 110 },
      { buys: 115, sells: 125 },
      { buys: 130, sells: 105 },
      { buys: 110, sells: 115 },
    ];
    const pinResult = ekopEngine.calculate(orderFlowBuckets);
    expect(pinResult.pin).toBeLessThan(0.4); // Safe toxicity level

    // 2. High-Frequency Market Making Quoting Engine
    const midPrice = 50000;
    const inventory = 2; // Long inventory
    const quote = asEngine.calculateQuote(midPrice, inventory, {
      gamma: 0.05,
      sigma: 0.015,
      timeRemaining: 0.5,
      kappa: 1.2,
    });

    expect(quote.reservationPrice).toBeLessThan(midPrice);
    expect(quote.bidPrice).toBeLessThan(quote.askPrice);

    // 3. Triple-Barrier Event Labeling with modularized engine
    const testCandles: Candle[] = [
      { timestamp: 1000, open: 50000, high: 50100, low: 49900, close: 50000, volume: 10 },
      { timestamp: 2000, open: 50000, high: 50600, low: 49950, close: 50550, volume: 15 },
      { timestamp: 3000, open: 50550, high: 51200, low: 50400, close: 51100, volume: 20 },
    ];

    const event = labelEvent(testCandles, 0, {
      takeProfitPct: 0.01,
      stopLossPct: 0.01,
      maxHoldingMs: 5000,
    });

    expect(event).not.toBeNull();
    expect(event?.label).toBe(1); // Take-profit hit

    // 4. Financial Gate Checks Modularization
    const tradeCheck = checkMinTrades(35, 30);
    const expectancyCheck = checkMinNetExpectancy(12.5, 0);

    expect(tradeCheck.passed).toBe(true);
    expect(expectancyCheck.passed).toBe(true);
  });
});
