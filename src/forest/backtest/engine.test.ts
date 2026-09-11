import { describe, it, expect } from 'vitest';
import { runBacktest } from './engine';
import type { Candle } from './ohlcv';
import type { GridBotConfig, MeanRevBotConfig, VolatilityDcaBotConfig, BotConfig } from '@/tree/bot/types';

function makeCandle(close: number, index: number, high?: number, low?: number, vol = 1000): Candle {
  return {
    timestamp: 1700000000000 + index * 3600000,
    open: close,
    high: high ?? close * 1.005,
    low: low ?? close * 0.995,
    close,
    volume: vol,
  };
}

describe('runBacktest', () => {
  it('throws error when fewer than 2 candles are provided', () => {
    const config: GridBotConfig = {
      strategy: 'grid',
      symbol: 'BTC/USDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 10000,
      maxDrawdownPct: 20,
      gridSpacingPct: 1,
      gridLevels: 5,
      capitalPerLevelPct: 10,
      takeProfitPct: 2,
      stopLossPct: 5,
      rebalanceOnFill: false,
    };
    expect(() => runBacktest({ config, candles: [makeCandle(50000, 0)], botId: 'b1' }))
      .toThrow('Not enough candles: 1');
  });

  it('throws error on unsupported strategy', () => {
    const invalidConfig = {
      strategy: 'unknown_algo',
      symbol: 'BTC/USDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 10000,
    } as unknown as BotConfig;
    const candles = [makeCandle(50000, 0), makeCandle(50100, 1)];
    expect(() => runBacktest({ config: invalidConfig, candles, botId: 'b1' }))
      .toThrow('Unsupported backtest strategy: unknown_algo');
  });

  it('runs backtest for volatility_dca with multi-tranche DCA and rebound exit', () => {
    const config: VolatilityDcaBotConfig = {
      strategy: 'volatility_dca',
      symbol: 'BTC/USDT',
      pair: 'BTC/USDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 10000,
      maxDrawdownPct: 20,
      priceDropStep: 2.0,
      maxSteps: 3,
      baseOrderSizePct: 10,
      volatilityWindow: 4,
      volBaseline: 30,
      reboundTarget: 3.0,
    };

    // Window accumulation (4 candles), then drops, then strong rebound
    const prices = [50000, 50100, 49900, 50000, 48500, 47000, 52000, 52500];
    const candles = prices.map((p, i) => makeCandle(p, i));

    const result = runBacktest({ config, candles, botId: 'bot-dca', feePct: 0.1, slippagePct: 0.05 });

    expect(result.strategy).toBe('volatility_dca');
    expect(result.bot_id).toBe('bot-dca');
    expect(result.total_trades).toBeGreaterThanOrEqual(1);
    expect(result.trades_json.length).toBe(result.total_trades);
    expect(result.equity_curve_json.length).toBe(candles.length);
    expect(result.win_rate).toBeGreaterThanOrEqual(0);
    expect(typeof result.total_pnl).toBe('number');
    expect(typeof result.max_drawdown).toBe('number');
  });

  it('runs backtest for grid strategy over oscillating prices', () => {
    const config: GridBotConfig = {
      strategy: 'grid',
      symbol: 'BTC/USDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 10000,
      maxDrawdownPct: 20,
      gridSpacingPct: 1,
      gridLevels: 6,
      capitalPerLevelPct: 10,
      takeProfitPct: 2,
      stopLossPct: 5,
      rebalanceOnFill: false,
    };

    const prices = [50000, 49500, 49000, 50500, 51000, 49500, 50000];
    const candles = prices.map((p, i) => makeCandle(p, i, p * 1.01, p * 0.99));

    const result = runBacktest({ config, candles, botId: 'bot-grid' });

    expect(result.strategy).toBe('grid');
    expect(result.bot_id).toBe('bot-grid');
    expect(result.equity_curve_json.length).toBe(candles.length);
    expect(result.pair).toBe('BTC/USDT');
  });

  it('runs backtest for mean_reversion strategy with oversold pullback', () => {
    const config: MeanRevBotConfig = {
      strategy: 'mean_reversion',
      symbol: 'BTC/USDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 10000,
      maxDrawdownPct: 20,
      bbPeriod: 5,
      bbStdDev: 2,
      rsiPeriod: 5,
      rsiBuyThreshold: 30,
      rsiSellThreshold: 70,
      volumeMultiplier: 1.0,
      positionSizePct: 20,
      cooldownMinutes: 10,
    };

    // Warm up BB & RSI with flat prices, then plunge (oversold), then sharp rally
    const prices = [50000, 50050, 49950, 50000, 50020, 46000, 53000, 53500];
    const candles = prices.map((p, i) => makeCandle(p, i, p * 1.02, p * 0.98, 5000));

    const result = runBacktest({ config, candles, botId: 'bot-mr' });

    expect(result.strategy).toBe('mean_reversion');
    expect(result.bot_id).toBe('bot-mr');
    expect(result.equity_curve_json.length).toBe(candles.length);
  });
});
