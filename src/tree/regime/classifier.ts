// Deterministic rule-based regime classifier — orchestrator over pure rules in classifier-rules.ts
// All transitions gated by minDuration + confidenceThreshold

import {
  RegimeLabel,
  type RegimeClassifier,
  type RegimeFeatures,
  type RegimeConfig,
  type RegimeResult,
} from './types';
import {
  DEFAULT_THRESHOLDS,
  EMPTY_FEATURES,
  isValidFeatures,
  determineLabel,
  computeConfidence,
  type Thresholds,
} from './classifier-rules';

interface ClassifierState {
  currentLabel: RegimeLabel;
  previousLabel: RegimeLabel | null;
  duration: number;
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

    if (this.state.currentLabel === RegimeLabel.UNKNOWN) {
      return this.handleColdStart(f, rawLabel, rawConfidence, now);
    }

    if (rawLabel === this.state.currentLabel) {
      this.state.duration++;
      return this.buildResult(f, this.state.duration, now, rawConfidence);
    }

    const transition = this.attemptTransition(rawLabel, rawConfidence, config);
    return this.buildResult(f, this.state.duration, now, transition.confidence);
  }

  /** Cold start: first valid features set the initial regime */
  private handleColdStart(
    f: RegimeFeatures,
    rawLabel: RegimeLabel,
    rawConfidence: number,
    now: number,
  ): RegimeResult {
    this.state.previousLabel = null;
    this.state.currentLabel = rawLabel;
    this.state.duration = 1;
    return this.buildResult(f, 1, now, rawConfidence);
  }

  /** Evaluate transition gates; mutates state and returns effective confidence */
  private attemptTransition(
    rawLabel: RegimeLabel,
    rawConfidence: number,
    config: RegimeConfig,
  ): { confidence: number } {
    const meetsDuration = this.state.duration >= config.minDuration;
    const meetsConfidence = rawConfidence >= config.confidenceThreshold;

    if (meetsDuration && meetsConfidence) {
      this.state.previousLabel = this.state.currentLabel;
      this.state.currentLabel = rawLabel;
      this.state.duration = 1;
      return { confidence: rawConfidence };
    }

    const nearThreshold =
      rawConfidence >= config.confidenceThreshold - this.t.transitionBuffer;
    if (nearThreshold && meetsDuration) {
      this.state.duration++;
      return { confidence: rawConfidence * 0.5 };
    }

    this.state.duration++;
    return { confidence: rawConfidence };
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
