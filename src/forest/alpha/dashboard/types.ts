// Dashboard Data Layer — Core Types
// Regime-aware state types consumed by future dashboard components.

import type { RegimeLabel } from '@/tree/regime/types';
import type { AlphaSignal } from '@/tree/alpha/types';

// ── Open Position ───────────────────────────────────────────────────────────

/** Lightweight open-position snapshot for dashboard display. */
export interface DashboardPosition {
  readonly id: string;
  readonly symbol: string;
  readonly side: 'long' | 'short';
  readonly entryPrice: number;
  readonly currentPrice: number;
  readonly pnlPercent: number;
  readonly openTimestamp: number;
}

// ── Performance Summary ─────────────────────────────────────────────────────

/** Aggregated performance snapshot for the dashboard header. */
export interface PerformanceSummary {
  readonly totalPnl: number;
  readonly sharpeRatio: number;
  readonly maxDrawdown: number;
  readonly winRate: number;
  readonly tradeCount: number;
  readonly avgDuration: number;
}

// ── Regime Timeline ─────────────────────────────────────────────────────────

/** A single regime segment in the timeline history. */
export interface RegimeTimelineEntry {
  readonly regime: RegimeLabel;
  readonly startTimestamp: number;
  readonly endTimestamp: number | null;
  readonly signalCount: number;
  readonly avgConfidence: number;
}

// ── Time Series ─────────────────────────────────────────────────────────────

/** Single point in a rolling time-series feed (Sharpe, PnL, etc.). */
export interface TimeSeriesPoint {
  readonly timestamp: number;
  readonly value: number;
  readonly label: string;
}

// ── Dashboard Summary ───────────────────────────────────────────────────────

/** High-level summary across all experiments visible in the dashboard. */
export interface DashboardSummary {
  readonly totalExperiments: number;
  readonly profitableExperiments: number;
  readonly avgSharpe: number;
  readonly bestRegime: RegimeLabel;
  readonly worstRegime: RegimeLabel;
}

// ── Attribution Summary ─────────────────────────────────────────────────────

/** Attribution contribution weight per alpha id. */
export type AttributionSummary = Record<string, number>;

// ── Dashboard State ─────────────────────────────────────────────────────────

/** Full dashboard data layer snapshot — consumed by UI components. */
export interface DashboardState {
  readonly currentRegime: RegimeLabel;
  readonly regimeConfidence: number;
  readonly recentSignals: readonly AlphaSignal[];
  readonly openPositions: readonly DashboardPosition[];
  readonly performanceSummary: PerformanceSummary;
  readonly regimeTimeline: readonly RegimeTimelineEntry[];
  readonly attributionSummary: AttributionSummary;
}

// ── Input Types for update() ────────────────────────────────────────────────

/** Regime signal fed into the dashboard tracker. */
export interface RegimeInput {
  readonly label: RegimeLabel;
  readonly confidence: number;
  readonly timestamp: number;
}

/** Performance snapshot fed into the dashboard tracker on each tick. */
export interface PerformanceInput {
  readonly totalPnl: number;
  readonly sharpeRatio: number;
  readonly maxDrawdown: number;
  readonly winRate: number;
  readonly tradeCount: number;
  readonly avgDuration: number;
}
