import { describe, it, expect } from 'vitest';
import { computeAlmgrenThumExecution } from '@/tree/quantlib/execution/almgren-thum-engine';
import { computeMrrSpread } from '@/tree/quantlib/microstructure/mrr-spread-engine';
import { estimateRollingHedgeRatio } from '@/tree/alpha/relative-value/hedge-ratio';
import { runPromotionGate } from '@/forest/alpha/gate/promotion-gate';
import type { PairPanel } from '@/tree/alpha/relative-value/types';
import type { PromotionGateInput } from '@/forest/alpha/gate/types';

describe('V45 Apex Suite E2E Cross-Domain Simulation', () => {
  it('integrates Almgren-Thum execution, MRR spread decomposition, modular hedge ratio, and promotion gate', () => {
    // 1. Almgren-Thum (2005) Non-Linear Market Impact Execution
    const exec = computeAlmgrenThumExecution({
      initialShares: 500,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 5,
      dailyVolume: 100_000,
      temporaryImpactFactor: 0.04,
      permanentImpactFactor: 0.01,
      powerExponent: 0.6,
    });
    expect(exec.terminalShares).toBe(0);
    expect(exec.trajectory.length).toBe(5);
    expect(exec.totalExecutionCost).toBeGreaterThan(0);

    // 2. MRR (1997) Spread Decomposition on Executed Price Series
    const prices = [100, ...exec.trajectory.map(t => t.executionPrice)];
    const mrr = computeMrrSpread({ prices });
    expect(mrr.sampleSize).toBe(5);
    expect(mrr.effectiveSpread).toBeGreaterThan(0);
    expect(mrr.orderProcessing).toBeGreaterThanOrEqual(0);
    expect(mrr.adverseSelection).toBeGreaterThanOrEqual(0);

    // 3. Modularized Hedge Ratio Engine
    const panel: PairPanel = {
      legA: 'BTC',
      legB: 'ETH',
      timestamps: [1, 2, 3, 4, 5, 6],
      closesA: [100, 102, 104, 106, 108, 110],
      closesB: [50, 51, 52, 53, 54, 55],
    };
    const hedge = estimateRollingHedgeRatio(panel, 5, 3, 7);
    expect(hedge.hedgeRatio).not.toBeNull();
    if (hedge.hedgeRatio !== null) {
      expect(hedge.hedgeRatio).toBeGreaterThan(0);
      expect(Number.isFinite(hedge.tStat)).toBe(true);
    }

    // 4. Modularized Promotion Gate Verification
    const input: PromotionGateInput = {
      financial: {
        numTrades: 50,
        expectancy: 1.5,
        profitFactor: 2.1,
        maxDrawdown: 0.1,
        sharpe: 2.2,
        sortino: 2.8,
        byRegime: {
          bull: { numTrades: 25, netPnl: 100 },
          bear: { numTrades: 25, netPnl: 80 },
        },
      },
      stress: {
        netPnlNormal: 200,
        netPnlConservative: 150,
        netPnlAdverse: 100,
        netPnlExtreme: 50,
      },
      robustness: {
        parameterSpread: 0.15,
        crossPeriodPositiveFraction: 0.85,
        crossAssetPositiveFraction: 0.8,
        crossAssetApplicable: true,
        leakageViolations: 0,
        windowPnls: [30, 40, 35, 45, 50],
        baselineCandidate: { sharpe: 2.2, netPnl: 200 },
        baselineBuyHold: { sharpe: 1.0, netPnl: 50 },
        baselineRandomEntry: { sharpe: 0.1, netPnl: 10 },
        hashMatches: true,
        hashDetails: { recordedHash: 'sha-v45-valid', expectedHash: 'sha-v45-valid' },
      },
    };

    const gate = runPromotionGate(input);
    expect(gate.passed).toBe(true);
    expect(gate.verdict).toBe('PASSED');
    expect(gate.checks.length).toBe(15);
  });
});
