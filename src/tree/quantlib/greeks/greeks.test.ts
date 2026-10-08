import { describe, it, expect } from 'vitest';
import { calculateBlackGreeks } from './synthetic-greeks-engine';
import { evaluatePortfolioGreeks } from './delta-neutral-hedger';
import type { SyntheticPosition } from './greeks-types';

describe('Synthetic Greeks & Delta-Neutral Hedging Desk', () => {
  it('computes Black-76 Greeks with high precision', () => {
    // ATM Call: S=100, K=100, T=0.25 (3 months), vol=0.40, r=0.04
    const callGreeks = calculateBlackGreeks(100, 100, 0.25, 0.4, 0.04, 'call');

    // ATM Call delta should be slightly above 0.5 due to positive drift
    expect(callGreeks.delta).toBeGreaterThan(0.5);
    expect(callGreeks.delta).toBeLessThan(0.6);
    expect(callGreeks.gamma).toBeGreaterThan(0);
    expect(callGreeks.vega).toBeGreaterThan(0);
    expect(callGreeks.theta).toBeLessThan(0); // Time decay is negative

    // ATM Put: delta should be negative (~ -0.45)
    const putGreeks = calculateBlackGreeks(100, 100, 0.25, 0.4, 0.04, 'put');
    expect(putGreeks.delta).toBeCloseTo(callGreeks.delta - 1.0, 2);
  });

  it('evaluates portfolio net Greeks and triggers auto-hedge order when delta drifts', () => {
    const portfolio: SyntheticPosition[] = [
      {
        symbol: 'BTC/USDT',
        notionalQuantity: 2.0, // Long 2.0 BTC spot/perp (+2.0 delta)
        isPerpOrSpot: true,
        spotPrice: 60000,
        impliedVol: 0.55,
      },
      {
        symbol: 'BTC-60000-CALL',
        notionalQuantity: -2.0, // Short 2x ATM calls (delta ~ -1.1)
        isPerpOrSpot: false,
        optionType: 'call',
        spotPrice: 60000,
        strikePrice: 60000,
        timeToExpiryYears: 30 / 365,
        impliedVol: 0.55,
      },
    ];

    const result = evaluatePortfolioGreeks(portfolio, 0.05);

    // Net delta = +2.0 + (-2 * ~0.53) = ~ +0.94 BTC
    expect(result.netDelta).toBeGreaterThan(0.5);
    expect(result.requiresHedging).toBe(true);
    // Suggested counter hedge should short ~0.94 BTC to restore neutrality
    expect(result.suggestedHedgeQuantity).toBeCloseTo(-result.netDelta, 3);
  });

  it('identifies neutral portfolio within safety threshold', () => {
    const neutralPortfolio: SyntheticPosition[] = [
      {
        symbol: 'BTC/USDT',
        notionalQuantity: 0.02, // Well within 0.05 threshold
        isPerpOrSpot: true,
        spotPrice: 60000,
        impliedVol: 0.55,
      },
    ];

    const result = evaluatePortfolioGreeks(neutralPortfolio, 0.05);
    expect(result.requiresHedging).toBe(false);
    expect(result.suggestedHedgeQuantity).toBe(0);
  });
});
