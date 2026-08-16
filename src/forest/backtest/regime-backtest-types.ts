// Regime-Backtest public types

import type { RegimeLabel } from '@/tree/regime/types';
import type { RegimeConfig } from '@/tree/regime/types';
import type { AlphaRouterConfig } from '@/tree/regime/alpha-router';

export interface RegimeBacktestConfig {
  /** Number of candles per regime classification window. */
  windowSize: number;
  /** Step size in candles when sliding the window forward. */
  stepSize: number;
  /** Regime classification configuration. */
  regimeConfig: RegimeConfig;
  /** Alpha router configuration. */
  routerConfig?: AlphaRouterConfig;
}

export interface RegimeWindow {
  /** Start index (inclusive) of the window in the candle array. */
  start: number;
  /** End index (exclusive) of the window. */
  end: number;
  /** Detected regime for this window. */
  regime: RegimeLabel;
  /** Number of trades taken in this window. */
  trades: number;
  /** Net PnL for this window. */
  pnl: number;
  /** Sharpe ratio for this window (null if insufficient data). */
  sharpe: number | null;
}

export interface RegimePerformance {
  /** Average Sharpe across windows with this regime. */
  avgSharpe: number | null;
  /** Sum of PnL across windows with this regime. */
  totalPnl: number;
  /** Total trades across windows with this regime. */
  totalTrades: number;
  /** Number of windows with this regime. */
  windowCount: number;
}

export interface RegimeBacktestResult {
  /** Per-window results with regime, trades, PnL. */
  windows: RegimeWindow[];
  /** Per-regime aggregated performance breakdown. */
  regimePerformance: Partial<Record<RegimeLabel, RegimePerformance>>;
  /** Sharpe ratio of regime-conditioned run. */
  regimeSharpe: number | null;
  /** Sharpe ratio of non-conditioned baseline run. */
  baselineSharpe: number | null;
  /** Relative improvement: (regime - baseline) / |baseline|, or null if baseline is zero. */
  overallImprovement: number | null;
}
