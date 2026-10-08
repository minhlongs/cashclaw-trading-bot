/**
 * @file v9-full-suite-simulation.test.ts
 * @description End-to-end integration simulation for the Unified v9 Quantitative Architecture & Operations Triad.
 */

import { describe, expect, it } from 'vitest';
import { GtmEngine } from '@/tree/quantlib/marketmaking/gtm-engine';
import { OfiEngine } from '@/tree/quantlib/marketmaking/ofi-engine';
import { estimateJohansenCointegration } from '@/tree/quantlib/statarb/johansen-cointegration';
import { InternalCrossingNetwork } from '@/tree/execution/crossing/internal-crossing-network';
import type { InternalOrder } from '@/tree/execution/crossing/internal-crossing-types';
import { BotManagerCacheState } from '@/tree/bot/bot-manager-cache-state';
import { applyDeliberationFeedback } from '@/forest/research/tradingagents/deliberation-feedback';
import type { DebateState } from '@/tree/research/tradingagents/debate-state';
import type { SurvivalGateResult } from '@/forest/alpha/gate/survival-gate';

describe('Unified v9 Quantitative Architecture & Operations Triad Simulation', () => {
  it('executes full v9 pipeline across MM, OFI, Johansen, Crossing, Telemetry, and Deliberation feedback', () => {
    // 1. GTM Market Making & OFI Desk
    const gtm = new GtmEngine({ gamma: 0.1, kappa: 1.5, A: 140, sigma: 0.02 });
    const ofi = new OfiEngine({ beta: 0.05, maxShiftRatio: 0.01 });

    const book1 = { bid: { price: 60000, size: 5 }, ask: { price: 60010, size: 5 } };
    const book2 = { bid: { price: 60000, size: 25 }, ask: { price: 60010, size: 5 } };
    ofi.computeOfi(book1);
    const quotes = ofi.calculateQuotes(book2, 2, gtm);

    expect(quotes.reservationPrice).toBeGreaterThan(quotes.midPrice);
    expect(quotes.bidPrice).toBeLessThan(quotes.reservationPrice);
    expect(quotes.askPrice).toBeGreaterThan(quotes.reservationPrice);

    // 2. Multivariate Johansen Cointegration
    const prices: number[][] = [];
    let p0 = 100;
    for (let t = 0; t < 50; t++) {
      p0 += Math.sin(t * 0.1);
      prices.push([p0, 2.0 * p0 + Math.cos(t * 0.2) * 0.1]);
    }
    const johansen = estimateJohansenCointegration({ prices });
    expect(johansen.eigenvalues.length).toBe(2);
    expect(johansen.cointegratingVector[0]).toBe(1);

    // 3. Internal Crossing Network with Zero Taker Fee Netting
    const crossing = new InternalCrossingNetwork(0.0005);
    const orders: InternalOrder[] = [
      { orderId: 'ord-1', botId: 'bot-a', symbol: 'BTC/USDT', side: 'BUY', quantity: 1.0, timestamp: 100 },
      { orderId: 'ord-2', botId: 'bot-b', symbol: 'BTC/USDT', side: 'SELL', quantity: 1.0, timestamp: 100 },
    ];
    const match = crossing.matchBatch('BTC/USDT', orders, 60005, 200);
    expect(match.totalCrossedQuantity).toBe(1.0);
    expect(match.totalFeeSavingsUsd).toBe(60.005); // 60005 * 0.001

    // 4. Edge D1 Cache Telemetry
    const cache = new BotManagerCacheState();
    cache.get('non-existent');
    expect(cache.metrics.getSnapshot().misses).toBe(1);

    // 5. Deliberation Feedback
    const mockDebate: DebateState = {
      researchGoalId: 'goal-v9',
      proposalId: 'prop-v9',
      rounds: [],
      status: 'complete',
    };
    const gateResult: SurvivalGateResult = {
      status: 'PAPER_CANDIDATE',
      reason: 'Passed all tests',
      checks: [],
    };
    const feedback = applyDeliberationFeedback(mockDebate, gateResult);
    expect(feedback.updatedStatus).toBe('PROMOTED_TO_PAPER');
  });
});
