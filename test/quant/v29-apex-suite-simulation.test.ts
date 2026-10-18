import { describe, expect, it } from 'vitest';
import { computeGueantExecution } from '../../src/tree/quantlib/execution/gueant-engine';
import { computeBackBaruchEquilibrium } from '../../src/tree/quantlib/microstructure/back-baruch-engine';
import { buildRelativeValueReport } from '../../src/forest/alpha/relative-value-eval/report';
import { generateResearchReport } from '../../src/forest/alpha/reports/generator';
import type { PairSimResult } from '../../src/tree/alpha/relative-value';
import type { RelativeValueEvalConfig } from '../../src/forest/alpha/relative-value-eval/types';
import type { Experiment } from '../../src/forest/alpha/experiments/types';
import type { EvaluationReport } from '../../src/forest/alpha/evaluation/report';
import type { AttributionReport } from '../../src/forest/alpha/attribution/types';
import { RegimeLabel } from '../../src/tree/regime/types';

describe('Triad v29 Apex Multi-Domain Cross-Engine Integration Test', () => {
  it('integrates Guéant execution, Back-Baruch microstructure, relative-value report, and research generator', () => {
    // 1. Back-Baruch equilibrium price discovery
    const micro = computeBackBaruchEquilibrium({ timeHorizon: 1.0, numSteps: 10, priorVariance: 0.81, noiseVolatility: 0.3, fundamentalValue: 50 });
    expect(micro.averageLambda).toBeGreaterThan(0);
    expect(micro.finalDiscoveryEfficiency).toBeCloseTo(1.0, 5);

    // 2. Guéant optimal execution using market depth lambda from Back-Baruch
    const exec = computeGueantExecution({
      totalShares: 25_000, timeHorizon: 1.0, numSteps: 10, impactParam: micro.averageLambda * 0.001,
      powerLawExponent: 0.6, riskAversion: 0.0002, terminalPenalty: 0.01,
    });
    expect(exec.trajectory.length).toBe(10);
    expect(exec.terminalShares).toBe(0);
    expect(exec.expectedCost).toBeGreaterThan(0);

    // 3. Modularized Relative Value Report builder
    const sim: PairSimResult = {
      periods: [{
        timestamp: 1_700_000_000_000, position: 'flat', hedgeRatio: 1.0, zScore: 0, weights: {},
        turnover: 0, costPct: 0, grossReturn: 0.01, netReturn: 0.01, grossExposure: 0, netExposure: 0,
      }],
      equityCurve: [1.0, 1.01], totalTurnover: 0, totalCosts: 0, tradeCount: 0, warnings: [], validationTrail: [],
    };

    const rvConfig: RelativeValueEvalConfig = {
      experimentId: 'exp-rv-v29', timeframe: '1h', periodsPerYear: 8760, hedgeWindow: 20, zWindow: 10,
      minObs: 4, entryZ: 2.0, exitZ: 0.5, maxHalfLife: 30, minCorrelation: 0.5,
      validationWindow: 20, revalidateEvery: 2, minObservations: 4,
    };

    const rvReport = buildRelativeValueReport(sim, rvConfig);
    expect(rvReport.experimentId).toBe('exp-rv-v29');
    expect(rvReport.tradeCount).toBe(0);
    expect(rvReport.netReturn).toBeCloseTo(0.01, 4);

    // 4. Modularized Research Report generator
    const experiment = {
      id: 'exp-v29-research', hypothesis: 'Guéant-Back-Baruch Execution & Microstructure Alpha',
      dataset: 'crypto-1h', symbol: 'BTC/USDT', timeframe: '1h', featureSet: { features: [] },
      regimeFilter: [RegimeLabel.TREND_UP], entryRule: { type: 'threshold', conditions: [] },
      exitRule: { type: 'threshold', conditions: [] }, positionSizing: { method: 'fixed', value: 1 },
      feeModel: { makerFee: 0.0002, takerFee: 0.0004 }, slippageModel: { model: 'fixed', value: 0.0001 },
      trainPeriod: { start: '2025-01-01', end: '2025-06-01' },
      validationPeriod: { start: '2025-06-01', end: '2025-09-01' },
      testPeriod: { start: '2025-09-01', end: '2025-12-01' }, configSnapshot: {},
    } as unknown as Experiment;

    const evalReport = {
      experimentId: 'exp-v29-research', totalReturn: 0.15, netPnl: 15_000, sharpe: 1.85,
      maxDrawdown: 0.08, sortino: 2.2, winRate: 0.58, trades: 120,
    } as unknown as EvaluationReport;

    const attribution = { experimentId: 'exp-v29-research', components: [] } as unknown as AttributionReport;
    const researchReport = generateResearchReport({ experiment, evaluation: evalReport, baseline: null, attribution });

    expect(researchReport.title).toContain('Guéant-Back-Baruch');
    expect(researchReport.summary.totalReturn).toBe(0.15);
    expect(researchReport.summary.sharpe).toBe(1.85);
    expect(researchReport.regimeAnalysis[RegimeLabel.TREND_UP]).toBeDefined();
  });
});
