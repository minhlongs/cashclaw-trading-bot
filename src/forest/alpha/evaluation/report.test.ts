// Alpha Evaluation Report — tests with synthetic data
// Validates generateReport produces correct metrics and segmentations.

import { describe, it, expect } from 'vitest';
import { generateReport } from './report';
import type { BacktestTrade, ExtendedBacktestMetrics } from '@/forest/backtest';
import type { Candle } from '@/forest/backtest/ohlcv';
import { RegimeLabel } from '@/tree/regime/types';

// ── Synthetic data helpers ────────────────────────────────────────────────────

const syntheticMetrics: ExtendedBacktestMetrics = {
  id: 'm1', bot_id: 'b1', strategy: 's1', pair: 'BTCUSDT', exchange: 'binance',
  start_date: 0, end_date: 0,
  total_trades: 5,
  win_count: 3,
  loss_count: 2,
  win_rate: 0.6,
  total_pnl: 2500,
  max_drawdown: 500,
  sharpe_ratio: 1.2,
  params_json: '{}',
  equity_curve_json: [],
  trades_json: [],
  created_at: Date.now(),
  profit_factor: 2.5,
  expectancy: 500,
  sortino_ratio: 1.5,
  max_drawdown_duration: 3,
  calmar_ratio: 5.0,
  avg_trade: 500,
  median_trade: 480,
  turnover: 15000,
  recovery_factor: 5.0,
  exposure_pct: 0.4,
};

function makeTrade(ts: number, pnl: number): BacktestTrade {
  return {
    entryTimestamp: ts,
    exitTimestamp: ts + 3600000,
    side: 'buy',
    entryPrice: 100,
    exitPrice: 102,
    quantity: 1,
    pnl,
    fee: 5,
    pnlPct: 2,
    holdingMinutes: 60,
  };
}

const syntheticTrades: BacktestTrade[] = [
  makeTrade(1700000000000, 600),
  makeTrade(1700003600000, 700),
  makeTrade(1700007200000, -300),
  makeTrade(1700010800000, 800),
  makeTrade(1700014400000, -200),
];

const completeMetrics: ExtendedBacktestMetrics = {
  ...syntheticMetrics,
  trades_json: syntheticTrades,
  total_trades: 5,
  win_count: 3,
  loss_count: 2,
  win_rate: 0.6,
  total_pnl: 1600,
  max_drawdown: 300,
  profit_factor: 1.0,
  expectancy: 320,
  avg_trade: 320,
  median_trade: 600,
  recovery_factor: 5.33,
  exposure_pct: 0.5,
};

const syntheticCandles: Candle[] = [
  { timestamp: 1699998000000, open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { timestamp: 1700001600000, open: 101, high: 108, low: 100, close: 107, volume: 1500 },
  { timestamp: 1700005200000, open: 107, high: 110, low: 106, close: 109, volume: 1200 },
  { timestamp: 1700008800000, open: 109, high: 112, low: 108, close: 111, volume: 900 },
  { timestamp: 1700012400000, open: 111, high: 115, low: 110, close: 114, volume: 2000 },
];

const input = {
  experimentId: 'exp-1',
  symbol: 'BTCUSDT',
  timeframe: '1h',
  regime: RegimeLabel.TREND_UP,
  metrics: completeMetrics,
};

describe('generateReport', () => {
  it('maps all top-level metrics from ExtendedBacktestMetrics', () => {
    const report = generateReport(input, syntheticCandles);

    expect(report.experimentId).toBe('exp-1');
    expect(report.symbol).toBe('BTCUSDT');
    expect(report.timeframe).toBe('1h');
    expect(report.regime).toBe(RegimeLabel.TREND_UP);
    expect(report.totalReturn).toBe(1600);
    expect(report.netPnl).toBe(1600);
    expect(report.winRate).toBeCloseTo(0.6);
    expect(report.lossRate).toBeCloseTo(0.4);
    expect(report.profitFactor).toBeCloseTo(1.0);
    expect(report.expectancy).toBeCloseTo(320);
    expect(report.maxDrawdown).toBeCloseTo(300);
    expect(report.numTrades).toBe(5);
    expect(report.exposure).toBeCloseTo(0.5);
  });

  it('segments by regime', () => {
    const report = generateReport(input, syntheticCandles);
    expect(report.byRegime[RegimeLabel.TREND_UP]).toBeDefined();
    expect(report.byRegime[RegimeLabel.TREND_UP]?.numTrades).toBe(5);
  });

  it('segments by month', () => {
    const report = generateReport(input, syntheticCandles);
    const months = Object.keys(report.byMonth);
    expect(months.length).toBeGreaterThan(0);
    expect(report.byMonth[months[0]]?.numTrades).toBe(5);
  });

  it('segments by volatility bucket', () => {
    const report = generateReport(input, syntheticCandles);
    const volKeys = Object.keys(report.byVolBucket);
    expect(volKeys.length).toBeGreaterThan(0);
    const totalSegmented = volKeys.reduce(
      (sum, k) => sum + (report.byVolBucket[k]?.numTrades ?? 0), 0,
    );
    expect(totalSegmented).toBe(5);
  });

  it('segments by duration', () => {
    const report = generateReport(input, syntheticCandles);
    expect(report.byDuration.short?.numTrades).toBe(5);
    expect(report.byDuration.medium?.numTrades).toBe(0);
    expect(report.byDuration.long?.numTrades).toBe(0);
  });

  it('handles empty trades gracefully', () => {
    const emptyInput = {
      ...input,
      metrics: { ...completeMetrics, trades_json: [], total_trades: 0, win_rate: 0, total_pnl: 0 },
    };
    const report = generateReport(emptyInput, syntheticCandles);
    expect(report.numTrades).toBe(0);
    expect(report.netPnl).toBe(0);
    expect(report.byMonth).toEqual({});
    expect(Object.keys(report.byVolBucket).length).toBe(0);
    expect(report.byDuration.short?.numTrades).toBe(0);
  });
});