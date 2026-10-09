import { describe, expect, it } from 'vitest';
import { computeFoucaultRosuMicrostructure } from '@/tree/quantlib/microstructure/foucault-rosu-engine';

describe('Foucault-Roşu (2019) Fast-Trader Liquidity & High-Frequency Adverse Selection Microstructure Engine', () => {
  it('computes higher spread and sniping probability with high fast trader arrival rate', () => {
    const fastMarket = computeFoucaultRosuMicrostructure({
      fastTraderArrivalRate: 80,
      cancelRateSlowTraders: 20,
      fundamentalVolatility: 0.02,
      baseAssetPrice: 100,
      tickSize: 0.01,
      inventoryHoldingCost: 0.005,
    });

    const slowMarket = computeFoucaultRosuMicrostructure({
      fastTraderArrivalRate: 10,
      cancelRateSlowTraders: 50,
      fundamentalVolatility: 0.02,
      baseAssetPrice: 100,
      tickSize: 0.01,
      inventoryHoldingCost: 0.005,
    });

    expect(fastMarket.snipingProbability).toBeGreaterThan(slowMarket.snipingProbability);
    expect(fastMarket.equilibriumSpreadBps).toBeGreaterThan(slowMarket.equilibriumSpreadBps);
    expect(fastMarket.fastTraderRentBps).toBeGreaterThan(slowMarket.fastTraderRentBps);
    expect(fastMarket.effectiveDepthFactor).toBeLessThan(slowMarket.effectiveDepthFactor);
  });

  it('respects minimum tick size constraint when volatility and arrival rates are low', () => {
    const res = computeFoucaultRosuMicrostructure({
      fastTraderArrivalRate: 0,
      cancelRateSlowTraders: 50,
      fundamentalVolatility: 0.0001,
      baseAssetPrice: 100,
      tickSize: 0.05,
      inventoryHoldingCost: 0,
    });

    expect(res.snipingProbability).toBe(0);
    expect(res.adverseSelectionShare).toBe(0);
    expect(res.equilibriumSpreadBps).toBeCloseTo(5.0, 2);
  });

  it('computes adverse selection share cleanly', () => {
    const res = computeFoucaultRosuMicrostructure({
      fastTraderArrivalRate: 50,
      cancelRateSlowTraders: 50,
      fundamentalVolatility: 0.03,
      baseAssetPrice: 150,
      tickSize: 0.01,
      inventoryHoldingCost: 0.01,
    });

    expect(res.snipingProbability).toBe(0.5);
    expect(res.adverseSelectionShare).toBeGreaterThan(0.5);
    expect(res.adverseSelectionShare).toBeLessThanOrEqual(1.0);
  });
});
