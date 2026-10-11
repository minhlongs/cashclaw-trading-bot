import { RegimeLabel, type RegimeConfig } from './types';
import type { Thresholds } from './classifier-rules';
import type { ClassifierState } from './classifier-state';

export function attemptTransition(state: ClassifierState, rawLabel: RegimeLabel, rawConfidence: number, config: RegimeConfig, t: Thresholds): number {
  const meetsDuration = state.duration >= config.minDuration;
  const meetsConfidence = rawConfidence >= config.confidenceThreshold;
  if (meetsDuration && meetsConfidence) {
    state.previousLabel = state.currentLabel;
    state.currentLabel = rawLabel;
    state.duration = 1;
    return rawConfidence;
  }
  const nearThreshold = rawConfidence >= config.confidenceThreshold - t.transitionBuffer;
  if (nearThreshold && meetsDuration) {
    state.duration++;
    return rawConfidence * 0.5;
  }
  state.duration++;
  return rawConfidence;
}
