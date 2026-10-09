import { describe, it, expect } from 'vitest';
import { ExecutionOmsWaterfall } from './execution-oms-waterfall';
import type { InboundOrder } from './execution-oms-types';
import type { RfqQuoteRequest } from '../darkmesh/rfq-darkmesh-types';

describe('ExecutionOmsWaterfall', () => {
  const defaultOrder: InboundOrder = {
    orderId: 'ORD-001',
    symbol: 'BTC/USDT',
    side: 'BUY',
    quantity: 10,
    strategyId: 'ALPHA-BOT',
    timestamp: Date.now(),
  };

  it('rejects order with invalid quantity or non-positive mid price', () => {
    const oms = new ExecutionOmsWaterfall();
    const badQty = oms.processOrder({ ...defaultOrder, quantity: -5 }, 50000);
    expect(badQty.state).toBe('REJECTED');

    const badPrice = oms.processOrder(defaultOrder, 0);
    expect(badPrice.state).toBe('REJECTED');
  });

  it('fully fills order in dark mesh when opposing liquidity is sufficient', () => {
    const oms = new ExecutionOmsWaterfall();
    const seller: RfqQuoteRequest = {
      rfqId: 'RFQ-SELL-1',
      botId: 'ARB-BOT',
      symbol: 'BTC/USDT',
      side: 'SELL',
      requestedQuantity: 15,
    };

    const res = oms.processOrder(defaultOrder, 50000, [seller]);
    expect(res.state).toBe('FILLED');
    expect(res.darkMeshMatchedQuantity).toBe(10);
    expect(res.darkMeshFeeSavedUsd).toBe(500); // 10 * 50000 * 0.001
    expect(res.routedQuantity).toBe(0);
    expect(res.unfilledQuantity).toBe(0);
  });

  it('rejects routing residual when microstructure toxicity exceeds threshold', () => {
    const oms = new ExecutionOmsWaterfall({ maxAdverseToxicity: 0.5 });
    const seller: RfqQuoteRequest = {
      rfqId: 'RFQ-SELL-1',
      botId: 'ARB-BOT',
      symbol: 'BTC/USDT',
      side: 'SELL',
      requestedQuantity: 2,
    };

    const res = oms.processOrder(defaultOrder, 50000, [seller], 0.8);
    expect(res.state).toBe('REJECTED');
    expect(res.darkMeshMatchedQuantity).toBe(2);
    expect(res.unfilledQuantity).toBe(8);
    expect(res.rejectionReason).toContain('High VPIN toxicity');
  });

  it('slices large orders across TWAP intervals and routes via SOR', () => {
    const oms = new ExecutionOmsWaterfall({ slicingThresholdQty: 4, maxSlices: 3 });
    const res = oms.processOrder(defaultOrder, 50000, [], 0.1);

    expect(res.state).toBe('ROUTING');
    expect(res.darkMeshMatchedQuantity).toBe(0);
    expect(res.slices.length).toBe(3);
    expect(res.routedQuantity).toBeCloseTo(10, 5);
    expect(res.unfilledQuantity).toBeCloseTo(0, 5);
  });

  it('routes single slice when order quantity is below slicing threshold', () => {
    const oms = new ExecutionOmsWaterfall({ slicingThresholdQty: 5 });
    const smallOrder: InboundOrder = { ...defaultOrder, quantity: 2 };
    const res = oms.processOrder(smallOrder, 50000, [], 0.1);

    expect(res.state).toBe('ROUTING');
    expect(res.slices.length).toBe(1);
    expect(res.routedQuantity).toBe(2);
  });
});
