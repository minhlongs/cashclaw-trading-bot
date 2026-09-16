// Regime classifier rules — pure thresholds, helpers, confidence. No state, no I/O.

import { RegimeLabel, type RegimeFeatures } from './types';

/** Tuneable feature thresholds — hidden from public config to keep API surface small */
export interface Thresholds {
  realizedVolHigh: number;
  realizedVolLow: number;
  atrHigh: number;
  atrLow: number;
  trendStrengthHigh: number;
  volumeAbnormalExtreme: number;
  returnDispersionHigh: number;
  transitionBuffer: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  realizedVolHigh: 0.02,
  realizedVolLow: 0.005,
  atrHigh: 0.015,
  atrLow: 0.003,
  trendStrengthHigh: 40,
  volumeAbnormalExtreme: 3.0,
  returnDispersionHigh: 0.015,
  transitionBuffer: 0.1,
};

export const EMPTY_FEATURES: RegimeFeatures = {
  realizedVol: 0,
  atr: 0,
  trendStrength: 0,
  maSlope: 0,
  returnDispersion: 0,
  volumeAbnormality: 0,
};

export function isValidFeatures(f: RegimeFeatures): boolean {
  const vals = [f.realizedVol, f.atr, f.trendStrength, f.maSlope, f.returnDispersion, f.volumeAbnormality];
  return vals.every((v) => Number.isFinite(v));
}

/** Priority-ordered rule evaluation: SHOCK > HIGH_VOL > TREND > LOW_VOL > RANGE */
export function determineLabel(f: RegimeFeatures, t: Thresholds): RegimeLabel {
  if (
    Math.abs(f.volumeAbnormality) > t.volumeAbnormalExtreme &&
    f.returnDispersion > t.returnDispersionHigh
  ) {
    return RegimeLabel.SHOCK;
  }
  if (f.realizedVol > t.realizedVolHigh && f.atr > t.atrHigh) {
    return RegimeLabel.HIGH_VOLATILITY;
  }
  if (f.trendStrength > t.trendStrengthHigh) {
    return RegimeLabel.TREND_UP;
  }
  if (f.trendStrength < -t.trendStrengthHigh) {
    return RegimeLabel.TREND_DOWN;
  }
  if (f.realizedVol < t.realizedVolLow && f.atr < t.atrLow) {
    return RegimeLabel.LOW_VOLATILITY;
  }
  return RegimeLabel.RANGE;
}

/** Confidence 0–1: how strongly features indicate the given label */
export function computeConfidence(f: RegimeFeatures, label: RegimeLabel, t: Thresholds): number {
  switch (label) {
    case RegimeLabel.SHOCK: {
      const v = Math.min(Math.abs(f.volumeAbnormality) / t.volumeAbnormalExtreme, 1);
      const d = Math.min(f.returnDispersion / t.returnDispersionHigh, 1);
      return (v + d) / 2;
    }
    case RegimeLabel.HIGH_VOLATILITY: {
      const vol = Math.min(f.realizedVol / t.realizedVolHigh, 1);
      const atr = Math.min(f.atr / t.atrHigh, 1);
      return (vol + atr) / 2;
    }
    case RegimeLabel.TREND_UP:
      return Math.min(f.trendStrength / 100, 1);
    case RegimeLabel.TREND_DOWN:
      return Math.min(Math.abs(f.trendStrength) / 100, 1);
    case RegimeLabel.LOW_VOLATILITY: {
      const safeVol = Math.max(f.realizedVol, 1e-6);
      const safeAtr = Math.max(f.atr, 1e-6);
      const vol = Math.min(t.realizedVolLow / safeVol, 1);
      const atr = Math.min(t.atrLow / safeAtr, 1);
      return (vol + atr) / 2;
    }
    case RegimeLabel.RANGE: {
      const volScore = 1 - Math.min(f.realizedVol / t.realizedVolHigh, 1);
      const trendScore = 1 - Math.min(Math.abs(f.trendStrength) / t.trendStrengthHigh, 1);
      return (volScore + trendScore) / 2;
    }
    default:
      return 0;
  }
}
