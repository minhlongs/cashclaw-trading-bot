// Backtest Module — barrel export
// Core metrics
export { buildTradesFromFills, buildEquity, computeSharpe } from './metrics';
// Extended metrics
export { computeExtendedMetrics } from './metrics-extended';
export type { ExtendedBacktestMetrics } from './metrics-types';
// Types
export type { BacktestTrade, BacktestEquityPoint, BacktestResult, RunBacktestOptions } from './types';
// Fill type used by extended metrics
export type { Fill } from './paper-exchange';
