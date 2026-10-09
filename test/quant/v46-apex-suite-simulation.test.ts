import { describe, it, expect } from 'vitest';
import { computeKissellIStarExecution } from '@/tree/quantlib/execution/kissell-istar-engine';
import { computeLsbSpread } from '@/tree/quantlib/microstructure/lsb-spread-engine';
import { analyzeIc } from '@/tree/alpha/factors/ic-analysis';
import { generateRiskAdvisory, constrainConfigByAdvisory } from '@/forest/research/tradingagents/risk-advisor';
import type { SymbolPanel } from '@/tree/alpha/factors/panel';
import type { RiskScenarioSet } from '@/tree/research/tradingagents/risk-scenario-set';
import type { PortfolioConfig } from '@/tree/alpha/portfolio/types';

describe('V46 Apex Suite E2E Cross-Domain Simulation', () => {
  it('integrates Kissell I-Star execution, LSB spread, factor IC analysis, and risk advisor', () => {
    // 1. Kissell & Malamut (2006) I-Star Non-Linear Execution
    const exec = computeKissellIStarExecution({
      initialShares: 5_000,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 5,
      dailyVolume: 500_000,
      dailyVolatility: 0.025,
    });
    expect(exec.terminalShares).toBe(0);
    expect(exec.trajectory.length).toBe(5);
    expect(exec.totalExecutionCost).toBeGreaterThan(0);

    // 2. Lin, Sanger & Booth (1995) LSB Spread Decomposition on Executed Prices
    const prices = [100, ...exec.trajectory.map((t) => t.executionPrice)];
    const lsb = computeLsbSpread({ transactionPrices: prices });
    expect(lsb.sampleSize).toBe(5);
    expect(lsb.effectiveSpread).toBeGreaterThan(0);
    expect(lsb.adverseSelectionRatio).toBeGreaterThanOrEqual(0);
    expect(lsb.orderProcessingRatio).toBeGreaterThanOrEqual(0);

    // 3. Modularized Factor IC Analysis
    const timestamps = [1000, 2000, 3000, 4000, 5000, 6000];
    const panels: SymbolPanel[] = [
      { symbol: 'BTC', timestamps, open: [10, 11, 12, 13, 14, 15], high: [11, 12, 13, 14, 15, 16], low: [9, 10, 11, 12, 13, 14], close: [10, 11, 12, 13, 14, 15], volume: [100, 100, 100, 100, 100, 100] },
      { symbol: 'ETH', timestamps, open: [5, 6, 7, 8, 9, 10], high: [6, 7, 8, 9, 10, 11], low: [4, 5, 6, 7, 8, 9], close: [5, 6, 7, 8, 9, 10], volume: [100, 100, 100, 100, 100, 100] },
      { symbol: 'SOL', timestamps, open: [1, 2, 3, 4, 5, 6], high: [2, 3, 4, 5, 6, 7], low: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5], close: [1, 2, 3, 4, 5, 6], volume: [100, 100, 100, 100, 100, 100] },
    ];
    const scores = {
      BTC: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      ETH: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      SOL: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    };
    const icResult = analyzeIc(panels, scores, { horizonBars: 1, minCrossSectionalSymbols: 3 });
    expect(icResult.icSeries.length).toBeGreaterThan(0);
    expect(icResult.validIcCount).toBeGreaterThanOrEqual(0);

    // 4. Modularized Risk Advisor Pipeline
    const riskSet: RiskScenarioSet = {
      goalId: 'goal-v46',
      proposalId: 'prop-v46',
      advisoryNote: 'Macro risk elevated',
      scenarios: [
        {
          view: 'conservative',
          expectedRegime: 'volatile',
          maxAcceptableExposure: 0.3,
          liquidityConcern: 'medium',
          volatilityConcern: 'high',
          correlationConcern: 'low',
          failureConditions: ['spread > 20bps'],
          keyRisks: ['liquidity dry-up'],
        },
      ],
    };
    const portConfig: PortfolioConfig = {
      targetVolatility: 0.15,
      maxPositionWeight: 0.2,
      maxGrossExposure: 1.0,
      maxNetExposure: 0.5,
      maxCorrelatedExposure: 0.4,
      correlationBucketThreshold: 0.7,
      maxBetaExposure: 0.3,
      maxTurnover: 0.2,
      drawdownThreshold: 0.1,
      deRiskFactor: 0.5,
    };
    const riskAdvisory = generateRiskAdvisory(riskSet, {
      riskInputs: {
        realizedVolatility: 0.12,
        correlationMatrix: new Map(),
        betas: new Map(),
        currentDrawdown: 0.02,
      },
      portfolioConfig: portConfig,
    });
    expect(riskAdvisory.advisories.length).toBe(1);
    expect(riskAdvisory.advisories[0]?.recommendedMaxExposure).toBe(0.3);

    const constrained = constrainConfigByAdvisory(portConfig, riskAdvisory);
    expect(constrained.maxGrossExposure).toBe(0.3);
    expect(constrained.maxNetExposure).toBe(0.3);
  });
});
