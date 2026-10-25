import { describe, it, expect } from 'vitest';
import { HasbrouckVarEngine } from '@/tree/quantlib/microstructure/hasbrouck-var-engine';
import type { TradeObservation } from '@/tree/quantlib/microstructure/hasbrouck-var-engine';

describe('Hasbrouck (1991) Vector Autoregressive Trade Informativeness Engine', () => {
  const engine = new HasbrouckVarEngine();

  it('throws an error if fewer than 4 trade observations are provided', () => {
    const fewTrades: TradeObservation[] = [
      { midPrice: 100, tradeSign: 1 },
      { midPrice: 100.2, tradeSign: 1 },
      { midPrice: 100.1, tradeSign: -1 },
    ];
    expect(() => engine.calculate(fewTrades)).toThrow('at least 4 trade observations');
  });

  it('correctly calculates price impact and information share under buyer-initiated pressure', () => {
    const trades: TradeObservation[] = [
      { midPrice: 100.0, tradeSign: 1, volume: 10 },
      { midPrice: 100.1, tradeSign: 1, volume: 15 },
      { midPrice: 100.25, tradeSign: 1, volume: 20 },
      { midPrice: 100.3, tradeSign: -1, volume: 5 },
      { midPrice: 100.45, tradeSign: 1, volume: 25 },
      { midPrice: 100.6, tradeSign: 1, volume: 30 },
    ];

    const result = engine.calculate(trades);

    expect(result.sampleCount).toBe(5);
    expect(result.priceImpactFactor).toBeGreaterThan(0);
    expect(result.permanentPriceImpact).toBeGreaterThan(0);
    expect(result.informationShare).toBeGreaterThanOrEqual(0);
    expect(result.informationShare).toBeLessThanOrEqual(1);
  });

  it('handles negative price impact under seller-initiated pressure', () => {
    const sellTrades: TradeObservation[] = [
      { midPrice: 100.0, tradeSign: -1, volume: 10 },
      { midPrice: 99.8, tradeSign: -1, volume: 15 },
      { midPrice: 99.6, tradeSign: -1, volume: 20 },
      { midPrice: 99.5, tradeSign: 1, volume: 5 },
      { midPrice: 99.2, tradeSign: -1, volume: 30 },
    ];

    const result = engine.calculate(sellTrades);

    expect(result.sampleCount).toBe(4);
    // Negative trade shocks causing downward price revision yield positive covariance with positive sign
    expect(result.priceImpactFactor).toBeGreaterThan(0);
    expect(result.permanentPriceImpact).toBeGreaterThan(0);
    expect(result.informationShare).toBeGreaterThanOrEqual(0);
    expect(result.informationShare).toBeLessThanOrEqual(1);
  });
});
