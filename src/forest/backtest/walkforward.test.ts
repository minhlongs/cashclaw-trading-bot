import { describe, it, expect } from 'vitest';
import { runWalkForward } from './walkforward';
import type { WindowConfig, RunBacktestFn, DetectRegimeFn } from './walkforward';
import type { BacktestResult } from './types';
import type { Candle } from './ohlcv';
import { RegimeLabel } from '@/tree/regime/types';

// ──────────────────────────────────────────────
// Synthetic helpers
// ──────────────────────────────────────────────

function mkCandles(n: number, baseTs = 0): Candle[] {
  return Array.from({ length: n }, (_, i) => ({
    timestamp: baseTs + i * 3_600_000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  }));
}

function mkResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    id: 'test',
    bot_id: 'bot1',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    start_date: 0,
    end_date: 1,
    total_trades: 10,
    win_count: 6,
    loss_count: 4,
    win_rate: 0.6,
    total_pnl: 50,
    max_drawdown: 5,
    sharpe_ratio: 1.5,
    params_json: '{}',
    equity_curve_json: [],
    trades_json: [],
    created_at: 0,
    ...overrides,
  };
}

// Backtest fn that returns a result keyed by candle count for easy assertions
function makeBacktestFn(): RunBacktestFn {
  return (candles: Candle[]) =>
    mkResult({
      total_trades: candles.length,
      sharpe_ratio: candles.length / 100,
    });
}

// Regime fn that alternates TREND_UP / RANGE every 50 candles
const alternatingRegime: DetectRegimeFn = (_candles, index) =>
  Math.floor(index / 50) % 2 === 0 ? RegimeLabel.TREND_UP : RegimeLabel.RANGE;

