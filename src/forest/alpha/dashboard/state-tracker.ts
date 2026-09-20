// Pure-logic state manager for real-time dashboard data. No DOM, no fetch.

import { RegimeLabel } from '@/tree/regime/types';
import type { AlphaSignal } from '@/tree/alpha/types';
import type {
  DashboardState, DashboardPosition, TimeSeriesPoint,
  AttributionSummary, RegimeInput, PerformanceInput, RegimeTimelineEntry,
} from './types';
import {
  type InternalState, freshState,
  MAX_RECENT_SIGNALS, MAX_PERFORMANCE_HISTORY,
} from './state-internal';
import { buildSnapshot } from './state-tracker-helpers';

/** Pure-logic state manager for real-time dashboard data. No DOM, no fetch. */
export class DashboardStateTracker {
  private state: InternalState;

  constructor() {
    this.state = freshState();
  }

  /** Ingest new data and return an immutable DashboardState snapshot. */
  update(
    regime: RegimeInput, signals: readonly AlphaSignal[],
    positions: readonly DashboardPosition[], performance: PerformanceInput,
  ): DashboardState {
    this.ingestRegime(regime);
    this.ingestSignals(signals);
    this.state.openPositions = [...positions];
    this.ingestPerformance(performance);
    return buildSnapshot(this.state);
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
  reset(): void { this.state = freshState(); }

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
      if (last && last.endTimestamp === null) last.endTimestamp = input.timestamp;
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
    const hist = this.state.performanceHistory;
    hist.push(perf);
    if (hist.length > MAX_PERFORMANCE_HISTORY) hist.shift();
  }
}
