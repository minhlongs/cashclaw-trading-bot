// Pure helpers for DashboardStateTracker — immutable snapshot construction.

import type { DashboardState } from './types';
import {
  EMPTY_PERFORMANCE,
  cloneTimeline,
  type InternalState,
} from './state-internal';

export function buildSnapshot(state: InternalState): DashboardState {
  const { performanceHistory, regimeTimeline } = state;
  const latest = performanceHistory.length > 0
    ? performanceHistory[performanceHistory.length - 1]
    : EMPTY_PERFORMANCE;
  return {
    currentRegime: state.currentRegime,
    regimeConfidence: state.regimeConfidence,
    recentSignals: [...state.recentSignals],
    openPositions: [...state.openPositions],
    performanceSummary: { ...latest },
    regimeTimeline: regimeTimeline.map(cloneTimeline),
    attributionSummary: { ...state.attributionCache },
  };
}