const fixedRegime: DetectRegimeFn = () => RegimeLabel.TREND_UP;

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('runWalkForward', () => {
  describe('basic windowing', () => {
    it('produces correct number of windows in rolling mode', () => {
      const cfg: WindowConfig = { trainBars: 100, validateBars: 30, testBars: 30, stepBars: 30 };
      const candles = mkCandles(250);
      const result = runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), fixedRegime);
      // Offsets: 0,30,60,90,120,150 -> testEnd = offset+160; only offsets where testEnd<=250
      // offsets: 0,30,60,90 -> 4 windows
      expect(result.windows.length).toBe(4);
    });

    it('produces correct number of windows in expanding mode', () => {
      const cfg: WindowConfig = { trainBars: 100, validateBars: 30, testBars: 30, stepBars: 30 };
      const candles = mkCandles(250);
      const result = runWalkForward(candles, cfg, 'expanding', makeBacktestFn(), fixedRegime);
      // train always starts at 0; testEnd = offset+160 <= 250 -> offsets 0,30,60,90
      expect(result.windows.length).toBe(4);
    });

    it('sets correct boundaries for each window', () => {
      const cfg: WindowConfig = { trainBars: 50, validateBars: 20, testBars: 20, stepBars: 20 };
      const candles = mkCandles(150);
      const result = runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), fixedRegime);
      const w = result.windows[0];
      expect(w.trainStart).toBe(0);
      expect(w.trainEnd).toBe(50);
      expect(w.validateStart).toBe(50);
      expect(w.validateEnd).toBe(70);
      expect(w.testStart).toBe(70);
      expect(w.testEnd).toBe(90);
    });

    it('expanding mode keeps trainStart at 0 for all windows', () => {
      const cfg: WindowConfig = { trainBars: 80, validateBars: 20, testBars: 20, stepBars: 20 };
      const candles = mkCandles(200);
      const result = runWalkForward(candles, cfg, 'expanding', makeBacktestFn(), fixedRegime);
      for (const w of result.windows) {
        expect(w.trainStart).toBe(0);
      }
    });
  });

  describe('candle slicing', () => {
    it('passes correct candle slices to backtest fn', () => {
      const received: number[] = [];
      const fn: RunBacktestFn = (c) => {
        received.push(c.length);
        return mkResult();
      };
      const cfg: WindowConfig = { trainBars: 40, validateBars: 10, testBars: 10, stepBars: 10 };
      const candles = mkCandles(80);
      runWalkForward(candles, cfg, 'rolling', fn, fixedRegime);
      // Each window should receive slices of exact sizes
      expect(received.every(len => [40, 10, 10].includes(len))).toBe(true);
    });
  });

  describe('aggregation', () => {
    it('averages in-sample across all windows', () => {
      const cfg: WindowConfig = { trainBars: 50, validateBars: 20, testBars: 20, stepBars: 20 };
      const candles = mkCandles(150);
      const result = runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), fixedRegime);
      // trainMetrics sharpe = candles.length / 100 = 50/100 = 0.5 for all
      expect(result.aggregated.inSample.sharpe_ratio).toBeCloseTo(0.5, 4);
      expect(result.aggregated.inSample.total_trades).toBe(50);
    });

    it('averages out-of-sample across all windows', () => {
      const cfg: WindowConfig = { trainBars: 50, validateBars: 20, testBars: 20, stepBars: 20 };
      const candles = mkCandles(150);
      const result = runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), fixedRegime);
      // testMetrics sharpe = 20/100 = 0.2
      expect(result.aggregated.outOfSample.sharpe_ratio).toBeCloseTo(0.2, 4);
    });
  });

  describe('regime breakdown', () => {
    it('groups out-of-sample by regime label', () => {
      const cfg: WindowConfig = { trainBars: 100, validateBars: 30, testBars: 30, stepBars: 30 };
      const candles = mkCandles(250);
      const result = runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), alternatingRegime);
      const regimeLabels = Object.keys(result.aggregated.byRegime);
      expect(regimeLabels.length).toBeGreaterThanOrEqual(1);
      expect(result.aggregated.summaryStats.regimeDiversity).toBe(regimeLabels.length);
    });

    it('captures regime at test window start', () => {
      const cfg: WindowConfig = { trainBars: 50, validateBars: 20, testBars: 20, stepBars: 20 };
      const candles = mkCandles(150);
      const result = runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), fixedRegime);
      for (const w of result.windows) {
        expect(w.regimeAtTestStart).toBe(RegimeLabel.TREND_UP);
      }
    });
  });

  describe('summary stats', () => {
    it('computes degradationRatio as out-of-sample / in-sample sharpe', () => {
      const cfg: WindowConfig = { trainBars: 100, validateBars: 30, testBars: 30, stepBars: 30 };
      const candles = mkCandles(250);
      const result = runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), fixedRegime);
      const { summaryStats } = result.aggregated;
      // inSample sharpe = 100/100 = 1.0, outOfSample sharpe = 30/100 = 0.3
      expect(summaryStats.avgInSampleSharpe).toBeCloseTo(1.0, 4);
      expect(summaryStats.avgOutSampleSharpe).toBeCloseTo(0.3, 4);
      expect(summaryStats.degradationRatio).toBeCloseTo(0.3, 4);
      expect(summaryStats.totalWindows).toBe(result.windows.length);
    });
  });

  describe('', () => {
    it('throws when not enough candles', () => {
      const cfg: WindowConfig = { trainBars: 100, validateBars: 50, testBars: 50, stepBars: 10 };
      const candles = mkCandles(50);
      expect(() => runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), fixedRegime))
        .toThrow('Not enough candles');
    });

    it('throws when stepBars is 0', () => {
      const cfg: WindowConfig = { trainBars: 10, validateBars: 5, testBars: 5, stepBars: 0 };
      const candles = mkCandles(50);
      expect(() => runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), fixedRegime))
        .toThrow('stepBars must be > 0');
    });

    it('throws when trainBars exceeds total candles', () => {
      const cfg: WindowConfig = { trainBars: 200, validateBars: 50, testBars: 50, stepBars: 50 };
      const candles = mkCandles(100);
      expect(() => runWalkForward(candles, cfg, 'rolling', makeBacktestFn(), fixedRegime))
        .toThrow('Not enough candles');
    });
  });
});
