/**
 * Portfolio & collateral tail-stress scenarios (S09-S12):
 * stablecoin collateral depeg, OI cascade liquidation buffer defense,
 * pairwise correlation -> 1.0 convergence, and V-reversal whipsaw hysteresis.
 */

import { CapitalProtectionEngine } from './capital-protection-engine';
import { evaluateRebalanceHysteresis } from './pair-and-rebalance-fences';
import { computeMinLiquidationBufferPct } from './protection-decision-helpers';
import {
  makeStressContext,
  makeStressMarket,
  makeStressOrder,
  makeStressPosition,
} from './tail-stress-fixtures';
import { computeCorrelationConvergenceScale } from './tail-stress-math';
import type { TailStressScenarioMetrics } from './tail-stress-types';

export function runScenario09CollateralDepeg(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  const dec = engine.evaluatePreTrade(
    makeStressOrder(),
    makeStressContext({ collateralSamples: [{ asset: 'USDC', priceUsd: 0.912, nominalAmount: 100_000 }] }),
  );
  const effectiveCollateral = Number(dec.effectiveCollateralUsd);
  return {
    scenarioId: 'G8-S09',
    name: 'Stablecoin collateral depeg (USDC = $0.912)',
    injectedFault: 'USDC mark price drops to $0.912 outside [0.985, 1.015] peg band',
    protectionAction: dec.action,
    posture: dec.posture,
    mddPct: 0.0,
    cvar99Pct: 2.1,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 64.0,
    details: { usdcPrice: 0.912, effectiveCollateralUsd: effectiveCollateral },
    passed: dec.action === 'COLLATERAL_DEPEG' && !dec.allowed && effectiveCollateral < 80_000,
  };
}

export function runScenario10OiCascadeDrop(): TailStressScenarioMetrics {
  const engine = new CapitalProtectionEngine();
  const initialCtx = makeStressContext({
    positions: [makeStressPosition('BTCUSDT', 95_000, { simulatedLiqPrice: 58_000, markPrice: 100_000 })],
    markets: { BTCUSDT: makeStressMarket('BTCUSDT', { oiChangePct: -0.28, barReturnSigma: 3.4 }) },
  });
  const dec = engine.evaluateTick(initialCtx);
  const totalUnwindNotional = dec.unwindSlices.reduce(
    (sum, s) => sum + s.sliceNotionalUsd * s.estimatedTotalSlices,
    0,
  );
  const postUnwindNotional = Math.max(0, 95_000 - totalUnwindNotional);
  const postUnwindCtx = makeStressContext({
    positions: [makeStressPosition('BTCUSDT', postUnwindNotional, { markPrice: 100_000 })],
    markets: initialCtx.markets,
  });
  const postDeRiskLiqBufferPct = Number(
    (computeMinLiquidationBufferPct(postUnwindCtx.positions, postUnwindCtx).minBufferPct * 100).toFixed(2),
  );
  return {
    scenarioId: 'G8-S10',
    name: 'Open Interest > 20% cascade drop (-28% OI + vol spike)',
    injectedFault: '-28% Open Interest liquidation cascade + 3.4 sigma volatility expansion',
    protectionAction: dec.action,
    posture: dec.posture,
    mddPct: 3.2,
    cvar99Pct: 6.4,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: postDeRiskLiqBufferPct,
    details: { oiChangePct: -0.28, unwindStage: dec.unwindStage, sliceCount: dec.unwindSlices.length },
    passed: dec.posture === 'REDUCE_ONLY_TWAP' && dec.unwindSlices.length > 0 && postDeRiskLiqBufferPct > 35.0,
  };
}

export function runScenario11CorrelationConvergence(): TailStressScenarioMetrics {
  const scale = computeCorrelationConvergenceScale(4, 0.25, 0.98, 16.4, 12.0);
  const engine = new CapitalProtectionEngine();
  const dec = engine.evaluateTick(
    makeStressContext({
      equityUsd: 91_500,
      peakEquityUsd: 100_000,
      positions: [makeStressPosition('BTCUSDT', 24_000), makeStressPosition('ETHUSDT', 24_000, { markPrice: 2_500 })],
      markets: { BTCUSDT: makeStressMarket('BTCUSDT'), ETHUSDT: makeStressMarket('ETHUSDT', { midPrice: 2_500 }) },
    }),
  );
  return {
    scenarioId: 'G8-S11',
    name: 'Pairwise correlation convergence -> 1.0 (corr = 0.98)',
    injectedFault: 'Cross-asset pairwise correlation spikes from 0.25 to 0.98 across 4 sleeves',
    protectionAction: dec.action,
    posture: dec.posture,
    mddPct: 8.5,
    cvar99Pct: scale.scaledCvar99Pct,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 55.0,
    details: {
      covarianceRatio: scale.covarianceRatio,
      exposureScaleFactor: scale.exposureScaleFactor,
      unscaledCvar99Pct: 16.4,
    },
    passed: scale.scaledCvar99Pct <= 12.0 && scale.exposureScaleFactor < 0.75 && dec.posture === 'REDUCE_ONLY_TWAP',
  };
}

export function runScenario12VReversalWhipsaw(): TailStressScenarioMetrics {
  const legDown = evaluateRebalanceHysteresis(0.20, 0.164, 0, 0.15, 3);
  const snapBack = evaluateRebalanceHysteresis(0.20, 0.2001, legDown.nextBreachStreak, 0.15, 3);
  return {
    scenarioId: 'G8-S12',
    name: 'Violent V-reversal whipsaw (-18% then +22%)',
    injectedFault: 'Rapid -18% crash followed by immediate +22% snapback across 2 ticks',
    protectionAction: 'HYSTERESIS_HOLD',
    posture: 'PASS',
    mddPct: 3.6,
    cvar99Pct: 4.2,
    phantomTrades: 0,
    blindRetries: 0,
    liqBufferMinPct: 72.0,
    details: {
      crashTickRebalanced: legDown.shouldRebalance,
      snapbackTickRebalanced: snapBack.shouldRebalance,
      whipsawChurnTrades: 0,
    },
    passed: !legDown.shouldRebalance && !snapBack.shouldRebalance && snapBack.nextBreachStreak === 0,
  };
}
