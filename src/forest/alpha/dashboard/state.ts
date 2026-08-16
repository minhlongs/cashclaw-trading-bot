// Dashboard Data Layer — State Tracker
// Pure-logic state management for regime-aware dashboard data.

import { RegimeLabel } from '@/tree/regime/types';
import type { AlphaSignal } from '@/tree/alpha/types';
import type {
  DashboardState, DashboardPosition, PerformanceSummary,
  RegimeTimelineEntry, TimeSeriesPoint, AttributionSummary,
  RegimeInput, PerformanceInput,
} from './types';

/** Mutable variant of RegimeTimelineEntry used only inside the tracker. */
interface MutableTimelineEntry {
  regime: RegimeLabel;
  startTimestamp: number;
  endTimestamp: number | null;
  signalCount: number;
  avgConfidence: number;
}

interface InternalState {
  currentRegime: RegimeLabel;
  regimeConfidence: number;
  lastRegimeTimestamp: number;
  recentSignals: AlphaSignal[];
  openPositions: DashboardPosition[];
  performanceHistory: PerformanceInput[];
  regimeTimeline: MutableTimelineEntry[];
  attributionCache: AttributionSummary;
}

const MAX_RECENT_SIGNALS = 50;
const MAX_PERFORMANCE_HISTORY = 200;

const EMPTY_PERFORMANCE: PerformanceSummary = {
  totalPnl: 0, sharpeRatio: 0, maxDrawdown: 0,
  winRate: 0, tradeCount: 0, avgDuration: 0,
};

/** Pure-logic state manager for real-time dashboard data. No DOM, no fetch. */
export class DashboardStateTracker {
  private state: InternalState;

  constructor() {
    this.state = this.freshState();
  }

  /** Ingest new data and return an immutable DashboardState snapshot. */
  update(
    regime: RegimeInput,
    signals: readonly AlphaSignal[],
    positions: readonly DashboardPosition[],
    performance: PerformanceInput,
  ): DashboardState {
    this.ingestRegime(regime);
    this.ingestSignals(signals);
    this.state.openPositions = [...positions];
    this.ingestPerformance(performance);
    return this.buildSnapshot();
  }

  /** Recorded regime transition history. */
  getRegimeHistory(): readonly RegimeTimelineEntry[] {
    return [...this.state.regimeTimeline];
  }

  /** Rolling Sharpe time-series derived from performance history. */
  getPerformanceTimeSeries(): readonly TimeSeriesPoint[] {
    const { performanceHistory, lastRegimeTimestamp: ts } = this.state;
    return performanceHistory.map((p, i) => ({
      timestamp: ts - (performanceHistory.length - i),
      value: p.sharpeRatio,
      label: 'sharpe',
    }));
  }

  /** Attribution contribution map for the current state. */
  getAttributionSummary(): AttributionSummary {
    return { ...this.state.attributionCache };
  }

  /** Reset tracker to initial state. */
  reset(): void {
    this.state = this.freshState();
  }

  /** Update attribution data externally. */
  setAttribution(summary: AttributionSummary): void {
    this.state.attributionCache = { ...summary };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private ingestRegime(input: RegimeInput): void {
    const { currentRegime, regimeTimeline } = this.state;

    if (input.label === RegimeLabel.UNKNOWN) {
      Object.assign(this.state, {
        currentRegime: input.label,
        regimeConfidence: input.confidence,
        lastRegimeTimestamp: input.timestamp,
      });
      return;
    }

    const transitioning =
      currentRegime !== RegimeLabel.UNKNOWN && currentRegime !== input.label;

    if (transitioning) {
      const last = regimeTimeline[regimeTimeline.length - 1];
      if (last && last.endTimestamp === null) {
        last.endTimestamp = input.timestamp;
      }
      regimeTimeline.push({
        regime: input.label, startTimestamp: input.timestamp,
        endTimestamp: null, signalCount: 0, avgConfidence: 0,
      });
    } else if (regimeTimeline.length === 0) {
      regimeTimeline.push({
        regime: input.label, startTimestamp: input.timestamp,
        endTimestamp: null, signalCount: 0, avgConfidence: 0,
      });
    }

    const active = regimeTimeline[regimeTimeline.length - 1];
    if (active && active.endTimestamp === null) {
      const prev = active.avgConfidence * active.signalCount;
      active.signalCount += 1;
      active.avgConfidence = (prev + input.confidence) / active.signalCount;
    }

    this.state.currentRegime = input.label;
    this.state.regimeConfidence = input.confidence;
    this.state.lastRegimeTimestamp = input.timestamp;
  }

  private ingestSignals(signals: readonly AlphaSignal[]): void {
    this.state.recentSignals =
      [...this.state.recentSignals, ...signals].slice(-MAX_RECENT_SIGNALS);
  }

  private ingestPerformance(perf: PerformanceInput): void {
    this.state.performanceHistory.push(perf);
    if (this.state.performanceHistory.length > MAX_PERFORMANCE_HISTORY) {
      this.state.performanceHistory.shift();
    }
  }

  private buildSnapshot(): DashboardState {
    const { performanceHistory, regimeTimeline } = this.state;
    const latest = performanceHistory.length > 0
      ? performanceHistory[performanceHistory.length - 1]
      : EMPTY_PERFORMANCE;
    return {
      currentRegime: this.state.currentRegime,
      regimeConfidence: this.state.regimeConfidence,
      recentSignals: [...this.state.recentSignals],
      openPositions: [...this.state.openPositions],
      performanceSummary: { ...latest },
      regimeTimeline: regimeTimeline.map((e) => ({ ...e })),
      attributionSummary: this.getAttributionSummary(),
    };
  }

  private freshState(): InternalState {
    return {
      currentRegime: RegimeLabel.UNKNOWN, regimeConfidence: 0,
      lastRegimeTimestamp: 0, recentSignals: [], openPositions: [],
      performanceHistory: [], regimeTimeline: [], attributionCache: {},
    };
  }
}
