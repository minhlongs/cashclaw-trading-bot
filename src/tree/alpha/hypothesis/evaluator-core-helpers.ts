// Hypothesis evaluation core helpers.
// Alpha signal construction, numeric extraction, regime classification, and empty evaluation.

import type { IndicatorCandle, IndicatorResult } from '../indicator-types';
import type { AlphaSignal, AlphaDirection } from '../types';
import { RegimeLabel } from '../../regime/types';
import type { HypothesisEvaluation, RegimePerf } from './types';

export function buildAlphaSignal(
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
export function numericValue(val: IndicatorResult['value']): number | null {
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

export function classifyRegimeAt(
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

export function empty(hypothesisId: string): HypothesisEvaluation {
  return {
    hypothesisId,
    totalSignals: 0,
    avgConfidence: 0,
    passRate: 0,
    winRate: 0,
    regimePerformance: {} as Record<string, RegimePerf>,
  };
}
