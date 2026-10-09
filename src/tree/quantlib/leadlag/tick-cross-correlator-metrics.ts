import type { CrossCorrelationState, PairLagMetrics } from './lead-lag-types';

export function getPairLagMetrics(
  state: CrossCorrelationState,
  lead: string,
  follower: string,
  lag: number
): PairLagMetrics {
  const pairKey = `${lead}:${follower}`;
  const cov = state.lagCovariances[pairKey]?.[lag] || 0;
  const varLead = Math.max(1e-12, state.variances[lead] || 0);
  const varFollow = Math.max(1e-12, state.variances[follower] || 0);
  const rawCorr = cov / Math.sqrt(varLead * varFollow);
  const correlation = Math.max(-1, Math.min(1, Number.isFinite(rawCorr) ? rawCorr : 0));
  return { lag, correlation, covariance: cov };
}
