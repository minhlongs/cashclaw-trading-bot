import { RegimeLabel } from '@/tree/regime/types';
import type { AlphaSignal } from '@/tree/alpha/types';
import type { RegimeInput, PerformanceInput } from './types';
import { type InternalState, MAX_RECENT_SIGNALS, MAX_PERFORMANCE_HISTORY } from './state-internal';

export function ingestRegimeToState(state: InternalState, input: RegimeInput): void {
  const { currentRegime, regimeTimeline } = state;
  if (input.label === RegimeLabel.UNKNOWN) {
    Object.assign(state, { currentRegime: input.label, regimeConfidence: input.confidence, lastRegimeTimestamp: input.timestamp });
    return;
  }
  const transitioning = currentRegime !== RegimeLabel.UNKNOWN && currentRegime !== input.label;
  if (transitioning) {
    const last = regimeTimeline[regimeTimeline.length - 1];
    if (last && last.endTimestamp === null) last.endTimestamp = input.timestamp;
    regimeTimeline.push({ regime: input.label, startTimestamp: input.timestamp, endTimestamp: null, signalCount: 0, avgConfidence: 0 });
  } else if (regimeTimeline.length === 0) {
    regimeTimeline.push({ regime: input.label, startTimestamp: input.timestamp, endTimestamp: null, signalCount: 0, avgConfidence: 0 });
  }
  const active = regimeTimeline[regimeTimeline.length - 1];
  if (active && active.endTimestamp === null) {
    const prev = active.avgConfidence * active.signalCount;
    active.signalCount += 1;
    active.avgConfidence = (prev + input.confidence) / active.signalCount;
  }
  state.currentRegime = input.label; state.regimeConfidence = input.confidence; state.lastRegimeTimestamp = input.timestamp;
}

export function ingestSignalsToState(state: InternalState, signals: readonly AlphaSignal[]): void {
  state.recentSignals = [...state.recentSignals, ...signals].slice(-MAX_RECENT_SIGNALS);
}

export function ingestPerformanceToState(state: InternalState, perf: PerformanceInput): void {
  state.performanceHistory.push(perf);
  if (state.performanceHistory.length > MAX_PERFORMANCE_HISTORY) state.performanceHistory.shift();
}
