import { describe, it, expect } from 'vitest';
import { YangZhangVolatilityEngine } from '../../src/tree/quantlib/volatility/yang-zhang-volatility-engine';
import type { OhlcBar } from '../../src/tree/quantlib/volatility/yang-zhang-volatility-types';
import { StoikovMicroPriceEngine } from '../../src/tree/quantlib/microstructure/stoikov-microprice-engine';
import type { StoikovOrderBookL1 } from '../../src/tree/quantlib/microstructure/stoikov-microprice-engine';
import { generateShadowOrders } from '../../src/tree/alpha/observability/order-generator';
import {
  computeBatchEdgeAttribution,
  computeBatchSlippageAttribution,
} from '../../src/tree/alpha/observability/attribution';
import { RegimeLabel } from '../../src/tree/regime/types';
import type { ShadowFill } from '../../src/tree/alpha/observability/types';

describe('V19 Apex Multi-Domain Quantitative & Architecture Simulation', () => {
  it('executes end-to-end quantitative pipeline with volatility scaling, microprice execution, and modular observability', () => {
    // 1. Yang-Zhang Volatility Estimation
    const yzEngine = new YangZhangVolatilityEngine();
    const bars: OhlcBar[] = [
      { open: 60000, high: 61200, low: 59500, close: 60800 },
      { open: 61000, high: 62500, low: 60400, close: 61900 },
      { open: 61500, high: 63000, low: 61200, close: 62400 },
      { open: 62000, high: 62800, low: 61100, close: 61600 },
      { open: 61800, high: 63500, low: 61500, close: 63100 },
    ];
    const yzRes = yzEngine.estimate(bars, { annualizationFactor: 365 });
    expect(yzRes.annualizedVolatility).toBeGreaterThan(0);
    expect(yzRes.compositeVariance).toBeGreaterThan(0);

    // 2. Stoikov Micro-Price Engine evaluation
    const stoikovEngine = new StoikovMicroPriceEngine();
    const l1Book: StoikovOrderBookL1 = {
      bidPrice: 63100,
      askPrice: 63105,
      bidVolume: 25.4,
      askVolume: 8.2,
    };
    const microRes = stoikovEngine.calculate(l1Book, { kappa: 0.3 });
    expect(microRes.imbalance).toBeGreaterThan(0);
    expect(microRes.microPrice).toBeGreaterThan(microRes.midPrice);
    expect(microRes.driftBps).toBeGreaterThan(0);

    // 3. Volatility-scaled position rebalancing with shadow order generation
    const baseTargetWeight = 0.5;
    // Volatility targeting: scale position inversely with volatility relative to 0.4 benchmark
    const volTarget = 0.4;
    const scaledTargetWeight = Math.min(1.0, (volTarget / yzRes.annualizedVolatility) * baseTargetWeight);

    const orders = generateShadowOrders({
      currentWeights: { 'BTC/USDT': 0.2 },
      targetWeights: { 'BTC/USDT': scaledTargetWeight },
      prices: { 'BTC/USDT': microRes.microPrice },
      portfolioEquity: 100_000,
      decisionTimestamp: 1770000000000,
    });

    expect(orders.length).toBe(1);
    const order = orders[0]!;
    expect(order.symbol).toBe('BTC/USDT');
    expect(order.side).toBe('buy');
    expect(order.size).toBeGreaterThan(0);

    // 4. Fill execution simulation & modular slippage attribution
    const fill: ShadowFill = {
      fillId: 'fill_btc_001',
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      fillPrice: microRes.microPrice * 1.0002, // 2 bps slippage
      fillQuantity: order.size / microRes.microPrice,
      feeAmount: (order.size * 0.0005),
      slippageBps: 2.0,
      fillTimestamp: 1770000000500,
      stressTier: 'normal',
    };

    const slipBatch = computeBatchSlippageAttribution([fill]);
    expect(slipBatch.count).toBe(1);
    expect(slipBatch.meanRealizedSlippageBps).toBe(2.0);

    // 5. Modular Edge Attribution
    const edgeBatch = computeBatchEdgeAttribution([
      {
        alphaId: 'alpha_stoikov_ofi',
        regime: RegimeLabel.TREND_UP,
        expectedReturn: 0.0025,
        expectedCost: 0.0005,
        realizedNetReturn: 0.0022,
      },
    ]);
    expect(edgeBatch.count).toBe(1);
    expect(edgeBatch.meanExpectedNetReturn).toBe(0.002);
    expect(edgeBatch.meanRealizedNetReturn).toBe(0.0022);
    expect(edgeBatch.meanDeltaEdge).toBe(0.0002);
  });
});
