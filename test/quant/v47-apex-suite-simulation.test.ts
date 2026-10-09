import { describe, it, expect } from 'vitest';
import { computeKyleSmoothImpactExecution } from '@/tree/quantlib/execution/kyle-smooth-impact-engine';
import { computeHasbrouckFosterSpread } from '@/tree/quantlib/microstructure/hasbrouck-foster-spread-engine';
import { inferFeatureSource, validateFeatures, validateCost } from '@/tree/research/alpha/compile-stages';
import { makePosition, applyFill, computePnl, buildAlphaPortfolio, getSignalRejection } from '@/forest/alpha/execution/engine-positions';
import type { AlphaSignal } from '@/tree/alpha/types';
import type { FeatureDeclaration } from '@/tree/alpha/indicator-types';
import type { AlphaExecutionConfig } from '@/forest/alpha/execution/types';
import { RegimeLabel } from '@/tree/regime/types';

describe('V47 Apex Suite E2E Cross-Domain Simulation', () => {
  it('integrates smooth impact execution, order flow asymmetry, compile stages, and position engine', () => {
    // 1. Kyle, Obizhaeva & Wang (2020) Smooth Market Impact Execution
    const exec = computeKyleSmoothImpactExecution({
      initialShares: 6_000,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 6,
      dissipationRate: 1.5,
      impactParam: 0.08,
    });
    expect(exec.terminalShares).toBe(0);
    expect(exec.trajectory.length).toBe(6);
    expect(exec.totalExecutionCost).toBeGreaterThan(0);

    // 2. Hasbrouck & Foster (1995) Order Flow Asymmetry on Executed Trajectory
    const prices = [100, ...exec.trajectory.map((t) => t.executionPrice)];
    const spread = computeHasbrouckFosterSpread({ transactionPrices: prices });
    expect(spread.sampleSize).toBe(6);
    expect(spread.effectiveSpread).toBeGreaterThan(0);
    expect(spread.asymmetryIndex).toBeGreaterThanOrEqual(0);

    // 3. Modularized Alpha Compiler Stages
    expect(inferFeatureSource('funding_rate_zscore')).toBe('derivatives');
    expect(inferFeatureSource('orderbook_imbalance_ratio')).toBe('orderbook');
    const feat: FeatureDeclaration = {
      name: 'f1',
      source: 'ohlcv',
      lookback: 10,
      timeframe: '1d',
      availability: 'always',
      causal: true,
    };
    const featValidation = validateFeatures(
      [feat],
      ['f1'],
      { earliestTimestamp: 0, latestTimestamp: 100_000, barCount: 100 },
    );
    expect(featValidation.ok).toBe(true);
    expect(validateCost('normal').ok).toBe(true);

    // 4. Modularized Position Lifecycle & Portfolio Engine
    const signal: AlphaSignal = {
      name: 'v47-momentum',
      source: 'indicator',
      direction: 'buy',
      confidence: 0.85,
      timestamp: Date.now(),
      features: {
        symbol: 'BTCUSDT',
        features: [],
        computedAt: Date.now(),
        lookback: 14,
      },
      metadata: {},
    };
    const pos = makePosition(signal);
    expect(pos.direction).toBe('long');
    expect(pos.symbol).toBe('BTCUSDT');

    applyFill(pos, 100, 2);
    expect(pos.entryPrice).toBe(100);
    expect(pos.quantity).toBe(2);

    const pnl = computePnl(pos, 105);
    expect(pnl).toBe(10);

    const portfolio = buildAlphaPortfolio([pos], RegimeLabel.TREND_UP);
    expect(portfolio.totalExposure).toBe(200);
    expect(portfolio.openCount).toBe(1);

    const config: AlphaExecutionConfig = {
      enabled: true,
      minConfidence: 0.5,
      regimeFilter: [RegimeLabel.TREND_UP],
      maxPositions: 5,
      maxExposurePct: 1000,
      positionTimeoutMs: 60_000,
    };
    const rejection = getSignalRejection(signal, RegimeLabel.TREND_UP, config, [pos]);
    expect(rejection?.reason).toBe('duplicate_signal');
  });
});
