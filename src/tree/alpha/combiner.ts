// Alpha Lab — Signal Combiner
// Pure functions that merge multiple AlphaSignals into a single composite signal.

import type { AlphaSignal, AlphaCombinerConfig } from './types';
import {
  combineWeightedSum,
  combineVoting,
  combineMaxConfidence,
} from './combiner-strategies';

// Re-export strategies for backward compatibility
export {
  combineWeightedSum,
  combineVoting,
  combineMaxConfidence,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Combine multiple alpha signals into a single composite signal.
 * Returns null when signals conflict (no trade) or when input is empty.
 * Pure function — no side effects.
 */
export function combineSignals(
  signals: AlphaSignal[],
  cfg: AlphaCombinerConfig,
): AlphaSignal | null {
  if (signals.length === 0) return null;

  switch (cfg.method) {
    case 'weighted_sum':
      return combineWeightedSum(signals, cfg);
    case 'voting':
      return combineVoting(signals, cfg);
    case 'max_confidence':
      return combineMaxConfidence(signals, cfg);
    default:
      return null;
  }
}
