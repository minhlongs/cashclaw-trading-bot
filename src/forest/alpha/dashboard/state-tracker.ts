import type { AlphaSignal } from '@/tree/alpha/types';
import type { DashboardState, DashboardPosition, TimeSeriesPoint, AttributionSummary, RegimeInput, PerformanceInput, RegimeTimelineEntry } from './types';
import { type InternalState, freshState } from './state-internal';
import { buildSnapshot } from './state-tracker-helpers';
import { ingestRegimeToState, ingestSignalsToState, ingestPerformanceToState } from './state-tracker-ingest';

export class DashboardStateTracker {
  private state: InternalState = freshState();
  update(regime: RegimeInput, signals: readonly AlphaSignal[], positions: readonly DashboardPosition[], performance: PerformanceInput): DashboardState {
    ingestRegimeToState(this.state, regime);
    ingestSignalsToState(this.state, signals);
    this.state.openPositions = [...positions];
    ingestPerformanceToState(this.state, performance);
    return buildSnapshot(this.state);
  }
  getRegimeHistory(): readonly RegimeTimelineEntry[] { return [...this.state.regimeTimeline]; }
  getPerformanceTimeSeries(): readonly TimeSeriesPoint[] {
    const { performanceHistory, lastRegimeTimestamp: ts } = this.state;
    return performanceHistory.map((p, i) => ({ timestamp: ts - (performanceHistory.length - i), value: p.sharpeRatio, label: 'sharpe' }));
  }
  getAttributionSummary(): AttributionSummary { return { ...this.state.attributionCache }; }
  reset(): void { this.state = freshState(); }
  setAttribution(summary: AttributionSummary): void { this.state.attributionCache = { ...summary }; }
}
