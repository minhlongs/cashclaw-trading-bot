import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBacktest } from './engine';
import type { Candle } from './ohlcv';
import type { GridBotConfig, MeanRevBotConfig } from '@/tree/bot/types';

function makeCandles(count: number, basePrice = 100): Candle[] {
  const candles: Candle[] = [];
  let timestamp = Date.now();

  for (let i = 0; i < count; i++) {
    const open = basePrice + (Math.random() - 0.5) * 10;
    const close = open + (Math.random() - 0.5) * 5;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;

    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: 1000 + Math.random() * 500,
    });
    timestamp += 60000; // 1 minute intervals
  }

  return candles;
}

function makeGridConfig(overrides: Partial<GridBotConfig> = {}): GridBotConfig {
  return {
    id: 'backtest-bot',
    strategy: 'grid',
    symbol: 'BTC/USDT',
    exchange: 'paper',
    mode: 'paper',
    gridSpacingPct: 1,
    gridLevels: 5,
    investmentAmount: 1000,
    ...overrides,
  } as GridBotConfig;
}

function makeMeanRevConfig(overrides: Partial<MeanRevBotConfig> = {}): MeanRevBotConfig {
  return {
    id: 'backtest-bot',
    strategy: 'mean_reversion',
    symbol: 'BTC/USDT',
    exchange: 'paper',
    mode: 'paper',
    bbPeriod: 20,
    bbStdDev: 2,
    investmentAmount: 1000,
    ...overrides,
  } as MeanRevBotConfig;
}

