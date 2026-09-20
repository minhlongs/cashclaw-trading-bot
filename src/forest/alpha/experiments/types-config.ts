// Experiment Engine — Configuration Types

/** Unique experiment identifier (UUID or slug). */
export type ExperimentId = string;

/** Fixed-cost or percentage-based fee model. */
export interface FeeModel {
  type: 'fixed' | 'percentage';
  /** Absolute cost per trade (fixed) or fraction of notional (percentage). */
  value: number;
}

/** Fixed, percentage, or adaptive slippage model. */
export interface SlippageModel {
  type: 'fixed' | 'percentage' | 'dynamic';
  /** Base slippage value (absolute or fraction depending on type). */
  value: number;
}

/** Named set of feature identifiers applied during the experiment. */
export interface FeatureSet {
  name: string;
  features: string[];
}

/** Entry condition specification. */
export interface EntryRule {
  type: 'signal' | 'ml' | 'threshold';
  signal?: string;
  threshold?: number;
  direction?: 'buy' | 'sell';
}

/** Exit condition specification. */
export interface ExitRule {
  type: 'signal' | 'stoploss' | 'takeprofit' | 'trailing';
  value: number;
  signal?: string;
}

/** Position sizing strategy. */
export interface PositionSizing {
  type: 'fixed' | 'percent_capital' | 'kelly' | 'volatility_target';
  value: number;
}

/** ISO-8601 date strings marking the boundaries of a period. */
export interface Period {
  start: string;
  end: string;
}
