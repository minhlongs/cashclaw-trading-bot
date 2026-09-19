// Derivative signal generators — converts individual market structure features
// (funding rate, OI, liquidation, basis) into directional signals with confidence.

import type { DerivativeFeatures } from './funding';

/**
 * Funding rate extreme signal.
 * Extreme positive funding = crowded longs → fade.
 * Extreme negative funding = crowded shorts → fade.
 */
export function fundingSignal(f: DerivativeFeatures): { direction: 'long' | 'short' | 'neutral'; confidence: number; reasons: string[] } | null {
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
export function oiSignal(f: DerivativeFeatures): { direction: 'long' | 'short' | 'neutral'; confidence: number; reasons: string[] } | null {
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
export function liquidationSignal(f: DerivativeFeatures): { direction: 'long' | 'short' | 'neutral'; confidence: number; reasons: string[] } | null {
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
export function basisSignal(f: DerivativeFeatures): { direction: 'long' | 'short' | 'neutral'; confidence: number; reasons: string[] } | null {
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