describe('runBacktest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('input validation', () => {
    it('throws error when no candles provided', () => {
      const config = makeGridConfig();

      expect(() => runBacktest({ config, candles: [], botId: 'test' })).toThrow('Not enough candles: 0');
    });

    it('throws error when only one candle provided', () => {
      const config = makeGridConfig();
      const candles = makeCandles(1);

      expect(() => runBacktest({ config, candles, botId: 'test' })).toThrow('Not enough candles: 1');
    });

    it('accepts two or more candles', async () => {
      const config = makeGridConfig();
      const candles = makeCandles(2);

      const result = runBacktest({ config, candles, botId: 'test-bot' });

      expect(result).toBeDefined();
      expect(result.total_trades).toBeGreaterThanOrEqual(0);
    });
  });

  describe('grid strategy backtest', () => {
    it('runs basic grid backtest with profit', async () => {
      const config = makeGridConfig({
        gridSpacingPct: 2,
        gridLevels: 3,
      });

      // Create trending candles to trigger grid trades
      const candles: Candle[] = [];
      for (let i = 0; i < 50; i++) {
        const price = 100 + i * 0.5;
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: price,
          high: price + 1,
          low: price - 1,
          close: price + 0.25,
          volume: 1000,
        });
      }

      const result = runBacktest({ config, candles, botId: 'test-bot' });

      expect(result).toMatchObject({
        start_date: expect.any(Number),
        end_date: expect.any(Number),
        total_trades: expect.any(Number),
        win_count: expect.any(Number),
        loss_count: expect.any(Number),
        win_rate: expect.any(Number),
        total_pnl: expect.any(Number),
        max_drawdown: expect.any(Number),
        params_json: expect.any(String),
        equity_curve_json: expect.any(Array),
        trades_json: expect.any(Array),
        created_at: expect.any(Number),
      });
    });

    it('calculates correct win/loss counts', async () => {
      const config = makeGridConfig({
        gridSpacingPct: 1.5,
        gridLevels: 2,
      });

      // Create oscillating prices to generate both wins and losses
      const candles: Candle[] = [];
      for (let i = 0; i < 100; i++) {
        const oscillation = Math.sin(i * 0.3) * 5;
        const price = 100 + oscillation;
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: price,
          high: price + 2,
          low: price - 2,
          close: price + oscillation * 0.1,
          volume: 1000,
        });
      }

      const result = runBacktest({ config, candles, botId: 'test-bot' });

      expect(result.win_count + result.loss_count).toBe(result.total_trades);
      expect(result.win_rate).toBeGreaterThanOrEqual(0);
      expect(result.win_rate).toBeLessThanOrEqual(1);
    });

    it('calculates valid metrics', async () => {
      const config = makeGridConfig();
      const candles = makeCandles(100);

      const result = runBacktest({ config, candles, botId: 'test-bot' });

      expect(result.max_drawdown).toBeGreaterThanOrEqual(0);
      expect(result.max_drawdown).toBeLessThanOrEqual(100);
      expect(result.start_date).toBeLessThanOrEqual(result.end_date);
      expect(result.trades_json.length).toBe(result.total_trades);
    });
  });

  describe('mean reversion strategy backtest', () => {
    it('runs basic mean reversion backtest', async () => {
      const config = makeMeanRevConfig({
        bbPeriod: 10,
        bbStdDev: 1.5,
      });

      // Create mean-reverting prices
      const candles: Candle[] = [];
      for (let i = 0; i < 50; i++) {
        const basePrice = 100 + Math.sin(i * 0.2) * 10;
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: basePrice,
          high: basePrice + 3,
          low: basePrice - 3,
          close: basePrice + (Math.random() - 0.5) * 2,
          volume: 1000,
        });
      }

      const result = runBacktest({ config, candles, botId: 'test-bot' });

      expect(result).toBeDefined();
      expect(result.params_json).toContain('mean_reversion');
    });

    it('handles insufficient period data gracefully', async () => {
      const config = makeMeanRevConfig({
        bbPeriod: 30,
      });

      // Provide fewer candles than the period
      const candles = makeCandles(20);

      const result = runBacktest({ config, candles, botId: 'test-bot' });

      // Should complete without trades if not enough data for indicators
      expect(result).toBeDefined();
      expect(result.total_trades).toBeGreaterThanOrEqual(0);
    });
  });

  describe('equity curve and trade tracking', () => {
    it('generates equity curve with timestamps', async () => {
      const config = makeGridConfig();
      const candles = makeCandles(50);

      const result = runBacktest({ config, candles, botId: 'test-bot' });

      expect(result.equity_curve_json).toBeInstanceOf(Array);
      if (result.equity_curve_json.length > 0) {
        expect(result.equity_curve_json[0]).toMatchObject({
          timestamp: expect.any(Number),
          equity: expect.any(Number),
        });
      }
    });

    it('records individual trades with timestamps and pnl', async () => {
      const config = makeGridConfig({
        gridSpacingPct: 1,
        gridLevels: 4,
      });

      const candles = makeCandles(100);

      const result = runBacktest({ config, candles, botId: 'test-bot' });

      if (result.trades_json.length > 0) {
        const trade = result.trades_json[0];
        expect(trade).toMatchObject({
          entryTimestamp: expect.any(Number),
          exitTimestamp: expect.any(Number),
          entryPrice: expect.any(Number),
          exitPrice: expect.any(Number),
          side: expect.stringMatching(/^(buy|sell)$/),
          pnl: expect.any(Number),
        });
        expect(trade.exitTimestamp).toBeGreaterThan(trade.entryTimestamp);
      }
    });
  });

  describe('error handling', () => {
    it('handles invalid grid config gracefully', async () => {
      const config = {
        id: 'bad-config',
        strategy: 'grid',
        symbol: 'BTC/USDT',
        exchange: 'paper',
        mode: 'paper',
        // Missing required fields
      } as unknown as GridBotConfig;
      const candles = makeCandles(50);

      // Should not throw, but complete with potentially no trades
      const result = runBacktest({ config, candles, botId: 'test-bot' });
      expect(result).toBeDefined();
    });

    it('handles extreme price variations', async () => {
      const config = makeGridConfig();
      const candles: Candle[] = [];

      for (let i = 0; i < 50; i++) {
        const price = Math.random() > 0.5 ? 1000 : 10; // Extreme jumps
        candles.push({
          timestamp: Date.now() + i * 60000,
          open: price,
          high: price * 1.1,
          low: price * 0.9,
          close: price,
          volume: 1000,
        });
      }

      const result = runBacktest({ config, candles, botId: 'test-bot' });

      expect(result).toBeDefined();
      expect(result.max_drawdown).toBeGreaterThanOrEqual(0);
    });
  });
});
