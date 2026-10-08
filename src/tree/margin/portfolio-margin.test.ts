/**
 * @file portfolio-margin.test.ts
 * @description Comprehensive test suite for Phase 3 Multi-Venue Synthetic Portfolio Margin Router.
 */

import { describe, expect, it } from 'vitest';
import type { MarginRouterConfig, VenueAccountSnapshot } from './portfolio-margin-types';
import {
  calculateEffectiveCollateral,
  calculateRequiredMaintenanceMargin,
  evaluateVenueMarginHealth,
} from './synthetic-margin-calculator';
import { calculatePortfolioMarginReport } from './collateral-rebalance-router';

describe('Phase 3: Synthetic Portfolio Margin & Collateral Rebalancing', () => {
  const customConfig: MarginRouterConfig = {
    rebalanceThresholdPct: 0.75,
    criticalThresholdPct: 0.85,
    targetSafeUtilizationPct: 0.55,
    minTransferAmountUsd: 100,
    assetHaircuts: {
      USDT: 1.0,
      BTC: 0.9,
      ETH: 0.85,
    },
  };

  it('applies tiered haircuts to nominal collateral amounts', () => {
    const balances = [
      { asset: 'USDT', amount: 10000, priceUsd: 1.0 },
      { asset: 'BTC', amount: 1.0, priceUsd: 50000 },
      { asset: 'UNKNOWN', amount: 100, priceUsd: 10 }, // fallback haircut 0.5
      { asset: 'ZERO', amount: 0, priceUsd: 10 },
    ];

    const result = calculateEffectiveCollateral(balances, customConfig.assetHaircuts);
    expect(result.nominalUsd).toBe(10000 + 50000 + 1000);
    // Effective: 10000 * 1.0 + 50000 * 0.9 + 1000 * 0.5 = 10000 + 45000 + 500 = 55500
    expect(result.effectiveUsd).toBe(55500);
  });

  it('calculates required maintenance margin accurately across positions', () => {
    const positions = [
      { symbol: 'BTC', notionalUsd: 10000, maintenanceMarginRate: 0.05 },
      { symbol: 'ETH', notionalUsd: 5000, maintenanceMarginRate: 0.1 },
    ];
    const margin = calculateRequiredMaintenanceMargin(positions);
    expect(margin).toBe(500 + 500);
  });

  it('evaluates required maintenance margin and venue health status correctly', () => {
    const snapshot: VenueAccountSnapshot = {
      venueId: 'BINANCE_SUB_1',
      balances: [{ asset: 'USDT', amount: 10000, priceUsd: 1.0 }],
      positions: [
        { symbol: 'BTCUSDT', notionalUsd: 100000, maintenanceMarginRate: 0.05 }, // 5000 margin
        { symbol: 'INVALID', notionalUsd: 0, maintenanceMarginRate: 0.05 },
      ],
    };

    const health = evaluateVenueMarginHealth(snapshot, customConfig);
    expect(health.nominalCollateralUsd).toBe(10000);
    expect(health.effectiveCollateralUsd).toBe(10000);
    expect(health.requiredMaintenanceMarginUsd).toBe(5000);
    expect(health.marginUtilization).toBe(0.5);
    expect(health.status).toBe('SAFE');
    expect(health.liquidationDistanceUsd).toBe(5000);
  });

  it('flags WARNING, REBALANCE_TRIGGERED, and CRITICAL status thresholds', () => {
    const makeSnapshot = (marginRate: number): VenueAccountSnapshot => ({
      venueId: 'VENUE',
      balances: [{ asset: 'USDT', amount: 10000, priceUsd: 1.0 }],
      positions: [{ symbol: 'BTC', notionalUsd: 100000, maintenanceMarginRate: marginRate }],
    });

    const warn = evaluateVenueMarginHealth(makeSnapshot(0.065), customConfig);
    expect(warn.status).toBe('WARNING');

    const rebalance = evaluateVenueMarginHealth(makeSnapshot(0.078), customConfig);
    expect(rebalance.status).toBe('REBALANCE_TRIGGERED');

    const critical = evaluateVenueMarginHealth(makeSnapshot(0.09), customConfig);
    expect(critical.status).toBe('CRITICAL');

    // Zero collateral with positions
    const zeroCollateral: VenueAccountSnapshot = {
      venueId: 'INSOLVENT',
      balances: [],
      positions: [{ symbol: 'BTC', notionalUsd: 10000, maintenanceMarginRate: 0.05 }],
    };
    const insolvent = evaluateVenueMarginHealth(zeroCollateral, customConfig);
    expect(insolvent.marginUtilization).toBe(1.0);
    expect(insolvent.status).toBe('CRITICAL');
  });

  it('generates optimal rebalancing transfer when a venue breaches 75% utilization', () => {
    const venues: VenueAccountSnapshot[] = [
      {
        venueId: 'SURPLUS_VENUE',
        balances: [{ asset: 'USDT', amount: 50000, priceUsd: 1.0 }],
        positions: [{ symbol: 'BTC', notionalUsd: 100000, maintenanceMarginRate: 0.02 }], // 2000 margin, ~4% util
      },
      {
        venueId: 'DEFICIT_VENUE',
        balances: [{ asset: 'USDT', amount: 10000, priceUsd: 1.0 }],
        positions: [{ symbol: 'ETH', notionalUsd: 160000, maintenanceMarginRate: 0.05 }], // 8000 margin, 80% util
      },
    ];

    const report = calculatePortfolioMarginReport(venues, customConfig);
    expect(report.isGlobalDeficit).toBe(false);
    expect(report.recommendedTransfers.length).toBe(1);

    const transfer = report.recommendedTransfers[0];
    expect(transfer.fromVenueId).toBe('SURPLUS_VENUE');
    expect(transfer.toVenueId).toBe('DEFICIT_VENUE');
    expect(transfer.transferAmountUsd).toBeGreaterThan(100);
    expect(transfer.postUtilizationTo).toBeLessThan(0.75);
  });

  it('flags global deficit and suppresses transfers when portfolio aggregate utilization >= 100%', () => {
    const venues: VenueAccountSnapshot[] = [
      {
        venueId: 'DISTRESSED_1',
        balances: [{ asset: 'USDT', amount: 2000, priceUsd: 1.0 }],
        positions: [{ symbol: 'BTC', notionalUsd: 50000, maintenanceMarginRate: 0.05 }], // 2500 margin > 2000
      },
      {
        venueId: 'DISTRESSED_2',
        balances: [{ asset: 'USDT', amount: 2000, priceUsd: 1.0 }],
        positions: [{ symbol: 'ETH', notionalUsd: 50000, maintenanceMarginRate: 0.05 }], // 2500 margin > 2000
      },
    ];

    const report = calculatePortfolioMarginReport(venues, customConfig);
    expect(report.isGlobalDeficit).toBe(true);
    expect(report.recommendedTransfers.length).toBe(0);
  });

  it('returns zero transfers for balanced healthy portfolio', () => {
    const venues: VenueAccountSnapshot[] = [
      {
        venueId: 'HEALTHY_1',
        balances: [{ asset: 'USDT', amount: 20000, priceUsd: 1.0 }],
        positions: [{ symbol: 'BTC', notionalUsd: 50000, maintenanceMarginRate: 0.05 }], // 2500 margin = 12.5% util
      },
      {
        venueId: 'HEALTHY_2',
        balances: [{ asset: 'USDT', amount: 20000, priceUsd: 1.0 }],
        positions: [{ symbol: 'ETH', notionalUsd: 50000, maintenanceMarginRate: 0.05 }], // 2500 margin = 12.5% util
      },
    ];

    const report = calculatePortfolioMarginReport(venues, customConfig);
    expect(report.isGlobalDeficit).toBe(false);
    expect(report.recommendedTransfers.length).toBe(0);
  });
});
