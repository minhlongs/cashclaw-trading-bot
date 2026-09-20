// Alpha Research Pipeline — Types
// Orchestrator types for the end-to-end alpha research pipeline.

import type { Candle } from '@/forest/backtest/ohlcv';
import type { RegimeConfig } from '@/tree/regime/types';
import type { WindowConfig } from '@/forest/backtest/walkforward';
import type { StressMode } from '@/forest/backtest/cost-model';
import type { SurvivalGateConfig } from '@/forest/alpha/gate/survival-gate';
import type { StrategyPhase } from '@/forest/alpha/gate/promotion-states';
import type { DerivativeData } from './types-steps';

export * from './types-steps';
export * from './types-report';

// ── Pipeline Configuration ──────────────────────────────────────────────────

/** Configuration for a full alpha research pipeline run. */
export interface PipelineConfig {
  /** Trading pair symbol (e.g. 'BTCUSDT'). */
  symbol: string;
  /** Candle timeframe (e.g. '1h', '4h', '1d'). */
  timeframe: string;
  /** Pre-fetched OHLCV candle data. */
  candles: Candle[];
  /**
   * Optional pre-fetched derivative data.
   * When set, `fetch_derivatives` uses it directly instead of calling Binance.
   * Lets tests exercise the derivative alpha path deterministically offline.
   * When unset, the step fetches live data and degrades to empty on network failure.
   */
  derivatives?: DerivativeData;
  /** Indicator computation parameters (keyed by indicator name). */
  indicatorSet: Record<string, number>;
  /** Regime classifier configuration. */
  regimeConfig: RegimeConfig;
  /** Walk-forward window configuration. */
  walkforwardConfig: WindowConfig;
  /** Cost stress mode for evaluation. */
  costMode: StressMode;
  /** Minimum Sharpe ratio to pass the pipeline. */
  minSharpe: number;
  /** Minimum trade count to pass the pipeline. */
  minTrades: number;
  /** Whether to run baseline strategy comparisons. */
  baselinesEnabled: boolean;
  /** Optional survival gate configuration for strategy filtering. */
  survivalGateConfig?: SurvivalGateConfig;
  /** Optional initial strategy phase (defaults to 'RESEARCH'). */
  initialStrategyPhase?: StrategyPhase;
}
