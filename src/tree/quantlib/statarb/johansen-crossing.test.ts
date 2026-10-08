import { describe, it, expect } from 'vitest';
import { estimateJohansenCointegration } from './johansen-cointegration';
import { InternalCrossingNetwork } from '@/tree/execution/crossing/internal-crossing-network';
import type { InternalOrder } from '@/tree/execution/crossing/internal-crossing-types';

describe('Multivariate Johansen Cointegration Estimator', () => {
  it('throws for series with fewer than 10 observations', () => {
    expect(() => estimateJohansenCointegration({ prices: [[1, 2], [2, 3]] })).toThrow(/at least 10/);
  });

  it('throws for unsupported asset dimension', () => {
    const invalidPrices = Array.from({ length: 15 }, () => [1, 2, 3, 4]);
    expect(() => estimateJohansenCointegration({ prices: invalidPrices })).toThrow(/K must be 2 or 3/);
  });

  it('detects cointegration in strongly cointegrated synthetic pair', () => {
    // Generate synthetic cointegrated series: X0 is random walk, X1 = 1.5 * X0 + stationary noise
    const prices: number[][] = [];
    let x0 = 100;
    for (let t = 0; t < 120; t++) {
      x0 += (Math.sin(t * 0.1) + Math.cos(t * 0.2)) * 0.5;
      const noise = (Math.sin(t * 0.5) * 0.2);
      const x1 = 1.5 * x0 + noise;
      prices.push([x0, x1]);
    }

    const result = estimateJohansenCointegration({ prices });
    expect(result.eigenvalues.length).toBe(2);
    expect(result.traceStats.length).toBe(2);
    expect(result.cointegratingVector.length).toBe(2);
    expect(result.cointegratingVector[0]).toBe(1);
    expect(result.halfLifeBars).toBeGreaterThan(0);
    expect(result.eigenvalues[0]).toBeGreaterThan(0);
  });

  it('computes finite statistics for random series', () => {
    const prices = Array.from({ length: 50 }, (_, i) => [100 + i * 0.2, 50 - i * 0.1]);
    const result = estimateJohansenCointegration({ prices });
    expect(Number.isFinite(result.traceStats[0])).toBe(true);
    expect(Number.isFinite(result.maxEigenStats[0])).toBe(true);
  });
});

describe('Internal Crossing Network', () => {
  const crossing = new InternalCrossingNetwork(0.0005); // 5 bps each side

  it('throws on invalid mid-price or fee rate', () => {
    expect(() => new InternalCrossingNetwork(-0.01)).toThrow(/non-negative/);
    expect(() => crossing.matchBatch('BTC/USDT', [], 0)).toThrow(/positive and finite/);
    expect(() => crossing.matchBatch('BTC/USDT', [], -10)).toThrow(/positive and finite/);
  });

  it('matches opposing orders with exact quantity conservation', () => {
    const orders: InternalOrder[] = [
      { orderId: 'b1', botId: 'bot-alpha', symbol: 'BTC/USDT', side: 'BUY', quantity: 1.5, timestamp: 1000 },
      { orderId: 's1', botId: 'bot-beta', symbol: 'BTC/USDT', side: 'SELL', quantity: 1.0, timestamp: 1000 },
      { orderId: 's2', botId: 'bot-gamma', symbol: 'BTC/USDT', side: 'SELL', quantity: 0.5, timestamp: 1000 },
    ];

    const result = crossing.matchBatch('BTC/USDT', orders, 60000, 2000);

    expect(result.totalCrossedQuantity).toBe(1.5);
    expect(result.totalCrossedNotional).toBe(90000);
    // Fee savings = 90000 * (0.0005 * 2) = 90 USD
    expect(result.totalFeeSavingsUsd).toBe(90);
    expect(result.fills.length).toBe(2);
    expect(result.unmatchedOrders.length).toBe(0);

    // Verify fill details
    expect(result.fills[0].matchedQuantity).toBe(1.0);
    expect(result.fills[1].matchedQuantity).toBe(0.5);
    expect(result.fills[0].executionPrice).toBe(60000);
  });

  it('correctly segregates uncrossed residuals and ineligible limit prices', () => {
    const orders: InternalOrder[] = [
      { orderId: 'b1', botId: 'bot-1', symbol: 'ETH/USDT', side: 'BUY', quantity: 5.0, timestamp: 100 },
      { orderId: 's1', botId: 'bot-2', symbol: 'ETH/USDT', side: 'SELL', quantity: 2.0, timestamp: 100 },
      // Ineligible buy: limit 2900 < mid 3000
      { orderId: 'b2', botId: 'bot-3', symbol: 'ETH/USDT', side: 'BUY', quantity: 1.0, limitPrice: 2900, timestamp: 100 },
      // Ineligible sell: limit 3100 > mid 3000
      { orderId: 's2', botId: 'bot-4', symbol: 'ETH/USDT', side: 'SELL', quantity: 1.0, limitPrice: 3100, timestamp: 100 },
    ];

    const result = crossing.matchBatch('ETH/USDT', orders, 3000, 200);

    expect(result.totalCrossedQuantity).toBe(2.0);
    expect(result.fills.length).toBe(1);

    // Unmatched: 3.0 ETH residual from b1 + 1.0 b2 + 1.0 s2
    expect(result.unmatchedOrders.length).toBe(3);
    const residualB1 = result.unmatchedOrders.find((o) => o.orderId === 'b1');
    expect(residualB1?.quantity).toBe(3.0);

    // Mass conservation: total matched buys (2) + residual b1 (3) + b2 (1) = total initial buys (6)
    const totalBuys = orders.filter((o) => o.side === 'BUY').reduce((s, o) => s + o.quantity, 0);
    const resolvedBuys = result.totalCrossedQuantity + (residualB1?.quantity ?? 0) + 1.0;
    expect(resolvedBuys).toBe(totalBuys);
  });
});
