// Derivative signal aggregation — combines individual market structure signals
// into a single directional alpha signal with confidence-weighted voting.

import type { Candle } from '@/forest/backtest/ohlcv';
import type { DerivativeFeatures } from './funding';
import type { DerivativeSignal } from './generator-types';
import { fundingSignal, oiSignal, liquidationSignal, basisSignal } from './signal-generators';

/**
 * Combine all derivative signals into a single directional signal.
 * A non-neutral signal requires a 1.5x confidence-weighted vote margin
 * between long and short camps (plain direction agreement is not enough).
 */
export function generateDerivativeSignals(
  candles: Candle[],
  features: DerivativeFeatures[],
  symbol = '',
): DerivativeSignal[] {
  const signals: DerivativeSignal[] = [];
  // A missing symbol would otherwise default to '' and silently misattribute
  // attribution/grouping downstream — require the caller to pass it.
  if (!symbol) throw new Error('generateDerivativeSignals requires a symbol');

  for (let i = 0; i < candles.length; i++) {
    const f = features[i];
    if (!f) continue;

    const generators = [fundingSignal, oiSignal, liquidationSignal, basisSignal];
    const votes: { direction: 'long' | 'short' | 'neutral'; confidence: number; reasons: string[] }[] = [];
    for (const gen of generators) {
      const s = gen(f);
      if (s && s.confidence > 0) votes.push(s);
    }

    if (votes.length === 0) continue;

    // Count direction votes weighted by confidence
    let longScore = 0;
    let shortScore = 0;
    const allReasons: string[] = [];
    for (const v of votes) {
      if (v.direction === 'long') longScore += v.confidence;
      else if (v.direction === 'short') shortScore += v.confidence;
      allReasons.push(...v.reasons);
    }

    const totalScore = longScore + shortScore;
    if (totalScore === 0) continue;

    let direction: 'long' | 'short' | 'neutral' = 'neutral';
    let confidence = 0;
    if (longScore > shortScore * 1.5) {
      direction = 'long';
      confidence = longScore / (longScore + shortScore);
    } else if (shortScore > longScore * 1.5) {
      direction = 'short';
      confidence = shortScore / (longScore + shortScore);
    }

    if (direction !== 'neutral') {
      signals.push({
        timestamp: candles[i].timestamp,
        symbol,
        direction,
        confidence,
        features: f,
        reasons: allReasons,
      });
    }
  }

  return signals;
}
