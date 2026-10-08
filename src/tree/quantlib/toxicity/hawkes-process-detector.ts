/**
 * @file hawkes-process-detector.ts
 * @description Univariate Self-Exciting Point Process (Hawkes) intensity estimator for whale bursts.
 */

import type { HawkesPointEvent, HawkesProcessModel, HawkesIntensityEstimate, WhaleSweepSignal } from './toxicity-types';

export function estimateHawkesIntensity(
  events: readonly HawkesPointEvent[],
  model: HawkesProcessModel,
  currentTimeMs: number,
  burstThresholdLambda = 5.0,
): HawkesIntensityEstimate {
  let excitation = 0;
  
  for (const ev of events) {
    if (ev.timestampMs > currentTimeMs) continue;
    const deltaT = (currentTimeMs - ev.timestampMs) / 1000.0; // In seconds
    if (deltaT > 60) continue; // Truncate kernel for computational efficiency edge (no effect beyond ~60s if beta is e.g. 1.0)
    
    excitation += ev.magnitude * model.jumpExcitationAlpha * Math.exp(-model.decayRateBeta * deltaT);
  }

  const currentLambda = model.baselineIntensityMu + excitation;
  const selfExcitedProb = excitation > 0 ? excitation / currentLambda : 0.0;

  return {
    timestampMs: currentTimeMs,
    currentIntensity: Math.round(currentLambda * 1e4) / 1e4,
    backgroundProbability: Math.round((model.baselineIntensityMu / currentLambda) * 1e4) / 1e4,
    selfExcitedProbability: Math.round(selfExcitedProb * 1e4) / 1e4,
    isBursting: currentLambda > burstThresholdLambda,
  };
}

export function detectWhaleSweep(
  events: readonly HawkesPointEvent[],
  intensityEst: HawkesIntensityEstimate,
  lookbackMs = 3000,
): WhaleSweepSignal {
  if (!intensityEst.isBursting) {
    return { detected: false, dominantSide: 'mixed', severityScore: 0, estimatedSweepSizeVol: 0 };
  }

  let buyVol = 0;
  let sellVol = 0;
  const recentEvents = events.filter(e => intensityEst.timestampMs - e.timestampMs <= lookbackMs);

  for (const ev of recentEvents) {
    if (ev.side === 'buy') buyVol += ev.magnitude;
    else sellVol += ev.magnitude;
  }

  const totalVol = buyVol + sellVol;
  const score = Math.max(0, Math.min(1.0, 1.0 - Math.exp(-intensityEst.currentIntensity / 10.0)));
  
  let dominant: 'buy' | 'sell' | 'mixed' = 'mixed';
  if (buyVol > sellVol * 3) dominant = 'buy';
  if (sellVol > buyVol * 3) dominant = 'sell';

  return {
    detected: true,
    dominantSide: dominant,
    severityScore: Math.round(score * 1e4) / 1e4,
    estimatedSweepSizeVol: totalVol,
  };
}
