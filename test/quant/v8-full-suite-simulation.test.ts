/**
 * @file v8-full-suite-simulation.test.ts
 * @description End-to-end multi-pillar simulation test for the v8 Quantitative Architecture Suite.
 */

import { describe, expect, it } from 'vitest';
import {
  initializeCrossCorrelationState,
  updateTickCrossCorrelation,
} from '@/tree/quantlib/leadlag/tick-cross-correlator';
import { computeGrangerLeadLagMatrix } from '@/tree/quantlib/leadlag/granger-lead-lag-matrix';
import { interceptFollowerReservationPrice } from '@/tree/quantlib/leadlag/microstructure-latency-interceptor';
import { generateAlmgrenChrissSchedule } from '@/tree/execution/almgren-chriss/optimal-slice-coordinator';
import { calculatePortfolioMarginReport } from '@/tree/margin/collateral-rebalance-router';
import type { VenueAccountSnapshot } from '@/tree/margin/portfolio-margin-types';

describe('V8 Full-Suite Quantitative Architecture Simulation', () => {
  it('executes the full cross-asset lead-lag, optimal slicing, and portfolio margin workflow', () => {
    // -------------------------------------------------------------
    // Step 1: Microstructure Lead-Lag Interception
    // -------------------------------------------------------------
    const leadLagConfig = {
      maxLag: 5,
      decayFactor: 0.9,
      minObservations: 5,
      sensitivityBps: 1.5,
    };

    let crossState = initializeCrossCorrelationState(['BTC-PERP', 'ETH-PERP'], 5);
    const baseTime = 1_700_000_000_000;

    // Initialize initial prices
    crossState = updateTickCrossCorrelation(crossState, { symbol: 'BTC-PERP', price: 60000, timestampMs: baseTime }, leadLagConfig);
    crossState = updateTickCrossCorrelation(crossState, { symbol: 'ETH-PERP', price: 3000, timestampMs: baseTime + 1 }, leadLagConfig);

    // Simulate BTC leading ETH by 1 tick interval
    for (let i = 1; i <= 10; i++) {
      const btcPrice = 60000 * (1 + 0.005 * i);
      const ethPrice = 3000 * (1 + 0.005 * (i - 1));
      crossState = updateTickCrossCorrelation(crossState, { symbol: 'BTC-PERP', price: btcPrice, timestampMs: baseTime + i * 100 }, leadLagConfig);
      crossState = updateTickCrossCorrelation(crossState, { symbol: 'ETH-PERP', price: ethPrice, timestampMs: baseTime + i * 100 + 20 }, leadLagConfig);
    }

    const grangerScores = computeGrangerLeadLagMatrix(crossState, leadLagConfig);
    expect(grangerScores.length).toBe(2);

    const btcToEth = grangerScores.find((s) => s.leadSymbol === 'BTC-PERP' && s.followerSymbol === 'ETH-PERP');
    expect(btcToEth).toBeDefined();

    const interceptResult = interceptFollowerReservationPrice(crossState, 'ETH-PERP', leadLagConfig);
    expect(interceptResult.followerSymbol).toBe('ETH-PERP');
    expect(interceptResult.recommendedReservationPrice).toBeGreaterThan(0);

    // -------------------------------------------------------------
    // Step 2: Optimal Order Execution via Almgren-Chriss + VPIN
    // -------------------------------------------------------------
    const executionParams = {
      initialInventory: 50.0, // 50 ETH to execute
      horizonSeconds: 600,    // 10 minutes
      numIntervals: 10,       // 1-minute slices
      riskAversion: 5e-4,
      volatility: 0.03,
      temporaryImpact: 0.05,
    };

    // Normal regime execution
    const normalSchedule = generateAlmgrenChrissSchedule(executionParams, 0.4);
    expect(normalSchedule.slices.length).toBe(10);
    expect(normalSchedule.isThrottled).toBe(false);
    expect(normalSchedule.slices[0].orderType).toBe('aggressive_market');

    // Flow toxicity surge regime: VPIN CDF spikes to 0.96
    const toxicSchedule = generateAlmgrenChrissSchedule(executionParams, 0.96);
    expect(toxicSchedule.isThrottled).toBe(true);
    expect(toxicSchedule.totalDurationSeconds).toBeGreaterThan(executionParams.horizonSeconds);
    expect(toxicSchedule.slices[0].orderType).toBe('passive_maker');

    // Conservation of volume in both schedules
    const normalSum = normalSchedule.slices.reduce((acc, s) => acc + s.sliceQuantity, 0);
    const toxicSum = toxicSchedule.slices.reduce((acc, s) => acc + s.sliceQuantity, 0);
    expect(Math.abs(normalSum - 50.0)).toBeLessThan(1e-6);
    expect(Math.abs(toxicSum - 50.0)).toBeLessThan(1e-6);

    // -------------------------------------------------------------
    // Step 3: Multi-Venue Synthetic Portfolio Margin Rebalancing
    // -------------------------------------------------------------
    const venueSnapshots: VenueAccountSnapshot[] = [
      {
        venueId: 'CEX_BINANCE_PERP',
        balances: [
          { asset: 'USDT', amount: 100000, priceUsd: 1.0 },
          { asset: 'BTC', amount: 2.0, priceUsd: 60000 }, // 120k * 0.9 haircut = 108k
        ],
        positions: [
          { symbol: 'BTCUSDT', notionalUsd: 500000, maintenanceMarginRate: 0.04 }, // 20k margin -> ~9.6% util
        ],
      },
      {
        venueId: 'ONCHAIN_GMX_VAULT',
        balances: [
          { asset: 'USDC', amount: 30000, priceUsd: 1.0 }, // 30k collateral
        ],
        positions: [
          { symbol: 'ETH-USD', notionalUsd: 500000, maintenanceMarginRate: 0.05 }, // 25k margin -> 83.3% util (>75%)
        ],
      },
    ];

    const marginReport = calculatePortfolioMarginReport(venueSnapshots);
    expect(marginReport.isGlobalDeficit).toBe(false);
    expect(marginReport.venues.length).toBe(2);

    const gmxVenue = marginReport.venues.find((v) => v.venueId === 'ONCHAIN_GMX_VAULT');
    expect(gmxVenue?.status).toBe('REBALANCE_TRIGGERED');

    // Automatic rebalancing transfer generated from Binance to GMX
    expect(marginReport.recommendedTransfers.length).toBe(1);
    const transfer = marginReport.recommendedTransfers[0];
    expect(transfer.fromVenueId).toBe('CEX_BINANCE_PERP');
    expect(transfer.toVenueId).toBe('ONCHAIN_GMX_VAULT');
    expect(transfer.transferAmountUsd).toBeGreaterThan(1000);
    expect(transfer.postUtilizationTo).toBeLessThan(0.75);
  });
});
