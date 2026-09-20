// PaperExchangeProvider health tracking — score, latency, and failure state.
// Fail-closed: score is clamped to [0, 100], latency uses EMA smoothing.

import type { ProviderHealth } from './types';

/** Build a fresh ProviderHealth at full score. */
export function createInitialHealth(now: number = Date.now()): ProviderHealth {
  return { score: 100, lastSuccess: now, failureCount: 0, latencyMs: 0 };
}

/** Record a success — reset failure count, EMA-latency, raise score. */
export function applyRecordSuccess(
  health: ProviderHealth,
  latencyMs: number,
  now: number = Date.now(),
): ProviderHealth {
  return {
    failureCount: 0,
    lastSuccess: now,
    latencyMs: health.latencyMs === 0
      ? latencyMs
      : 0.3 * latencyMs + 0.7 * health.latencyMs,
    score: Math.min(100, health.score + 5),
  };
}

/** Record a failure — increment count, degrade score. */
export function applyRecordFailure(health: ProviderHealth): ProviderHealth {
  return {
    ...health,
    failureCount: health.failureCount + 1,
    score: Math.max(0, health.score - 15),
  };
}

/** Provider is unhealthy when its score drops below threshold (40). */
export function isScoreUnhealthy(score: number): boolean {
  return score < 40;
}
