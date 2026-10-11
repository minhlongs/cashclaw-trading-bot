import { describe, it, expect } from 'vitest';
import { computeGatheralRoughExecution } from '@/tree/quantlib/execution/gatheral-rough-execution-engine';
import { computeChordiaCommonality } from '@/tree/quantlib/microstructure/chordia-subrahmanyam-liquidity-engine';
import { declareFeature, type FeatureDeclaration, type IndicatorCandle } from '@/tree/alpha/indicator-types';
import { DEFAULT_PROMOTION_GATE_CONFIG, type PromotionGateInput } from '@/forest/alpha/gate/types';

describe('V48 Apex Suite E2E Cross-Domain Simulation', () => {
  it('integrates rough execution, liquidity commonality, modular indicators, and gate types', () => {
    // 1. Gatheral, Jaisson & Rosenbaum (2018) Rough Volatility Execution
    const exec = computeGatheralRoughExecution({
      initialShares: 8_000,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 8,
      hurstParameter: 0.15,
      impactParam: 0.06,
    });
    expect(exec.terminalShares).toBe(0);
    expect(exec.trajectory.length).toBe(8);
    expect(exec.totalExecutionCost).toBeGreaterThan(0);

    // 2. Chordia, Roll & Subrahmanyam (2000) Commonality in Liquidity
    const assetSpreads = exec.trajectory.map((t) => t.roughImpact * 0.1 + 0.05);
    const comm = computeChordiaCommonality({ assetSpreads });
    expect(comm.sampleSize).toBe(7);
    expect(comm.averageAssetSpread).toBeGreaterThan(0);
    expect(comm.commonalityRSquared).toBeGreaterThanOrEqual(0);

    // 3. Modularized Indicator Types Contract
    const candle: IndicatorCandle = {
      timestamp: 1_700_000_000,
      open: 100,
      high: 105,
      low: 99,
      close: 104,
      volume: 1_000,
    };
    expect(candle.close).toBe(104);

    const featDecl: FeatureDeclaration = {
      name: 'v48_rough_hurst',
      timeframe: '1h',
      source: 'ohlcv',
      lookback: 50,
      availability: 'always',
      causal: true,
    };
    const validatedFeat = declareFeature(featDecl);
    expect(validatedFeat.name).toBe('v48_rough_hurst');
    expect(() => declareFeature({ ...featDecl, causal: false })).toThrow(/non-causal/);

    // 4. Modularized Promotion Gate Types Contract
    expect(DEFAULT_PROMOTION_GATE_CONFIG.minTrades).toBe(30);
    expect(DEFAULT_PROMOTION_GATE_CONFIG.maxDrawdown).toBe(0.25);

    const gateInput: PromotionGateInput = {
      financial: {
        numTrades: 50,
        expectancy: 1.5,
        profitFactor: 1.8,
        maxDrawdown: 0.12,
        sharpe: 2.1,
        sortino: 2.8,
        byRegime: {},
      },
      stress: {
        netPnlNormal: 5000,
        netPnlConservative: 4200,
        netPnlAdverse: 3000,
        netPnlExtreme: 1500,
      },
      robustness: {
        parameterSpread: 0.15,
        crossPeriodPositiveFraction: 0.8,
        leakageViolations: 0,
        windowPnls: [100, 200, 150],
        baselineCandidate: { sharpe: 2.1, netPnl: 5000 },
        baselineBuyHold: { sharpe: 1.0, netPnl: 2000 },
        baselineRandomEntry: { sharpe: 0.2, netPnl: -500 },
        hashMatches: true,
      },
    };
    expect(gateInput.financial.expectancy).toBe(1.5);
    expect(gateInput.robustness.leakageViolations).toBe(0);
  });
});
