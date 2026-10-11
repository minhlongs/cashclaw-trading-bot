import { describe, it, expect } from 'vitest';
import { executeBiaisScheduling } from '@/tree/quantlib/execution/biais-scheduling-engine';
import { computeGlostenSpread } from '@/tree/quantlib/microstructure/glosten-spread-engine';
import { InternalCrossingNetwork } from '@/tree/execution/crossing/internal-crossing-network';
import { filterEligibleOrders, findIneligibleOrders } from '@/tree/execution/crossing/crossing-filter';
import { executePairMatching } from '@/tree/execution/crossing/crossing-matcher';
import { computeDerivativeFeatures, rollingMean, rollingStd } from '@/tree/alpha/signals/funding-features';
import { fundingFields, oiFields } from '@/tree/alpha/signals/funding-fields';
import { liquidationFields, basisFields } from '@/tree/alpha/signals/liquidation-fields';
import type { InternalOrder } from '@/tree/execution/crossing/internal-crossing-types';
import type { FundingRatePoint, OpenInterestPoint, LiquidationPoint } from '@/tree/alpha/signals/funding-types';
import type { Candle } from '@/forest/backtest/ohlcv';

describe('Triad v52 Golden Apex Multi-Domain Suite End-to-End Simulation', () => {
  it('Pillar 1: Biais high-frequency trade scheduling with Glosten equilibrium spread dynamics', () => {
    const glostenRes = computeGlostenSpread({
      midPrice: 200,
      orderSizes: [50, 100, 200],
      baseSpread: 0.1,
      infoIntensity: 0.005,
    });
    expect(glostenRes.quotes).toHaveLength(3);
    const avgSpread = glostenRes.averageEffectiveSpread;

    const execRes = executeBiaisScheduling({
      totalShares: 350,
      initialPrice: 200,
      numBuckets: 3,
      baseImpact: avgSpread * 0.05,
      informedArrivalProb: 0.2,
      adverseIntensity: 0.02,
    });
    expect(execRes.schedule).toHaveLength(3);
    expect(execRes.schedule[2].remainingShares).toBe(0);
    expect(execRes.totalExecutionCost).toBeGreaterThan(0);
    expect(execRes.implementationShortfallBps).toBeGreaterThan(0);
  });

  it('Pillar 2 & 3: Modularized InternalCrossingNetwork netting and direct submodules', () => {
    const orders: InternalOrder[] = [
      { orderId: 'b1', botId: 'botA', symbol: 'BTCUSDT', side: 'BUY', quantity: 2, limitPrice: 50100, timestamp: 1700000000 },
      { orderId: 's1', botId: 'botB', symbol: 'BTCUSDT', side: 'SELL', quantity: 1.5, limitPrice: 49900, timestamp: 1700000000 },
      { orderId: 'b2_bad', botId: 'botC', symbol: 'BTCUSDT', side: 'BUY', quantity: 1, limitPrice: 49000, timestamp: 1700000000 },
    ];

    const eligible = filterEligibleOrders(orders, 'BTCUSDT', 50000);
    expect(eligible.buys).toHaveLength(1);
    expect(eligible.sells).toHaveLength(1);

    const ineligible = findIneligibleOrders(orders, 'BTCUSDT', 50000);
    expect(ineligible).toHaveLength(1);
    expect(ineligible[0].orderId).toBe('b2_bad');

    const directFills = executePairMatching(
      [...eligible.buys],
      [...eligible.sells],
      'BTCUSDT',
      50000,
      0.0005,
      1700000000,
    );
    expect(directFills).toHaveLength(1);
    expect(directFills[0].matchedQuantity).toBe(1.5);

    const network = new InternalCrossingNetwork(0.0005);
    const batchRes = network.matchBatch('BTCUSDT', orders, 50000, 1700000000);
    expect(batchRes.totalCrossedQuantity).toBe(1.5);
    expect(batchRes.fills).toHaveLength(1);
    expect(batchRes.unmatchedOrders.length).toBeGreaterThan(0);
    expect(batchRes.totalFeeSavingsUsd).toBeCloseTo(1.5 * 50000 * 0.001, 2);
  });

  it('Pillar 3: Modularized funding and derivative features submodules verify causal consistency', () => {
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
      { timestamp: 2000, open: 102, high: 108, low: 100, close: 107, volume: 1500 },
    ];
    const funding: FundingRatePoint[] = [
      { timestamp: 500, symbol: 'BTCUSDT', fundingRate: 0.0001, markPrice: 50000 },
      { timestamp: 1500, symbol: 'BTCUSDT', fundingRate: 0.0002, markPrice: 50100 },
    ];
    const oi: OpenInterestPoint[] = [
      { timestamp: 500, symbol: 'BTCUSDT', openInterest: 20, notionalUsd: 1000000 },
      { timestamp: 1500, symbol: 'BTCUSDT', openInterest: 22, notionalUsd: 1100000 },
    ];
    const liqs: LiquidationPoint[] = [
      { timestamp: 600, symbol: 'BTCUSDT', side: 'long', price: 49800, quantity: 0.1, notionalUsd: 5000 },
      { timestamp: 1600, symbol: 'BTCUSDT', side: 'short', price: 50200, quantity: 0.04, notionalUsd: 2000 },
    ];
    const basis = [
      { timestamp: 500, basis: 0.5 },
      { timestamp: 1500, basis: 0.8 },
    ];

    expect(rollingMean([1, 2, 3], 2)).toBe(2.5);
    expect(rollingStd([2, 4], 2)).toBe(1);

    const ff = fundingFields(funding, 1000);
    expect(ff.fundingRate).toBe(0.0001);

    const of = oiFields(oi, 1000, 2);
    expect(of.openInterest).toBe(1000000);

    const lf = liquidationFields(liqs, 1000, 2, 1000);
    expect(lf.liquidationImbalance).toBe(5000);

    const bf = basisFields(basis, 1000, 2);
    expect(bf.basis).toBe(0.5);

    const features = computeDerivativeFeatures(candles, funding, oi, liqs, basis, 2);
    expect(features).toHaveLength(2);
    expect(features[0].timestamp).toBe(1000);
    expect(features[1].timestamp).toBe(2000);
  });
});
