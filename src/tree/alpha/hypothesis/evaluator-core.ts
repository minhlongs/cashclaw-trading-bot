// Hypothesis evaluation core logic.

import type { IndicatorCandle, IndicatorResult } from '../indicator-types';
import type { AlphaSignal } from '../types';
import type { AlphaHypothesis, HypothesisEvaluation, RegimePerf } from './types';
import { indicators } from '../indicators';
import { combineSignals } from '../combiner';
import { labelEvent } from '../labeling';
import { inferDirection } from './evaluator-direction';
import {
  buildAlphaSignal,
  numericValue,
  classifyRegimeAt,
  empty,
} from './evaluator-core-helpers';

// Re-export helpers for backward compatibility
export { buildAlphaSignal, numericValue, classifyRegimeAt, empty };


/**
 * Evaluate a hypothesis against candle data.
 * Runs each indicator on the full array, combines into one signal, labels it.
 */
export function evaluateHypothesis(
  hypothesis: AlphaHypothesis,
  candles: readonly IndicatorCandle[],
  regimeLookback: number = 50,
): HypothesisEvaluation {
  if (candles.length < 20) {
    return empty(hypothesis.id);
  }

  const regime = classifyRegimeAt(candles, regimeLookback);

  // Run each indicator on the full candle array to get a current value
  const signals: AlphaSignal[] = [];
  for (const preset of hypothesis.indicatorSet) {
    const fn = indicators[preset.indicator];
    if (!fn) continue;

    const result: IndicatorResult = fn(candles, preset.lookback, preset.timeframe);
    const value = numericValue(result.value);
    const direction = inferDirection(preset.indicator, value);
    const confidence = value !== null ? Math.min(1, Math.abs(value) / 2) : 0.1;

    signals.push(buildAlphaSignal(preset.indicator, direction, confidence, result.timestamp));
  }

  if (signals.length === 0) {
    return empty(hypothesis.id);
  }

  // Combine signals
  const cfg = {
    method: hypothesis.combineMethod,
    weights: Object.fromEntries(signals.map((s) => [s.name, s.confidence])),
    minConfidence: 0.1,
    symbols: [],
  };

  const combined = combineSignals(signals, cfg);
  if (!combined || combined.direction === 'hold') {
    return empty(hypothesis.id);
  }

  // Label with triple barrier
  const barrierWindow = candles.slice(Math.max(0, candles.length - Math.ceil(hypothesis.barrierConfig.maxHoldingMs / 60_000)));
  const label = labelEvent(barrierWindow, 0, hypothesis.barrierConfig);

  const passRate = label !== null ? 1 : 0;
  const winRate = label !== null && label.label === 1 ? 1 : 0;

  // Per-regime metrics (single data point evaluation)
  const perf: RegimePerf = {
    signalCount: 1,
    winRate,
    avgConfidence: combined.confidence,
  };

  return {
    hypothesisId: hypothesis.id,
    totalSignals: 1,
    avgConfidence: combined.confidence,
    passRate,
    winRate,
    regimePerformance: { [regime as string]: perf } as Record<string, RegimePerf>,
  };
}
