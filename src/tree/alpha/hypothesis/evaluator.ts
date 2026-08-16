// Hypothesis Engine — Evaluator
// Evaluates a hypothesis against historical candle data.
// Pipeline: run indicators on full candle array → combine → label → metrics.

import type { IndicatorCandle, IndicatorResult } from '../indicator-types';
import type { AlphaSignal, AlphaDirection } from '../types';
import { RegimeLabel } from '../../regime/types';
import type { AlphaHypothesis, HypothesisEvaluation, RegimePerf } from './types';
import { indicators } from '../indicators';
import { combineSignals } from '../combiner';
import { labelEvent } from '../labeling';
import type { LabeledEvent } from '../labeling';

// ── Internal Types ─────────────────────────────────────────────────────────────

interface SignalEvaluation {
  direction: AlphaDirection;
  confidence: number;
  label: LabeledEvent | null;
  regime: RegimeLabel;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildAlphaSignal(
  name: string,
  direction: AlphaDirection,
  confidence: number,
  timestamp: number,
): AlphaSignal {
  return {
    name,
    source: 'indicator',
    direction,
    confidence,
    timestamp,
    features: { features: [], computedAt: timestamp, symbol: '', lookback: 0 },
    metadata: {},
  };
}

/** Extract a single numeric value from an IndicatorValue (handles composite types). */
function numericValue(val: IndicatorResult['value']): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'object') {
    if ('rsi' in val && typeof val.rsi === 'number') return val.rsi;
    if ('macd' in val && typeof val.macd === 'number') return val.macd;
    if ('histogram' in val && typeof val.histogram === 'number') return val.histogram;
    if ('percentB' in val && typeof val.percentB === 'number') return val.percentB;
    if ('middle' in val && typeof val.middle === 'number') return val.middle;
  }
  return null;
}

function inferDirection(indicator: string, value: number | null): AlphaDirection {
  if (value === null) return 'hold';
  switch (indicator) {
    case 'rsi':
      return value < 30 ? 'buy' : value > 70 ? 'sell' : 'hold';
    case 'macd':
      return value > 0 ? 'buy' : value < 0 ? 'sell' : 'hold';
    case 'bollinger':
      return value < -1 ? 'buy' : value > 1 ? 'sell' : 'hold';
    case 'momentum':
    case 'returns':
    case 'log_returns':
      return value > 0 ? 'buy' : value < 0 ? 'sell' : 'hold';
    case 'atr':
    case 'realized_volatility':
    case 'volume_zscore':
      return value > 1 ? 'sell' : value < -1 ? 'buy' : 'hold';
    default:
      return value > 0 ? 'buy' : value < 0 ? 'sell' : 'hold';
  }
}

function classifyRegimeAt(
  candles: readonly IndicatorCandle[],
  lookback: number,
): RegimeLabel {
  const start = Math.max(0, candles.length - lookback);
  const window = candles.slice(start);
  if (window.length < 2) return RegimeLabel.UNKNOWN;

  const closes = window.map((c) => c.close);
  const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]!));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const vol = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length);

  if (vol > 0.03) return RegimeLabel.HIGH_VOLATILITY;
  if (vol < 0.005) return RegimeLabel.LOW_VOLATILITY;
  const trend = (closes[closes.length - 1]! - closes[0]!) / closes[0]!;
  if (trend > 0.02) return RegimeLabel.TREND_UP;
  if (trend < -0.02) return RegimeLabel.TREND_DOWN;
  return RegimeLabel.RANGE;
}

// ── Public API ─────────────────────────────────────────────────────────────────

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
  const entryTs = candles[candles.length - 1]!.timestamp;
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

function empty(hypothesisId: string): HypothesisEvaluation {
  return {
    hypothesisId,
    totalSignals: 0,
    avgConfidence: 0,
    passRate: 0,
    winRate: 0,
    regimePerformance: {} as Record<string, RegimePerf>,
  };
}