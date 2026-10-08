/**
 * @file granger-lead-lag-matrix.ts
 * @description Computes pairwise asymmetric variance reduction and directional Granger causality scores.
 */

import type {
  CrossCorrelationState,
  GrangerScore,
  LeadLagConfig,
} from './lead-lag-types';
import { getPairLagMetrics } from './tick-cross-correlator';

export function computeGrangerScore(
  state: CrossCorrelationState,
  lead: string,
  follower: string,
  config: LeadLagConfig
): GrangerScore {
  const minObs = config.minObservations;
  const countLead = state.observationCounts[lead] || 0;
  const countFollow = state.observationCounts[follower] || 0;

  if (countLead < minObs || countFollow < minObs) {
    return {
      leadSymbol: lead,
      followerSymbol: follower,
      optimalLag: 1,
      peakCorrelation: 0,
      causalityScore: 0,
      isLeading: false,
    };
  }

  let peakCorr = 0;
  let bestLag = 1;

  for (let lag = 1; lag <= config.maxLag; lag++) {
    const metricsForward = getPairLagMetrics(state, lead, follower, lag);
    const absForward = Math.abs(metricsForward.correlation);

    if (absForward > Math.abs(peakCorr)) {
      peakCorr = metricsForward.correlation;
      bestLag = lag;
    }
  }

  // Granger proxy: asymmetry ratio of forward vs reverse lagged correlation
  const forwardMetric = getPairLagMetrics(state, lead, follower, bestLag);
  const reverseMetric = getPairLagMetrics(state, follower, lead, bestLag);
  const fwdSq = forwardMetric.correlation * forwardMetric.correlation;
  const revSq = reverseMetric.correlation * reverseMetric.correlation;

  const rawScore = fwdSq > 0 ? (fwdSq - revSq) / (fwdSq + revSq + 1e-6) : 0;
  const causalityScore = Math.max(0, Math.min(1, Math.abs(peakCorr) * Math.max(0, rawScore)));
  const isLeading = causalityScore > 0.3 && Math.abs(peakCorr) > 0.2;

  return {
    leadSymbol: lead,
    followerSymbol: follower,
    optimalLag: bestLag,
    peakCorrelation: Math.round(peakCorr * 1e4) / 1e4,
    causalityScore: Math.round(causalityScore * 1e4) / 1e4,
    isLeading,
  };
}

export function computeGrangerLeadLagMatrix(
  state: CrossCorrelationState,
  config: LeadLagConfig
): GrangerScore[] {
  const scores: GrangerScore[] = [];
  for (const s1 of state.symbols) {
    for (const s2 of state.symbols) {
      if (s1 === s2) continue;
      scores.push(computeGrangerScore(state, s1, s2, config));
    }
  }
  return scores;
}
