import { HayashiYoshidaEngine } from '@/tree/quantlib/leadlag/hayashi-yoshida-engine';
import type { AsynchronousTick } from '@/tree/quantlib/leadlag/hayashi-yoshida-types';
import { computeAlmgrenChrissTrajectory } from '@/tree/quantlib/execution/almgren-chriss-trajectory';

export type LeadLagPairId = 'BTC_PERP->ETH_SPOT' | 'ETH_PERP->SOL_SPOT' | 'SOL_PERP->AVAX_SPOT';
export type ExecutionUrgencyPreset = 'PASSIVE_TWAP' | 'BALANCED_AC' | 'URGENT_LIQUIDATION';

const LEADER_TICKS: readonly AsynchronousTick[] = [
  { timestampMs: 100, price: 64200 },
  { timestampMs: 220, price: 64245 },
  { timestampMs: 360, price: 64290 },
  { timestampMs: 490, price: 64260 },
  { timestampMs: 630, price: 64320 },
  { timestampMs: 780, price: 64385 },
  { timestampMs: 910, price: 64440 },
];

const FOLLOWER_TICKS_BY_PAIR: Record<LeadLagPairId, readonly AsynchronousTick[]> = {
  'BTC_PERP->ETH_SPOT': [
    { timestampMs: 280, price: 3120 },
    { timestampMs: 410, price: 3124 },
    { timestampMs: 550, price: 3129 },
    { timestampMs: 680, price: 3126 },
    { timestampMs: 820, price: 3133 },
    { timestampMs: 970, price: 3140 },
    { timestampMs: 1100, price: 3146 },
  ],
  'ETH_PERP->SOL_SPOT': [
    { timestampMs: 340, price: 147.2 },
    { timestampMs: 470, price: 147.6 },
    { timestampMs: 610, price: 148.1 },
    { timestampMs: 740, price: 147.9 },
    { timestampMs: 880, price: 148.5 },
    { timestampMs: 1030, price: 149.1 },
    { timestampMs: 1160, price: 149.6 },
  ],
  'SOL_PERP->AVAX_SPOT': [
    { timestampMs: 110, price: 28.4 },
    { timestampMs: 230, price: 28.35 },
    { timestampMs: 370, price: 28.42 },
    { timestampMs: 500, price: 28.5 },
    { timestampMs: 640, price: 28.44 },
    { timestampMs: 790, price: 28.41 },
    { timestampMs: 920, price: 28.39 },
  ],
};

export function computeLeadLagTelemetry(pairId: LeadLagPairId = 'BTC_PERP->ETH_SPOT') {
  const engine = new HayashiYoshidaEngine({ maxLagMs: 400, lagStepMs: 100, minObservations: 5 });
  const result = engine.computeAsynchronousCrossCorrelation(
    LEADER_TICKS,
    FOLLOWER_TICKS_BY_PAIR[pairId],
  );
  return {
    pairId,
    optimalLagMs: result.optimalLagMs,
    peakCorrelation: result.peakCorrelation,
    instantaneousCorrelation: result.instantaneousCorrelation,
    isLeader: result.isLeader,
    lagProfile: result.allLagMetrics,
  };
}

const URGENCY_LAMBDA: Record<ExecutionUrgencyPreset, number> = {
  PASSIVE_TWAP: 0,
  BALANCED_AC: 0.14,
  URGENT_LIQUIDATION: 1.6,
};

export function computeAlmgrenChrissTelemetry(preset: ExecutionUrgencyPreset = 'BALANCED_AC') {
  const ac = computeAlmgrenChrissTrajectory({
    totalShares: 120,
    horizonSteps: 6,
    stepSeconds: 1,
    volatility: 0.045,
    riskAversionLambda: URGENCY_LAMBDA[preset],
    tempImpactEta: 0.015,
    permImpactGamma: 0.004,
  });
  return {
    preset,
    ...ac,
  };
}
