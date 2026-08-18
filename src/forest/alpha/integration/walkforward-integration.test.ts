// Integration tests for walk-forward validation.
import { describe, it, expect } from 'vitest';
import { runWalkForward, type WindowConfig } from '@/forest/backtest/walkforward';
import type { BacktestResult } from '@/forest/backtest/types';
import type { Candle } from '@/forest/backtest/ohlcv';
import { RegimeLabel } from '@/tree/regime/types';
import { generateTrendingCandles, generateSyntheticCandlesWithRegimes } from './fixtures';

function makeCandles(n: number): Candle[] {
  return generateTrendingCandles(n, 'up');
}

function backtestFn(candles: Candle[]): BacktestResult {
  const rets: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const r = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
    rets.push(r);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length || 1);
  const std = Math.sqrt(variance);
  return {
    id: 'test',
    bot_id: 'bot-1',
    strategy: 'trend',
    pair: 'BTCUSDT',
    exchange: 'binance',
    start_date: candles[0]?.timestamp ?? 0,
    end_date: candles[candles.length - 1]?.timestamp ?? 0,
    total_trades: candles.length,
    win_count: Math.floor(candles.length * 0.6),
    loss_count: Math.floor(candles.length * 0.4),
    win_rate: 0.6,
    total_pnl: mean * 1000,
    max_drawdown: 0.05,
    sharpe_ratio: std > 0 ? (mean / std) * Math.sqrt(8760) : null,
    params_json: '{}',
    equity_curve_json: [],
    trades_json: [],
    created_at: Date.now(),
  };
}

function detectRegimeFn(candles: Candle[], index: number): RegimeLabel {
  if (index < 0 || index >= candles.length) return RegimeLabel.UNKNOWN;
  if (candles[index].close > candles[Math.max(0, index - 5)].close) return RegimeLabel.TREND_UP;
  return RegimeLabel.RANGE;
}

const CFG: WindowConfig = { trainBars: 10, validateBars: 5, testBars: 5, stepBars: 5 };

describe('walkforward integration', () => {
  it('walk-forward on synthetic data produces valid windows', () => {
    const candles = makeCandles(50);
    const result = runWalkForward(candles, CFG, 'rolling', backtestFn, detectRegimeFn);
    expect(result.windows.length).toBeGreaterThan(0);
    for (const w of result.windows) {
      expect(w.testEnd).toBeLessThanOrEqual(candles.length);
      expect(w.trainMetrics).toBeDefined();
      expect(w.testMetrics).toBeDefined();
      expect(typeof w.testMetrics.sharpe_ratio).toBe('number');
    }
  });

  it('degradation ratio < 2.0 on consistent strategy', () => {
    const candles = makeCandles(80);
    const result = runWalkForward(candles, CFG, 'rolling', backtestFn, detectRegimeFn);
    expect(result.aggregated.summaryStats.degradationRatio).toBeLessThan(2.0);
  });

  it('regime diversity > 0 when regimePlan has mixed regimes', () => {
    const candles = generateSyntheticCandlesWithRegimes([
      { regime: 'TREND_UP', bars: 25 },
      { regime: 'RANGE', bars: 25 },
    ]);
    const result = runWalkForward(candles, CFG, 'rolling', backtestFn, detectRegimeFn);
    expect(result.aggregated.summaryStats.regimeDiversity).toBeGreaterThan(0);
  });
});