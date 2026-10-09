import { describe, expect, it } from 'vitest';
import { computeBgtAsymmetricBook } from '@/tree/quantlib/microstructure/bgt-asymmetric-book-engine';
import type { BgtAsymmetricBookParams } from '@/tree/quantlib/microstructure/bgt-asymmetric-book-types';

describe('BgtAsymmetricBookEngine', () => {
  const baseParams: BgtAsymmetricBookParams = {
    bidVolume: 500,
    askVolume: 200,
    ofi: 150,
    imbalanceCoeff: 0.05,
    depthRatioCoeff: 0.02,
    ofiCoeff: 0.001,
    baseInformedLogit: -1.5,
    sensitivityInformed: 2.0,
  };

  it('detects buy pressure and positive expected price revision under excess bid volume', () => {
    const res = computeBgtAsymmetricBook(baseParams);
    expect(res.bookState).toBe('BUY_PRESSURE');
    expect(res.queueImbalance).toBeGreaterThan(0.15);
    expect(res.logDepthRatio).toBeGreaterThan(0);
    expect(res.expectedPriceChange).toBeGreaterThan(0);
    expect(res.informedTradingProbability).toBeGreaterThan(0);
    expect(res.informedTradingProbability).toBeLessThan(1);
  });

  it('detects sell pressure under dominant ask queue size', () => {
    const res = computeBgtAsymmetricBook({ ...baseParams, bidVolume: 100, askVolume: 600, ofi: -250 });
    expect(res.bookState).toBe('SELL_PRESSURE');
    expect(res.queueImbalance).toBeLessThan(-0.15);
    expect(res.logDepthRatio).toBeLessThan(0);
    expect(res.expectedPriceChange).toBeLessThan(0);
  });

  it('identifies balanced regime when queues are symmetric', () => {
    const res = computeBgtAsymmetricBook({ ...baseParams, bidVolume: 300, askVolume: 300, ofi: 0 });
    expect(res.bookState).toBe('BALANCED');
    expect(res.queueImbalance).toBeCloseTo(0, 5);
    expect(res.logDepthRatio).toBeCloseTo(0, 5);
  });

  it('handles empty queues gracefully without division-by-zero errors', () => {
    const res = computeBgtAsymmetricBook({ ...baseParams, bidVolume: 0, askVolume: 0, ofi: 0 });
    expect(res.bookState).toBe('BALANCED');
    expect(res.queueImbalance).toBe(0);
    expect(res.logDepthRatio).toBe(0);
  });
});
