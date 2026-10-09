import { describe, expect, it } from 'vitest';
import { computeLehalleNeumanExecution } from '../../src/tree/quantlib/execution/lehalle-neuman-engine';
import { computeHoldenSubrahmanyamEquilibrium } from '../../src/tree/quantlib/microstructure/holden-subrahmanyam-engine';
import { assertPositiveCloses, validateStructure } from '../../src/tree/alpha/relative-value/pair-period';
import { buildCrossSectionalReport } from '../../src/forest/alpha/cross-sectional-eval/report.builder';
import type { PairPanel, PairSimConfig } from '../../src/tree/alpha/relative-value/types';
import type { CrossSectionalSimResult } from '../../src/tree/alpha/cross-sectional/types';
import { RegimeLabel } from '../../src/tree/regime/types';

describe('Triad v28 Apex Multi-Domain Cross-Engine Integration Test', () => {
  it('integrates Lehalle-Neuman, Holden-Subrahmanyam, modular pair-period, and cross-sectional report builder', () => {
    // 1. Holden-Subrahmanyam equilibrium models price discovery
    const micro = computeHoldenSubrahmanyamEquilibrium({
      numTraders: 4,
      numRounds: 6,
      priorVariance: 0.8,
      noiseVariance: 0.2,
      riskAversion: 0.3,
    });
    expect(micro.totalInformationRevealed).toBeGreaterThan(0);

    // 2. Derive signal alpha from price efficiency and execute via Lehalle-Neuman
    const signalAlpha = micro.stages[micro.stages.length - 1]!.priceEfficiency * 0.05;
    const exec = computeLehalleNeumanExecution({
      totalShares: 50_000,
      timeHorizon: 2.0,
      numSteps: 12,
      temporaryImpact: 0.0008,
      permanentImpact: 0.0004,
      riskAversion: 0.001,
      signalAlpha,
      signalDecay: 1.5,
    });
    expect(exec.trajectory.length).toBe(12);
    expect(exec.trajectory[11]!.remainingShares).toBe(0);

    // 3. Verify pair-period validation
    const panel: PairPanel = {
      timestamps: [1000, 2000, 3000, 4000, 5000],
      closesA: [100, 101, 102, 103, 104],
      closesB: [50, 51, 52, 53, 54],
      legA: 'BTC/USDT',
      legB: 'ETH/USDT',
    };
    const config: PairSimConfig = {
      hedgeWindow: 20,
      zWindow: 10,
      minObs: 4,
      entryZ: 2.0,
      exitZ: 0.5,
      maxHalfLife: 30,
      minCorrelation: 0.5,
      validationWindow: 20,
      revalidateEvery: 2,
      minObservations: 4,
    };
    expect(() => assertPositiveCloses(panel, 'test')).not.toThrow();
    expect(() => validateStructure(panel, config)).not.toThrow();

    // 4. Verify modularized cross-sectional report builder
    const simResult: CrossSectionalSimResult = {
      periods: [
        {
          timestamp: 1000,
          weights: { 'BTC/USDT': 0.5, 'ETH/USDT': -0.5 },
          turnover: 0.1,
          costPct: 0.001,
          grossReturn: 0.01,
          netReturn: 0.009,
          grossExposure: 1.0,
          netExposure: 0.0,
        },
      ],
      equityCurve: [1.0, 1.009],
      totalTurnover: 0.1,
      totalCosts: 0.001,
      warnings: [],
    };

    const report = buildCrossSectionalReport(simResult, {
      experimentId: 'exp-v28',
      symbol: 'PORTFOLIO',
      timeframe: '1d',
      regime: RegimeLabel.TREND_UP,
      periodsPerYear: 252,
    });
    expect(report.experimentId).toBe('exp-v28');
    expect(report.periodCount).toBe(1);
    expect(report.netReturn).toBeCloseTo(0.009, 3);
  });
});
