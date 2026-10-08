/**
 * @file v10-full-suite-simulation.test.ts
 * @description End-to-end integration simulation for the Unified v10 Quantitative Architecture & Operations Triad.
 */

import { describe, expect, it } from 'vitest';
import { CarteaJaimungalEngine } from '@/tree/quantlib/marketmaking/cartea-jaimungal-engine';
import { FundingBasisEngine } from '@/tree/quantlib/arbitrage/funding-basis-engine';
import type { VenueFundingQuote } from '@/tree/quantlib/arbitrage/funding-basis-types';
import { RfqDarkMeshRouter } from '@/tree/execution/darkmesh/rfq-darkmesh-router';
import type { RfqQuoteRequest } from '@/tree/execution/darkmesh/rfq-darkmesh-types';

describe('Unified v10 Quantitative Architecture & Operations Triad Simulation', () => {
  it('executes full v10 pipeline: Cartea-Jaimungal Alpha MM, Funding Basis Arb, and RFQ Dark Mesh Router', () => {
    // 1. Pillar 1: Cartea-Jaimungal (2014) Alpha-Informed Market Making Desk
    const cartea = new CarteaJaimungalEngine({
      gamma: 0.1,
      kappa: 1.5,
      A: 140,
      sigma: 0.02,
    });

    const midPrice = 60000;
    const inventory = 1.5;
    const bullishAlpha = 0.3; // Strong upward drift

    const quote = cartea.computeOptimalQuotes(inventory, midPrice, bullishAlpha);

    expect(quote.bidPrice).toBeLessThan(midPrice);
    expect(quote.askPrice).toBeGreaterThan(midPrice);
    // Skew should be positive due to positive alpha drift
    expect(quote.skew).toBeGreaterThan(0);
    expect(quote.totalSpread).toBeCloseTo(quote.deltaBid + quote.deltaAsk, 8);

    // 2. Pillar 2: Multi-Venue Perpetual Funding Rate Basis Arbitrage
    const basisEngine = new FundingBasisEngine({
      minHurdleRateAnnual: 0.08,
      minLiquidationDistance: 0.15,
      defaultHoldingDays: 30,
      annualBorrowRate: 0.02,
    });

    const binanceFunding: VenueFundingQuote = {
      venueId: 'binance',
      symbol: 'BTC-USDT',
      fundingRate: 0.0003, // 0.03% per 8h => 32.85% annual
      fundingIntervalHours: 8,
      markPrice: midPrice,
      takerFeeRate: 0.0004,
      liquidationPrice: 75000,
    };

    const bybitFunding: VenueFundingQuote = {
      venueId: 'bybit',
      symbol: 'BTC-USDT',
      fundingRate: -0.00005, // -0.005% per 8h => -5.475% annual
      fundingIntervalHours: 8,
      markPrice: midPrice,
      takerFeeRate: 0.0004,
      liquidationPrice: 46000,
    };

    const opportunity = basisEngine.evaluatePair(binanceFunding, bybitFunding, 30);
    expect(opportunity.status).toBe('EXECUTE');
    expect(opportunity.shortVenueId).toBe('binance');
    expect(opportunity.longVenueId).toBe('bybit');
    expect(opportunity.grossAnnualYield).toBeGreaterThan(0.35);
    expect(opportunity.netAnnualYield).toBeGreaterThan(0.15);
    expect(opportunity.minLiquidationDistance).toBeGreaterThan(0.20);

    // 3. Pillar 3: RFQ Dark Mesh & Fair-Share Liquidity Aggregator
    const meshRouter = new RfqDarkMeshRouter(0.0005); // 5 bps

    // Synthesize internal bot requests from the MM quotes and funding arb hedge legs
    const rfqs: RfqQuoteRequest[] = [
      {
        rfqId: 'rfq-mm-bid',
        botId: 'cartea-mm-bot',
        symbol: 'BTC-USDT',
        side: 'BUY',
        requestedQuantity: 2.0,
        limitPrice: quote.bidPrice + 5, // Willing to buy near quote bid
      },
      {
        rfqId: 'rfq-arb-short-hedge',
        botId: 'funding-arb-bot',
        symbol: 'BTC-USDT',
        side: 'SELL',
        requestedQuantity: 1.5,
      },
      {
        rfqId: 'rfq-fleet-hedger',
        botId: 'inventory-hedger-bot',
        symbol: 'BTC-USDT',
        side: 'SELL',
        requestedQuantity: 0.5,
      },
    ];

    const matchBatchResult = meshRouter.matchBatch('BTC-USDT', rfqs, midPrice, 1700000000);

    // Total buy = 2.0, total sell = 2.0 => Exact 100% crossing
    expect(matchBatchResult.totalMatchedQuantity).toBeCloseTo(2.0, 8);
    expect(matchBatchResult.totalMatchedNotional).toBeCloseTo(2.0 * midPrice, 8);
    // 2.0 * 60,000 * (0.0005 * 2) = $120 fee savings
    expect(matchBatchResult.totalFeeSavedUsd).toBeCloseTo(120, 8);
    expect(matchBatchResult.unfilledRequests).toHaveLength(0);
    expect(matchBatchResult.fills.length).toBeGreaterThanOrEqual(2);
  });
});
