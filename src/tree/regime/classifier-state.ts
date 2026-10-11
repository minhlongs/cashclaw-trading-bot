import { RegimeLabel, type RegimeFeatures, type RegimeResult } from './types';

export interface ClassifierState {
  currentLabel: RegimeLabel;
  previousLabel: RegimeLabel | null;
  duration: number;
}

export function handleColdStart(state: ClassifierState, f: RegimeFeatures, rawLabel: RegimeLabel, rawConfidence: number, now: number): RegimeResult {
  state.previousLabel = null;
  state.currentLabel = rawLabel;
  state.duration = 1;
  return buildResult(state, f, now, rawConfidence);
}

export function buildResult(state: ClassifierState, f: RegimeFeatures, timestamp: number, confidence: number): RegimeResult {
  return { label: state.currentLabel, confidence, features: f, timestamp, previousLabel: state.previousLabel, duration: state.duration };
}
