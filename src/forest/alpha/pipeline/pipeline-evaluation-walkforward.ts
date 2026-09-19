// Alpha Research Pipeline — Walkforward Step
// Step: run_walkforward

import type { PipelineConfig, SignalData, WalkforwardData } from './types';
import { resolveStressConfig, type StressMode } from '@/forest/backtest/cost-model';
import { extractTrades, computeEquityAndSharpe } from './pipeline-utils';

export function stepRunWalkforward(
  cfg: PipelineConfig,
  map: Map<string, unknown>,
): WalkforwardData {
  const { candles, regimeConfig, walkforwardConfig, costMode, minSharpe, minTrades } = cfg;
  const sd = map.get('generate_signals') as SignalData | undefined;
  if (!sd) throw new Error('No signals for walkforward');

  const trainBars = walkforwardConfig.trainBars ?? 20;
  const testBars = walkforwardConfig.testBars ?? 10;
  const total = trainBars + testBars * 3;
  if (candles.length < total) throw new Error(`Not enough candles: ${candles.length} < ${total}`);

  const off = regimeConfig.lookback;
  const costCfgWf = resolveStressConfig(costMode as StressMode);
  const trades = extractTrades(sd.signals, candles.slice(0, total), off, {
    ...costCfgWf,
    marketImpactPct: 0,
  });
  const tc = trades.length;

  const { sharpe } = computeEquityAndSharpe(trades, cfg.timeframe);
  return { sharpe, totalTrades: tc, passed: sharpe >= minSharpe && tc >= minTrades };
}
