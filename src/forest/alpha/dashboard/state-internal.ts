// Internal state types and constants for DashboardStateTracker.

import { RegimeLabel } from '@/tree/regime/types';
import type { AlphaSignal } from '@/tree/alpha/types';
import type {
  DashboardPosition,
  AttributionSummary,
  PerformanceInput,
  PerformanceSummary,
  RegimeTimelineEntry,
} from './types';

/** Mutable variant of RegimeTimelineEntry used only inside the tracker. */
export interface MutableTimelineEntry {
  regime: RegimeLabel;
  startTimestamp: number;
  endTimestamp: number | null;
  signalCount: number;
  avgConfidence: number;
}

export interface InternalState {
  currentRegime: RegimeLabel;
  regimeConfidence: number;
  lastRegimeTimestamp: number;
  recentSignals: AlphaSignal[];
  openPositions: DashboardPosition[];
  performanceHistory: PerformanceInput[];
  regimeTimeline: MutableTimelineEntry[];
  attributionCache: AttributionSummary;
}

export const MAX_RECENT_SIGNALS = 50;
export const MAX_PERFORMANCE_HISTORY = 200;

export const EMPTY_PERFORMANCE: PerformanceSummary = {
  totalPnl: 0, sharpeRatio: 0, maxDrawdown: 0,
  winRate: 0, tradeCount: 0, avgDuration: 0,
};

export function freshState(): InternalState {
  return {
    currentRegime: RegimeLabel.UNKNOWN, regimeConfidence: 0,
    lastRegimeTimestamp: 0, recentSignals: [], openPositions: [],
    performanceHistory: [], regimeTimeline: [], attributionCache: {},
  };
}

/** Clone a timeline entry into a new object (snapshot helper). */
export function cloneTimeline(entry: MutableTimelineEntry): RegimeTimelineEntry {
  return { ...entry };
}
