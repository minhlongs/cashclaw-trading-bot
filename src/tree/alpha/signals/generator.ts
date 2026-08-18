// Derivative signal generator — converts funding rate, OI, liquidation features
// into directional alpha signals with confidence scores.
//
// These are NOT technical indicators. They measure market structure:
//   - Funding rate extreme → crowded trade unwind
//   - OI surge → new money entering
//   - Liquidation cascade → forced selling/buying
//   - Basis expansion → futures premium/discount

import type { Candle } from '@/forest/backtest/ohlcv';
import type { DerivativeFeatures } from './funding';

export interface DerivativeSignal {
  timestamp: number;
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  confidence: number; // 0-1
  features: DerivativeFeatures;
  reasons: string[];
}

// ── Signal generators ────────────────────────────────────────────────────────

/**
 * Funding rate extreme signal.
 * Extreme positive funding = crowded longs → fade.
 * Extreme negative funding = crowded shorts → fade.
 */
function fundingSignal(f: DerivativeFeatures): { direction: 'long' | 'short' | 'neutral'; confidence: number; reasons: string[] } | null {
  if (f.fundingRate === null || f.fundingRateAvg8h === null) return null;
  const reasons: string[] = [];
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  let confidence = 0;

  // Positive funding > 0.05% (0.0005) = crowded longs
  if (f.fundingRate > 0.0005 && f.fundingRateSlope !== null && f.fundingRateSlope > 0) {
    direction = 'short';
    confidence = Math.min(1, Math.abs(f.fundingRate) / 0.002);
    reasons.push(`funding=${(f.fundingRate * 100).toFixed(3)}% extreme positive`);
  }
  // Negative funding < -0.05% = crowded shorts
  else if (f.fundingRate < -0.0005 && f.fundingRateSlope !== null && f.fundingRateSlope < 0) {
    direction = 'long';
    confidence = Math.min(1, Math.abs(f.fundingRate) / 0.002);
    reasons.push(`funding=${(f.fundingRate * 100).toFixed(3)}% extreme negative`);
  }

  return { direction, confidence, reasons };
}

/**
 * Open interest surge signal.
 * OI growing fast = new money entering trend.
 * OI dropping = positions unwinding.
 */
function oiSignal(f: DerivativeFeatures): { direction: 'long' | 'short' | 'neutral'; confidence: number; reasons: string[] } | null {
  if (f.oiChange === null || f.oiZScore === null) return null;
  const reasons: string[] = [];
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  let confidence = 0;

  if (f.oiChange > 0.1 && f.oiZScore > 1.5) {
    direction = 'long';
    confidence = Math.min(1, Math.abs(f.oiZScore) / 3);
    reasons.push(`OI surge: +${(f.oiChange * 100).toFixed(1)}%, z=${f.oiZScore.toFixed(2)}`);
  } else if (f.oiChange < -0.1 && f.oiZScore < -1.5) {
    direction = 'short';
    confidence = Math.min(1, Math.abs(f.oiZScore) / 3);
    reasons.push(`OI collapse: ${(f.oiChange * 100).toFixed(1)}%, z=${f.oiZScore.toFixed(2)}`);
  }

  return { direction, confidence, reasons };
}

/**
 * Liquidation cascade signal.
 * Net long liquidations > 0 = forced selling → short bias.
 * Net short liquidations > 0 = forced buying → long bias.
 */
function liquidationSignal(f: DerivativeFeatures): { direction: 'long' | 'short' | 'neutral'; confidence: number; reasons: string[] } | null {
  if (f.liquidationImbalance === null || f.liquidationZScore === null) return null;
  const reasons: string[] = [];
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  let confidence = 0;

  // Positive imbalance = more long liquidations = forced selling
  if (f.liquidationImbalance > 0 && Math.abs(f.liquidationZScore) > 2) {
    direction = 'short';
    confidence = Math.min(1, Math.abs(f.liquidationZScore) / 4);
    reasons.push(`long liquidation cascade: imbalance=${f.liquidationImbalance.toFixed(0)}, z=${f.liquidationZScore.toFixed(2)}`);
  }
  // Negative imbalance = more short liquidations = forced buying
  else if (f.liquidationImbalance < 0 && Math.abs(f.liquidationZScore) > 2) {
    direction = 'long';
    confidence = Math.min(1, Math.abs(f.liquidationZScore) / 4);
    reasons.push(`short liquidation cascade: imbalance=${f.liquidationImbalance.toFixed(0)}, z=${f.liquidationZScore.toFixed(2)}`);
  }

  return { direction, confidence, reasons };
}

/**
 * Basis expansion signal.
 * Positive basis = futures premium → bullish sentiment.
 * Negative basis = futures discount → bearish.
 */
function basisSignal(f: DerivativeFeatures): { direction: 'long' | 'short' | 'neutral'; confidence: number; reasons: string[] } | null {
  if (f.basis === null || f.basisZScore === null) return null;
  const reasons: string[] = [];
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  let confidence = 0;

  if (f.basis > 0.001 && f.basisZScore > 2) {
    direction = 'long';
    confidence = Math.min(1, Math.abs(f.basisZScore) / 3);
    reasons.push(`basis expansion: +${(f.basis * 100).toFixed(3)}%, z=${f.basisZScore.toFixed(2)}`);
  } else if (f.basis < -0.001 && f.basisZScore < -2) {
    direction = 'short';
    confidence = Math.min(1, Math.abs(f.basisZScore) / 3);
    reasons.push(`basis contraction: ${(f.basis * 100).toFixed(3)}%, z=${f.basisZScore.toFixed(2)}`);
  }

  return { direction, confidence, reasons };
}

// ── Aggregation ──────────────────────────────────────────────────────────────

/**
 * Combine all derivative signals into a single directional signal.
 * Signals must agree on direction to produce a non-neutral signal.
 */
export function generateDerivativeSignals(
  candles: Candle[],
  features: DerivativeFeatures[],
): DerivativeSignal[] {
  const signals: DerivativeSignal[] = [];

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
        symbol: '',
        direction,
        confidence,
        features: f,
        reasons: allReasons,
      });
    }
  }

  return signals;
}