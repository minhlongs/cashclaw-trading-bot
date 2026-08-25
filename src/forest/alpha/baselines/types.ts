// Baseline strategy types — simple benchmark strategies for alpha evaluation

export type BaselineStrategy =
  | 'buy_hold'
  | 'random_entry'
  | 'simple_momentum'
  | 'simple_mean_reversion';

export interface BaselineConfig {
  strategy: BaselineStrategy;
  symbol: string;
  timeframe: string;
  stressMode: 'normal' | 'conservative' | 'adverse' | 'extreme';
  feePct: number;
  slipPct: number;
}
