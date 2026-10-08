import { describe, expect, it } from 'vitest';
import { RfqDarkMeshRouter } from './rfq-darkmesh-router';
import type { RfqQuoteRequest } from './rfq-darkmesh-types';

describe('RfqDarkMeshRouter', () => {
  const router = new RfqDarkMeshRouter(0.0005); // 5 bps

  it('validates constructor parameters and mid price', () => {
    expect(() => new RfqDarkMeshRouter(-0.001)).toThrow('Taker fee rate must be non-negative.');
    expect(() => router.matchBatch('BTC-USDT', [], 0)).toThrow('Mid price must be positive and finite.');
    expect(() => router.matchBatch('BTC-USDT', [], -10)).toThrow();
  });

  it('allocates pro-rata fair shares when demand exceeds supply', () => {
    const buy1: RfqQuoteRequest = {
      rfqId: 'rfq-b1',
      botId: 'bot-alpha',
      symbol: 'BTC-USDT',
      side: 'BUY',
      requestedQuantity: 10,
    };
    const buy2: RfqQuoteRequest = {
      rfqId: 'rfq-b2',
      botId: 'bot-beta',
      symbol: 'BTC-USDT',
      side: 'BUY',
      requestedQuantity: 30,
    };
    const sell1: RfqQuoteRequest = {
      rfqId: 'rfq-s1',
      botId: 'bot-gamma',
      symbol: 'BTC-USDT',
      side: 'SELL',
      requestedQuantity: 20,
    };

    const midPrice = 50000;
    const res = router.matchBatch('BTC-USDT', [buy1, buy2, sell1], midPrice, 1600000000);

    // Total demand = 40, Supply = 20 => 20 filled
    expect(res.totalMatchedQuantity).toBeCloseTo(20, 8);
    expect(res.totalMatchedNotional).toBeCloseTo(20 * 50000, 8);
    // Fee saved = 20 * 50000 * 0.0010 = $1,000
    expect(res.totalFeeSavedUsd).toBeCloseTo(1000, 8);

    // Verify pro-rata fills
    const fillB1 = res.fills.filter((f) => f.buyRfqId === 'rfq-b1').reduce((s, f) => s + f.matchedQuantity, 0);
    const fillB2 = res.fills.filter((f) => f.buyRfqId === 'rfq-b2').reduce((s, f) => s + f.matchedQuantity, 0);

    expect(fillB1).toBeCloseTo(5, 8); // 10/40 * 20 = 5
    expect(fillB2).toBeCloseTo(15, 8); // 30/40 * 20 = 15

    // Unfilled requests check
    const unfilledB1 = res.unfilledRequests.find((r) => r.rfqId === 'rfq-b1');
    const unfilledB2 = res.unfilledRequests.find((r) => r.rfqId === 'rfq-b2');
    const unfilledS1 = res.unfilledRequests.find((r) => r.rfqId === 'rfq-s1');

    expect(unfilledB1?.requestedQuantity).toBeCloseTo(5, 8);
    expect(unfilledB2?.requestedQuantity).toBeCloseTo(15, 8);
    expect(unfilledS1).toBeUndefined(); // Completely filled
  });

  it('allocates pro-rata fair shares when supply exceeds demand', () => {
    const buy1: RfqQuoteRequest = {
      rfqId: 'rfq-b1',
      botId: 'bot-alpha',
      symbol: 'ETH-USDT',
      side: 'BUY',
      requestedQuantity: 10,
    };
    const sell1: RfqQuoteRequest = {
      rfqId: 'rfq-s1',
      botId: 'bot-gamma',
      symbol: 'ETH-USDT',
      side: 'SELL',
      requestedQuantity: 5,
    };
    const sell2: RfqQuoteRequest = {
      rfqId: 'rfq-s2',
      botId: 'bot-delta',
      symbol: 'ETH-USDT',
      side: 'SELL',
      requestedQuantity: 15,
    };

    const midPrice = 3000;
    const res = router.matchBatch('ETH-USDT', [buy1, sell1, sell2], midPrice);

    // Total buy = 10, sell = 20 => 10 filled
    expect(res.totalMatchedQuantity).toBeCloseTo(10, 8);

    const fillS1 = res.fills.filter((f) => f.sellRfqId === 'rfq-s1').reduce((s, f) => s + f.matchedQuantity, 0);
    const fillS2 = res.fills.filter((f) => f.sellRfqId === 'rfq-s2').reduce((s, f) => s + f.matchedQuantity, 0);

    expect(fillS1).toBeCloseTo(2.5, 8); // 5/20 * 10 = 2.5
    expect(fillS2).toBeCloseTo(7.5, 8); // 15/20 * 10 = 7.5
  });

  it('correctly filters ineligible limit prices and disparate symbols', () => {
    const buyBelowMid: RfqQuoteRequest = {
      rfqId: 'rfq-b-low',
      botId: 'bot-1',
      symbol: 'BTC-USDT',
      side: 'BUY',
      requestedQuantity: 5,
      limitPrice: 49000, // Mid is 50000, buy limit is below mid -> ineligible
    };
    const sellAboveMid: RfqQuoteRequest = {
      rfqId: 'rfq-s-high',
      botId: 'bot-2',
      symbol: 'BTC-USDT',
      side: 'SELL',
      requestedQuantity: 5,
      limitPrice: 51000, // Mid is 50000, sell limit is above mid -> ineligible
    };
    const wrongSymbol: RfqQuoteRequest = {
      rfqId: 'rfq-other',
      botId: 'bot-3',
      symbol: 'SOL-USDT',
      side: 'BUY',
      requestedQuantity: 5,
    };

    const res = router.matchBatch('BTC-USDT', [buyBelowMid, sellAboveMid, wrongSymbol], 50000);
    expect(res.totalMatchedQuantity).toBe(0);
    expect(res.fills).toHaveLength(0);
    expect(res.unfilledRequests).toHaveLength(3);
  });

  it('handles empty requests gracefully', () => {
    const res = router.matchBatch('BTC-USDT', [], 50000);
    expect(res.totalMatchedQuantity).toBe(0);
    expect(res.fills).toEqual([]);
    expect(res.unfilledRequests).toEqual([]);
  });
});
