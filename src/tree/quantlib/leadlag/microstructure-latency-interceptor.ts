/**
 * @file microstructure-latency-interceptor.ts
 * @description Intercepts incoming follower ticks and adjusts Avellaneda-Stoikov reservation prices ahead of follower book updates.
 */

import type {
  CrossCorrelationState,
  GrangerScore,
  LeadLagConfig,
  LeadLagInterceptResult,
} from './lead-lag-types';
import { computeGrangerScore } from './granger-lead-lag-matrix';

export function interceptFollowerReservationPrice(
  state: CrossCorrelationState,
  followerSymbol: string,
  config: LeadLagConfig
): LeadLagInterceptResult {
  const currentPrice = state.lastPrices[followerSymbol] || 0;
  if (currentPrice <= 0) {
    return {
      followerSymbol,
      leadingSymbol: null,
      optimalLag: 1,
      leadershipConfidence: 0,
      driftBps: 0,
      recommendedReservationPrice: currentPrice,
      actionRequired: false,
    };
  }

  let bestLeader: GrangerScore | null = null;
  let maxConfidence = 0;

  for (const candidate of state.symbols) {
    if (candidate === followerSymbol) continue;
    const score = computeGrangerScore(state, candidate, followerSymbol, config);
    if (score.isLeading && score.causalityScore > maxConfidence) {
      maxConfidence = score.causalityScore;
      bestLeader = score;
    }
  }

  if (!bestLeader || maxConfidence <= 0) {
    return {
      followerSymbol,
      leadingSymbol: null,
      optimalLag: 1,
      leadershipConfidence: 0,
      driftBps: 0,
      recommendedReservationPrice: currentPrice,
      actionRequired: false,
    };
  }

  // Calculate leader momentum from recent returns
  const leaderHistory = state.returnHistories[bestLeader.leadSymbol] || [];
  const recentLeaderReturn = leaderHistory.length > 0 ? leaderHistory[leaderHistory.length - 1] : 0;

  // Expected follower drift in basis points: return * causality * sensitivity
  const rawDriftBps = recentLeaderReturn * bestLeader.causalityScore * config.sensitivityBps * 1e4;
  const clampedDriftBps = Math.max(-50, Math.min(50, rawDriftBps));
  const driftDecimal = clampedDriftBps / 1e4;

  const recommendedReservationPrice = Math.round(currentPrice * (1 + driftDecimal) * 1e4) / 1e4;
  const actionRequired = Math.abs(clampedDriftBps) >= 0.5 && bestLeader.isLeading;

  return {
    followerSymbol,
    leadingSymbol: bestLeader.leadSymbol,
    optimalLag: bestLeader.optimalLag,
    leadershipConfidence: Math.round(maxConfidence * 1e4) / 1e4,
    driftBps: Math.round(clampedDriftBps * 1e2) / 1e2,
    recommendedReservationPrice,
    actionRequired,
  };
}
