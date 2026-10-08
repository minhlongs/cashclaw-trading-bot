/**
 * @file lead-lag.test.ts
 * @description Comprehensive test suite for Phase 1 Lead-Lag matrix and microstructure latency interceptor.
 */

import { describe, expect, it } from 'vitest';
import {
  initializeCrossCorrelationState,
  updateTickCrossCorrelation,
  getPairLagMetrics,
} from './tick-cross-correlator';
import {
  computeGrangerScore,
  computeGrangerLeadLagMatrix,
} from './granger-lead-lag-matrix';
import { interceptFollowerReservationPrice } from './microstructure-latency-interceptor';
import type { LeadLagConfig } from './lead-lag-types';

describe('Phase 1: Cross-Asset Lead-Lag & Granger Interceptor', () => {
  const config: LeadLagConfig = {
    maxLag: 5,
    decayFactor: 0.9,
    minObservations: 5,
    sensitivityBps: 1.0,
  };

  it('initializes cross-correlation state with symmetric pair keys', () => {
    const symbols = ['BTC-USDT', 'ETH-USDT'];
    const state = initializeCrossCorrelationState(symbols, 5);

    expect(state.symbols).toEqual(symbols);
    expect(state.lastPrices['BTC-USDT']).toBe(0);
    expect(state.lagCovariances['BTC-USDT:ETH-USDT']).toBeDefined();
    expect(state.lagCovariances['ETH-USDT:BTC-USDT']).toBeDefined();
  });

  it('ignores invalid or unknown tick symbols and zero prices', () => {
    let state = initializeCrossCorrelationState(['BTC-USDT', 'ETH-USDT'], 5);
    const unkTick = { symbol: 'SOL-USDT', price: 100, timestampMs: 1000 };
    const invalidPrice = { symbol: 'BTC-USDT', price: 0, timestampMs: 1000 };

    state = updateTickCrossCorrelation(state, unkTick, config);
    expect(state.observationCounts['BTC-USDT']).toBe(0);

    state = updateTickCrossCorrelation(state, invalidPrice, config);
    expect(state.observationCounts['BTC-USDT']).toBe(0);
  });

  it('updates returns, variance, and covariances with simulated lead-lag pattern', () => {
    let state = initializeCrossCorrelationState(['LEAD', 'LAG'], 5);
    const startTime = 1_000_000;

    // First price initialization
    state = updateTickCrossCorrelation(state, { symbol: 'LEAD', price: 100, timestampMs: startTime }, config);
    state = updateTickCrossCorrelation(state, { symbol: 'LAG', price: 50, timestampMs: startTime + 10 }, config);

    // Feed correlated ticks where LAG follows LEAD by 1 step
    const pricesLead = [101, 102, 101, 103, 104, 105, 103, 106, 107, 108];
    const pricesLag = [50, 50.5, 51, 50.5, 51.5, 52, 52.5, 51.5, 53, 53.5];

    for (let i = 0; i < pricesLead.length; i++) {
      state = updateTickCrossCorrelation(
        state,
        { symbol: 'LEAD', price: pricesLead[i], timestampMs: startTime + (i + 1) * 100 },
        config
      );
      state = updateTickCrossCorrelation(
        state,
        { symbol: 'LAG', price: pricesLag[i], timestampMs: startTime + (i + 1) * 100 + 50 },
        config
      );
    }

    const metrics = getPairLagMetrics(state, 'LEAD', 'LAG', 1);
    expect(metrics.lag).toBe(1);
    expect(metrics.correlation).toBeGreaterThan(-1);
    expect(metrics.correlation).toBeLessThanOrEqual(1);

    const scores = computeGrangerLeadLagMatrix(state, config);
    expect(scores.length).toBe(2);

    const leadToLag = scores.find((s) => s.leadSymbol === 'LEAD' && s.followerSymbol === 'LAG');
    expect(leadToLag).toBeDefined();
    expect(leadToLag?.optimalLag).toBeGreaterThanOrEqual(1);
  });

  it('correctly reports not leading when observations are below minimum', () => {
    const state = initializeCrossCorrelationState(['A', 'B'], 5);
    const score = computeGrangerScore(state, 'A', 'B', config);

    expect(score.isLeading).toBe(false);
    expect(score.causalityScore).toBe(0);
    expect(score.peakCorrelation).toBe(0);
  });

  it('intercepts follower reservation price drift based on leader momentum', () => {
    let state = initializeCrossCorrelationState(['LEAD', 'LAG'], 5);
    const startTime = 2_000_000;

    // Seed enough observations
    state = updateTickCrossCorrelation(state, { symbol: 'LEAD', price: 100, timestampMs: startTime }, config);
    state = updateTickCrossCorrelation(state, { symbol: 'LAG', price: 200, timestampMs: startTime + 1 }, config);

    for (let i = 1; i <= 15; i++) {
      const p1 = 100 * (1 + 0.01 * i);
      const p2 = 200 * (1 + 0.01 * (i - 1));
      state = updateTickCrossCorrelation(state, { symbol: 'LEAD', price: p1, timestampMs: startTime + i * 10 }, config);
      state = updateTickCrossCorrelation(state, { symbol: 'LAG', price: p2, timestampMs: startTime + i * 10 + 5 }, config);
    }

    const intercept = interceptFollowerReservationPrice(state, 'LAG', config);
    expect(intercept.followerSymbol).toBe('LAG');
    expect(intercept.recommendedReservationPrice).toBeGreaterThan(0);

    // Edge case: follower price <= 0
    const emptyState = initializeCrossCorrelationState(['A', 'B'], 5);
    const zeroResult = interceptFollowerReservationPrice(emptyState, 'A', config);
    expect(zeroResult.recommendedReservationPrice).toBe(0);
    expect(zeroResult.actionRequired).toBe(false);
  });
});
