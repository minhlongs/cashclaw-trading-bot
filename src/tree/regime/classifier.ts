import { RegimeLabel, type RegimeClassifier, type RegimeFeatures, type RegimeConfig, type RegimeResult } from './types';
import { DEFAULT_THRESHOLDS, EMPTY_FEATURES, isValidFeatures, determineLabel, computeConfidence, type Thresholds } from './classifier-rules';
import { type ClassifierState, handleColdStart, buildResult } from './classifier-state';
import { attemptTransition } from './classifier-transition';

export class RuleBasedRegimeClassifier implements RegimeClassifier {
  private state: ClassifierState = { currentLabel: RegimeLabel.UNKNOWN, previousLabel: null, duration: 0 };
  private readonly t: Thresholds = DEFAULT_THRESHOLDS;
  classify(features: RegimeFeatures, config: RegimeConfig): RegimeResult {
    const now = Date.now(), f = features;
    if (!f || !isValidFeatures(f)) {
      return buildResult(this.state, EMPTY_FEATURES, now, 0);
    }
    const rawLabel = determineLabel(f, this.t), rawConfidence = computeConfidence(f, rawLabel, this.t);
    if (this.state.currentLabel === RegimeLabel.UNKNOWN) return handleColdStart(this.state, f, rawLabel, rawConfidence, now);
    if (rawLabel === this.state.currentLabel) {
      this.state.duration++;
      return buildResult(this.state, f, now, rawConfidence);
    }
    const effectiveConf = attemptTransition(this.state, rawLabel, rawConfidence, config, this.t);
    return buildResult(this.state, f, now, effectiveConf);
  }
}
