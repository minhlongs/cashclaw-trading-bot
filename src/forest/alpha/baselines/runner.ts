// Baseline strategy runner — deterministic benchmark strategies for alpha evaluation
// Produces EvaluationReport for each baseline: buy_hold, random_entry, momentum, mean_reversion

import type { Candle } from '@/forest/backtest/ohlcv';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { BaselineConfig } from './types';
import { costConfig } from './runner-helpers';
import {
  buyAndHold,
  randomEntry,
  simpleMomentum,
  simpleMeanReversion,
} from './runner-strategies';
import { buildReport, emptyReport } from './report-builder';

// Re-export type for backward compatibility
export type { BaselineStrategy } from './types';

// ── Main entry ────────────────────────────────────────────
export function runBaseline(candles: Candle[], config: BaselineConfig): EvaluationReport {
  if (candles.length < 2) return emptyReport(config);
  const cfg = costConfig(config.stressMode, config.feePct, config.slipPct);
  let trades;
  switch (config.strategy) {
    case 'buy_hold': trades = buyAndHold(candles, cfg); break;
    case 'random_entry': trades = randomEntry(candles, cfg, 42); break;
    case 'simple_momentum': trades = simpleMomentum(candles, cfg); break;
    case 'simple_mean_reversion': trades = simpleMeanReversion(candles, cfg); break;
  }
  const totalFees = trades.reduce((s, t) => s + t.fee, 0);
  return buildReport(trades, config, totalFees);
}
