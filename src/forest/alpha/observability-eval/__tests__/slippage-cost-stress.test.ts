import { describe, expect, it } from 'vitest';
import type { CostStressTier, ShadowFill, ShadowOrder } from '../../../../tree/alpha/observability/types';
import { evaluateObservability } from '../evaluate';
import { ObservabilityReportSchema } from '../schemas';

function makeOrder(id: string, side: 'buy' | 'sell', price = 50000): ShadowOrder {
  return { orderId: id, symbol: 'BTC/USDT', side, size: 50000, price, targetWeightDelta: 0.1, decisionTimestamp: 1000 };
}

function makeFill(id: string, orderId: string, side: 'buy' | 'sell', tier: CostStressTier, price: number, qty: number, fee: number, slip: number): ShadowFill {
  return { fillId: id, orderId, symbol: 'BTC/USDT', side, fillPrice: price, fillQuantity: qty, fillTimestamp: 1020, feeAmount: fee, slippageBps: slip, stressTier: tier };
}

describe('Adversarial Slippage Attribution & Cost Tiers', () => {
  it('verifies all 4 cost stress tiers simultaneously against baseline models', () => {
    const orders = [
      makeOrder('ord-norm', 'buy'), makeOrder('ord-cons', 'sell'),
      makeOrder('ord-adv', 'buy'), makeOrder('ord-ext', 'sell'),
    ];
    const fills = [
      makeFill('f1', 'ord-norm', 'buy', 'normal', 10000, 1.0, 8, 4.0),
      makeFill('f2', 'ord-cons', 'sell', 'conservative', 10000, 1.0, 10, 8.5),
      makeFill('f3', 'ord-adv', 'buy', 'adverse', 10000, 1.0, 12, 23.0),
      makeFill('f4', 'ord-ext', 'sell', 'extreme', 10000, 1.0, 15, 45.0),
    ];

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    expect(ObservabilityReportSchema.parse(report)).toBeDefined();

    const tiers = report.slippageAttribution.byStressTier;
    // normal: expected = 3 bps, realized = 4 bps, delta = +1 bps
    expect(tiers['normal']?.expectedSlippageBpsMean).toBe(3);
    expect(tiers['normal']?.realizedSlippageBpsMean).toBe(4);
    expect(tiers['normal']?.slippageDeltaBpsMean).toBe(1);

    // conservative: expected = 7 bps, realized = 8.5 bps, delta = +1.5 bps
    expect(tiers['conservative']?.expectedSlippageBpsMean).toBe(7);
    expect(tiers['conservative']?.realizedSlippageBpsMean).toBe(8.5);
    expect(tiers['conservative']?.slippageDeltaBpsMean).toBe(1.5);

    // adverse: expected = 20 bps, realized = 23 bps, delta = +3 bps
    expect(tiers['adverse']?.expectedSlippageBpsMean).toBe(20);
    expect(tiers['adverse']?.realizedSlippageBpsMean).toBe(23);
    expect(tiers['adverse']?.slippageDeltaBpsMean).toBe(3);

    // extreme: expected = 40 bps, realized = 45 bps, delta = +5 bps
    expect(tiers['extreme']?.expectedSlippageBpsMean).toBe(40);
    expect(tiers['extreme']?.realizedSlippageBpsMean).toBe(45);
    expect(tiers['extreme']?.slippageDeltaBpsMean).toBe(5);
  });

  it('verifies exact effective cost formula (slippage + fee drag) against mathematical oracle', () => {
    // Fill 1: 10,000 * 1.0 = 10,000 notional. Fee = 8. Slip = 5.0 bps.
    // Fill 2: 20,000 * 2.0 = 40,000 notional. Fee = 32. Slip = 11.0 bps.
    // Total notional = 50,000. Total fees = 40.
    // Fee drag = (40 / 50000) * 10,000 = 8.0 bps.
    // Mean realized slippage = (5.0 + 11.0) / 2 = 8.0 bps.
    // Effective cost = 8.0 + 8.0 = 16.0 bps.
    const orders = [makeOrder('o1', 'buy'), makeOrder('o2', 'buy')];
    const fills = [
      makeFill('f1', 'o1', 'buy', 'normal', 10000, 1.0, 8, 5.0),
      makeFill('f2', 'o2', 'buy', 'normal', 20000, 2.0, 32, 11.0),
    ];

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    expect(report.slippageAttribution.realizedSlippageBpsMean).toBe(8.0);
    expect(report.slippageAttribution.totalFees).toBe(40.0);
    expect(report.slippageAttribution.effectiveCostBps).toBe(16.0);
    expect(report.slippageAttribution.slippageDeltaBpsMean).toBe(5.0); // 8.0 - 3.0 expected
  });

  it('handles zero notional fills without division-by-zero or NaN', () => {
    const orders = [makeOrder('o-zero', 'buy')];
    const fills = [makeFill('f-zero', 'o-zero', 'buy', 'normal', 0, 0, 5, 4.0)];

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    expect(Number.isFinite(report.slippageAttribution.effectiveCostBps)).toBe(true);
    expect(report.slippageAttribution.effectiveCostBps).toBe(4.0);
    expect(report.slippageAttribution.totalFees).toBe(5);
  });

  it('populates unrepresented tiers with baseline expected slippage and zero fills', () => {
    const orders = [makeOrder('o1', 'buy')];
    const fills = [makeFill('f1', 'o1', 'buy', 'normal', 10000, 1.0, 5, 3.0)];

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    const advTier = report.slippageAttribution.byStressTier['adverse'];
    expect(advTier).toBeDefined();
    expect(advTier?.fillCount).toBe(0);
    expect(advTier?.fillRate).toBe(0);
    expect(advTier?.expectedSlippageBpsMean).toBe(20);
    expect(advTier?.realizedSlippageBpsMean).toBe(0);
    expect(advTier?.slippageDeltaBpsMean).toBe(-20);
  });

  it('separates buy and sell side attribution correctly', () => {
    const orders = [makeOrder('o-buy', 'buy'), makeOrder('o-sell-1', 'sell'), makeOrder('o-sell-2', 'sell')];
    const fills = [
      makeFill('fb', 'o-buy', 'buy', 'normal', 1000, 1, 1, 15.0),
      makeFill('fs1', 'o-sell-1', 'sell', 'normal', 1000, 1, 1, 5.0),
      makeFill('fs2', 'o-sell-2', 'sell', 'normal', 1000, 1, 1, 7.0),
    ];

    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: orders, shadowFills: fills, operationalTelemetry: [],
    });

    expect(report.slippageAttribution.bySide.buy.orderCount).toBe(1);
    expect(report.slippageAttribution.bySide.buy.fillCount).toBe(1);
    expect(report.slippageAttribution.bySide.buy.realizedSlippageBpsMean).toBe(15.0);

    expect(report.slippageAttribution.bySide.sell.orderCount).toBe(2);
    expect(report.slippageAttribution.bySide.sell.fillCount).toBe(2);
    expect(report.slippageAttribution.bySide.sell.realizedSlippageBpsMean).toBe(6.0); // (5 + 7)/2
  });

  it('strictly rejects malicious execution payloads injected into report structure', () => {
    const base = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: [], shadowFills: [], operationalTelemetry: [],
    });

    // Attempting to append live trading execution keys
    const injected = { ...base, executeLive: true, placeOrder: true };
    expect(() => ObservabilityReportSchema.parse(injected)).toThrow();
  });
});
