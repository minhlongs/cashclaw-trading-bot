import { describe, expect, it } from 'vitest';
import { computeRosuOrderBook } from '@/tree/quantlib/microstructure/rosu-orderbook-engine';
import type { RosuOrderBookParams } from '@/tree/quantlib/microstructure/rosu-orderbook-engine';

describe('Roşu (2009) Dynamic Limit Order Book Choice & Endogenous Liquidity Engine', () => {
  const baseParams: RosuOrderBookParams = {
    arrivalIntensity: 2.0,
    impatienceDiscountRate: 0.1,
    tickSize: 0.01,
    orderSize: 10,
    volatility: 0.02,
    depthLevels: 5,
  };

  it('computes endogenous equilibrium spread greater than tick size', () => {
    const res = computeRosuOrderBook(baseParams);
    expect(res.equilibriumSpread).toBeGreaterThanOrEqual(baseParams.tickSize);
    expect(res.probLimitFillBeforeCancel).toBeGreaterThan(0);
    expect(res.probLimitFillBeforeCancel).toBeLessThanOrEqual(1.0);
    expect(res.expectedWaitingTimeSec).toBeGreaterThan(0);
    expect(res.immediacyPremiumBps).toBeGreaterThan(0);
  });

  it('spread widens as impatience discount rate increases', () => {
    const patientRes = computeRosuOrderBook({ ...baseParams, impatienceDiscountRate: 0.05 });
    const impatientRes = computeRosuOrderBook({ ...baseParams, impatienceDiscountRate: 0.5 });
    expect(impatientRes.equilibriumSpread).toBeGreaterThan(patientRes.equilibriumSpread);
    expect(impatientRes.immediacyPremiumBps).toBeGreaterThan(patientRes.immediacyPremiumBps);
  });

  it('spread narrows and fill probability increases with higher order arrival intensity', () => {
    const lowArrival = computeRosuOrderBook({ ...baseParams, arrivalIntensity: 1.0 });
    const highArrival = computeRosuOrderBook({ ...baseParams, arrivalIntensity: 10.0 });
    expect(highArrival.equilibriumSpread).toBeLessThan(lowArrival.equilibriumSpread);
    expect(highArrival.probLimitFillBeforeCancel).toBeGreaterThan(lowArrival.probLimitFillBeforeCancel);
    expect(highArrival.expectedWaitingTimeSec).toBeLessThan(lowArrival.expectedWaitingTimeSec);
  });

  it('constructs geometrically expanding depth profile across ticks', () => {
    const res = computeRosuOrderBook(baseParams);
    expect(res.depthProfile.length).toBe(5);
    expect(res.depthProfile[0]).toBe(10);
    for (let i = 1; i < res.depthProfile.length; i++) {
      expect(res.depthProfile[i]!).toBeGreaterThan(res.depthProfile[i - 1]!);
    }
  });
});
