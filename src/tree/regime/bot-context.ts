// Regime bot-context adapter — thin, causal, zero-side-effect bridge
// Between the regime engine and bot tick execution path.
// Returns regime label + confidence; never gates execution decisions.

import type { Candle } from '@/forest/backtest/ohlcv';
import { extractRegimeFeatures } from './features';
import { RuleBasedRegimeClassifier } from './classifier';
import { RegimeLabel, type RegimeResult } from './types';

export interface RegimeContextResult {
  label: RegimeLabel;
  confidence: number;
  result: RegimeResult;
}

/**
 * Compute current market regime from recent OHLCV candle data.
 *
 * This adapter is **causal**: `extractRegimeFeatures` only reads candles at or
 * before the current tick index, never after. The classifier is stateless
 * relative to the caller — each call produces a result from the supplied data
 * without side effects on the calling bot's execution path.
 *
 * @param symbol   Trading pair (for context; not used in classification).
 * @param candles  Recent OHLCV window at tick time. Empty or insufficient → UNKNOWN.
 * @returns        Regime label + confidence + full result, or null if input is invalid.
 *
 * Side effects: None. Classifier is instantiated fresh on every call.
 * Causality: Guaranteed by `extractRegimeFeatures` design — verified in leakage.test.ts.
 */
export function computeRegimeContext(
  symbol: string,
  candles: Candle[],
): RegimeContextResult | null {
  if (!Array.isArray(candles) || candles.length === 0) {
    return null;
  }

  const defaultConfig = {
    minCandles: 10,
    confidenceThreshold: 0.6,
    lookback: 10,
    minDuration: 3,
  };

  const features = extractRegimeFeatures(candles, defaultConfig);
  if (!features) {
    return { label: RegimeLabel.UNKNOWN, confidence: 0, result: buildUnknownResult() };
  }

  const classifier = new RuleBasedRegimeClassifier();
  const result = classifier.classify(features, defaultConfig);

  return { label: result.label, confidence: result.confidence, result };
}

function buildUnknownResult(): RegimeResult {
  return {
    label: RegimeLabel.UNKNOWN,
    confidence: 0,
    features: { realizedVol: 0, atr: 0, trendStrength: 0, maSlope: 0, returnDispersion: 0, volumeAbnormality: 0 },
    timestamp: Date.now(),
    previousLabel: null,
    duration: 0,
  };
}
