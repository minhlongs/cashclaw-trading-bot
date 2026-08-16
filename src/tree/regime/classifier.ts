// Deterministic rule-based regime classifier — no ML, no LLM, no randomness
// All transitions gated by minDuration + confidenceThreshold

import { RegimeLabel } from './types';
import type {
  RegimeClassifier,
  RegimeFeatures,
  RegimeConfig,
  RegimeResult,
} from './types';

/** Tuneable feature thresholds — hidden from public config to keep API surface small */
interface Thresholds {
  realizedVolHigh: number;
  realizedVolLow: number;
  atrHigh: number;
  atrLow: number;
  trendStrengthHigh: number;
  volumeAbnormalExtreme: number;
  returnDispersionHigh: number;
  transitionBuffer: number;
}

const DEFAULT_THRESHOLDS: Thresholds = {
  realizedVolHigh: 0.02,
  realizedVolLow: 0.005,
  atrHigh: 0.015,
  atrLow: 0.003,
  trendStrengthHigh: 40,
  volumeAbnormalExtreme: 3.0,
  returnDispersionHigh: 0.015,
  transitionBuffer: 0.1,
};

interface ClassifierState {
  currentLabel: RegimeLabel;
  previousLabel: RegimeLabel | null;
  duration: number;
}

const EMPTY_FEATURES: RegimeFeatures = {
  realizedVol: 0,
  atr: 0,
  trendStrength: 0,
  maSlope: 0,
  returnDispersion: 0,
  volumeAbnormality: 0,
};

function isValidFeatures(f: RegimeFeatures): boolean {
  const vals = [f.realizedVol, f.atr, f.trendStrength, f.maSlope, f.returnDispersion, f.volumeAbnormality];
  return vals.every((v) => Number.isFinite(v));
}

/** Priority-ordered rule evaluation: SHOCK > HIGH_VOL > TREND > LOW_VOL > RANGE */
function determineLabel(f: RegimeFeatures, t: Thresholds): RegimeLabel {
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
function computeConfidence(f: RegimeFeatures, label: RegimeLabel, t: Thresholds): number {
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

export class RuleBasedRegimeClassifier implements RegimeClassifier {
  private state: ClassifierState = {
    currentLabel: RegimeLabel.UNKNOWN,
    previousLabel: null,
    duration: 0,
  };

  private readonly t: Thresholds = DEFAULT_THRESHOLDS;

  classify(features: RegimeFeatures, config: RegimeConfig): RegimeResult {
    const now = Date.now();
    const f = features;

    // Edge case: null / invalid features → return previous regime or UNKNOWN
    if (!f || !isValidFeatures(f)) {
      return this.buildResult(
        EMPTY_FEATURES,
        this.state.currentLabel === RegimeLabel.UNKNOWN ? 0 : this.state.duration,
        now,
        0,
      );
    }

    const rawLabel = determineLabel(f, this.t);
    const rawConfidence = computeConfidence(f, rawLabel, this.t);

    // First classification or cold start
    if (this.state.currentLabel === RegimeLabel.UNKNOWN) {
      this.state.previousLabel = null;
      this.state.currentLabel = rawLabel;
      this.state.duration = 1;
      return this.buildResult(f, 1, now, rawConfidence);
    }

    // Same regime — extend duration
    if (rawLabel === this.state.currentLabel) {
      this.state.duration++;
      return this.buildResult(f, this.state.duration, now, rawConfidence);
    }

    // Different regime proposed — check transition gates
    const meetsDuration = this.state.duration >= config.minDuration;
    const meetsConfidence = rawConfidence >= config.confidenceThreshold;

    if (meetsDuration && meetsConfidence) {
      this.state.previousLabel = this.state.currentLabel;
      this.state.currentLabel = rawLabel;
      this.state.duration = 1;
      return this.buildResult(f, 1, now, rawConfidence);
    }

    // TRANSITIONING: near threshold but not past — dampen confidence, stay in current
    const nearThreshold =
      rawConfidence >= config.confidenceThreshold - this.t.transitionBuffer;
    if (nearThreshold && meetsDuration) {
      this.state.duration++;
      return this.buildResult(f, this.state.duration, now, rawConfidence * 0.5);
    }

    // Cannot transition — remain in current regime
    this.state.duration++;
    return this.buildResult(f, this.state.duration, now, rawConfidence);
  }

  private buildResult(
    f: RegimeFeatures,
    duration: number,
    timestamp: number,
    confidence: number,
  ): RegimeResult {
    return {
      label: this.state.currentLabel,
      confidence,
      features: f,
      timestamp,
      previousLabel: this.state.previousLabel,
      duration,
    };
  }
}
