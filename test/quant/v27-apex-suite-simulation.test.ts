import { describe, it, expect } from 'vitest';
import { computeCarteaJaimungalOfiExecution } from '@/tree/quantlib/execution/cartea-jaimungal-ofi-engine';
import { computeFosterViswanathanEquilibrium } from '@/tree/quantlib/microstructure/foster-viswanathan-engine';
import { logReturns, stdDev, mean, zScore, linearSlope } from '@/tree/regime/feature-helpers';
import {
  assertInputs,
  causalSlice,
  VALIDATION_REASONS,
} from '@/tree/alpha/relative-value/validation-helpers';
import type { PairPanel } from '@/tree/alpha/relative-value/types';

describe('Triad v27 Apex Suite Cross-Domain End-to-End Simulation', () => {
  it('integrates microstructure information dynamics into OFI execution scheduling & regime features', () => {
    // 1. Foster-Viswanathan Microstructure estimation
    const fvResult = computeFosterViswanathanEquilibrium({
      numTraders: 4,
      numRounds: 6,
      priorVariance: 0.8,
      noiseVariance: 0.15,
      signalCorrelation: 0.4,
    });
    expect(fvResult.totalInformationRevealed).toBeGreaterThan(0);
    expect(fvResult.averageMarketDepth).toBeGreaterThan(0);

    // 2. Calibrate Cartea-Jaimungal OFI execution using adverse selection and depth
    const effectiveDrift = (fvResult.totalInformationRevealed / fvResult.stages.length) * 0.1;
    const ofiResult = computeCarteaJaimungalOfiExecution({
      totalShares: 50000,
      timeHorizon: 2.0,
      numSteps: 10,
      temporaryImpact: 1 / Math.max(1, fvResult.averageMarketDepth),
      permanentImpact: 0.0001,
      riskAversion: 0.02,
      ofiDrift: effectiveDrift,
      volatility: Math.sqrt(fvResult.terminalUncertainty),
    });

    expect(ofiResult.trajectory.length).toBe(10);
    expect(ofiResult.trajectory[9].remainingShares).toBe(0);
    expect(ofiResult.expectedCost).toBeGreaterThan(0);

    // 3. Regime feature helper validations on execution trajectory
    const speeds = ofiResult.trajectory.map((s) => s.tradeSpeed);
    const m = mean(speeds);
    const s = stdDev(speeds);
    const slope = linearSlope(speeds);
    const z = zScore(speeds[0], speeds);

    expect(m).toBeGreaterThan(0);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(slope)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);

    const syntheticCloses = [100, 101, 102, 101.5, 103];
    const rets = logReturns(syntheticCloses);
    expect(rets.length).toBe(4);

    // 4. Relative value tradability gate validations
    const panel: PairPanel = {
      legA: 'BTC/USDT',
      legB: 'ETH/USDT',
      timestamps: [1000, 2000, 3000, 4000, 5000],
      closesA: [10, 11, 12, 13, 14],
      closesB: [20, 22, 24, 26, 28],
    };
    const config = {
      validationWindow: 5,
      minObs: 10,
      maxHalfLife: 30,
      minCorrelation: 0.8,
    };

    assertInputs(panel, config, 6000);
    const sliced = causalSlice(panel, 3, 5000);
    expect(sliced.timestamps.length).toBe(3);
    expect(VALIDATION_REASONS.insufficientObservations).toBeDefined();
  });
});
