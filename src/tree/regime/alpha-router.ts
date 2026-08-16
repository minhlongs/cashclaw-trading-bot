// Regime-Conditioned Alpha Router — pure function, no I/O
// Filters and ranks alpha signals based on detected market regime.

import { RegimeLabel } from './types';
import type { AlphaSignal, AlphaDirection } from '../alpha/types';

// ── Configuration ──────────────────────────────────────────────────────────

/** Directional preference per regime label. */
const REGIME_DIRECTION_PREFS: Partial<Record<RegimeLabel, AlphaDirection[]>> = {
  [RegimeLabel.TREND_UP]: ['buy'],
  [RegimeLabel.TREND_DOWN]: ['sell'],
  [RegimeLabel.RANGE]: ['buy', 'sell'],        // mean-reversion both sides
  [RegimeLabel.HIGH_VOLATILITY]: ['buy', 'sell'],
  [RegimeLabel.LOW_VOLATILITY]: ['buy', 'sell'], // breakout both sides
};

/** Minimum confidence threshold per regime for signal inclusion. */
const REGIME_CONFIDENCE_THRESHOLDS: Partial<Record<RegimeLabel, number>> = {
  [RegimeLabel.TREND_UP]: 0.3,
  [RegimeLabel.TREND_DOWN]: 0.3,
  [RegimeLabel.RANGE]: 0.5,           // mean-reversion needs higher conviction
  [RegimeLabel.HIGH_VOLATILITY]: 0.7, // only high-confidence signals survive
  [RegimeLabel.LOW_VOLATILITY]: 0.4,  // breakout signals moderate threshold
  [RegimeLabel.SHOCK]: 1.0,           // blocks everything (empty result)
  [RegimeLabel.UNKNOWN]: 0,           // no filter
};

export interface AlphaRouterConfig {
  /** Maximum signals to return after ranking. Default: 10. */
  topN: number;
  /** Override per-regime confidence thresholds. */
  confidenceOverrides?: Partial<Record<RegimeLabel, number>>;
  /** Override per-regime directional preferences. */
  directionOverrides?: Partial<Record<RegimeLabel, AlphaDirection[]>>;
}

const DEFAULT_CONFIG: AlphaRouterConfig = { topN: 10 };

// ── Core Router ────────────────────────────────────────────────────────────

/**
 * Route alpha signals based on current market regime.
 * Pure function — no I/O, no side effects.
 *
 * Regime rules:
 *  - TREND_UP   → prefer 'buy' signals
 *  - TREND_DOWN  → prefer 'sell' signals
 *  - RANGE       → prefer mean-reversion (buy/sell with high confidence)
 *  - HIGH_VOL    → high-confidence only (low-confidence filtered)
 *  - LOW_VOL     → prefer breakout signals (both directions)
 *  - SHOCK       → return empty array (no trading)
 *  - UNKNOWN     → return all signals unchanged
 */
export function routeAlphas(
  regime: RegimeLabel,
  signals: AlphaSignal[],
  config: AlphaRouterConfig = DEFAULT_CONFIG,
): AlphaSignal[] {
  if (signals.length === 0) return [];

  // SHOCK — no trading at all
  if (regime === RegimeLabel.SHOCK) return [];

  // UNKNOWN — pass through all signals
  if (regime === RegimeLabel.UNKNOWN) {
    return sortAndSlice(signals, config.topN);
  }

  const directions = config.directionOverrides?.[regime]
    ?? REGIME_DIRECTION_PREFS[regime]
    ?? [];

  const confidenceThreshold = config.confidenceOverrides?.[regime]
    ?? REGIME_CONFIDENCE_THRESHOLDS[regime]
    ?? 0;

  const filtered = signals.filter((s) => {
    // Direction filter — if regime specifies preferred directions, enforce it
    if (directions.length > 0 && !directions.includes(s.direction)) {
      return false;
    }
    // Confidence filter
    if (s.confidence < confidenceThreshold) {
      return false;
    }
    return true;
  });

  return sortAndSlice(filtered, config.topN);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sortAndSlice(signals: AlphaSignal[], topN: number): AlphaSignal[] {
  return [...signals]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topN);
}
