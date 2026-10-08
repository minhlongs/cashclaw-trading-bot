import type { VolatilityRegime } from './bandit-types';

export interface MarketRegimeMetrics {
  readonly annualizedVolPct: number;
  readonly vpinToxicity?: number;
  readonly parkinsonVolPct?: number;
}

export function detectMarketRegime(
  metrics: MarketRegimeMetrics,
  lowVolThresholdPct = 35.0,
  highVolThresholdPct = 75.0,
): { regime: VolatilityRegime; confidence: number } {
  const vol = Math.max(0, metrics.annualizedVolPct);
  const vpin = metrics.vpinToxicity ?? 0.2;

  // Crisis conditions: extreme volatility or critical informed flow toxicity
  if (vol >= highVolThresholdPct || vpin >= 0.65) {
    const confidence = Math.min(1.0, 0.7 + (vol - highVolThresholdPct) / 100);
    return {
      regime: 'HIGH_VOL_CRISIS',
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  // Low volatility chop conditions
  if (vol <= lowVolThresholdPct && vpin <= 0.35) {
    const confidence = Math.min(1.0, 0.7 + (lowVolThresholdPct - vol) / 50);
    return {
      regime: 'LOW_VOL_CHOP',
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  // Moderate trending volatility
  return {
    regime: 'TRENDING_MOMENTUM',
    confidence: 0.85,
  };
}
