import { describe, it, expect, vi } from 'vitest';

vi.mock('@/tree/bot/strategies/grid', () => ({
  GridStrategy: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    evaluate: vi.fn().mockReturnValue(null),
  })),
}));

vi.mock('@/tree/bot/strategies/mean-reversion', () => ({
  MeanRevStrategy: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    evaluate: vi.fn().mockReturnValue(null),
  })),
}));

vi.mock('@/tree/bot/strategy-chain', () => ({
  buildDefaultChain: vi.fn().mockReturnValue([
    {
      strategy: { name: 'chain-a', evaluate: vi.fn().mockReturnValue(null) },
      fallback: null,
    },
  ]),
}));

import { initializeStrategy, evaluateChain } from './bot-strategy';
import type { GridBotConfig, MeanRevBotConfig } from './types';
import type { StrategyChain, StrategyContext } from './types';

function makeGridConfig(overrides: Partial<GridBotConfig> = {}): GridBotConfig {
  return {
    strategy: 'grid',
    symbol: 'ETH/USDT',
    exchange: 'binance',
    mode: 'paper',
    capital: 1000,
    gridSpacingPct: 1,
    gridLevels: 4,
    capitalPerLevelPct: 25,
    takeProfitPct: 2,
    stopLossPct: 3,
    rebalanceOnFill: false,
    maxDrawdownPct: 15,
    ...overrides,
  };
}

function makeMeanRevConfig(overrides: Partial<MeanRevBotConfig> = {}): MeanRevBotConfig {
  return {
    strategy: 'mean_reversion',
    symbol: 'SOL/USDT',
    exchange: 'binance',
    mode: 'paper',
    capital: 800,
    bbPeriod: 20,
    bbStdDev: 2,
    rsiPeriod: 14,
    rsiBuyThreshold: 30,
    rsiSellThreshold: 70,
    volumeMultiplier: 1.5,
    positionSizePct: 10,
    cooldownMinutes: 5,
    maxDrawdownPct: 5,
    ...overrides,
  };
}

function makeChain(signals: Array<null | { side: 'buy' | 'sell'; qty: number }>): StrategyChain {
  return signals.map((signal, index) => ({
    strategy: {
      name: `leg-${index}`,
      evaluate: vi.fn().mockReturnValue(signal),
    },
    fallback: null,
  }));
}

describe('bot-strategy', () => {
  describe('initializeStrategy', () => {
    it('creates grid strategy with strategyChain', () => {
      const bundle = initializeStrategy({
        config: makeGridConfig({ strategyChain: [{ strategy: 'grid', on: 'always' }] }),
        price: 2000,
        botId: 'grid-1',
        placeOrder: vi.fn().mockResolvedValue({ id: 'o1', status: 'filled' }),
        onTrade: vi.fn(),
        onLog: vi.fn(),
      });

      expect(bundle.strategy).toBeDefined();
      expect(bundle.strategyChain).toBeInstanceOf(Array);
      expect(bundle.strategyChain?.length).toBe(1);
    });

    it('creates mean reversion strategy', () => {
      const bundle = initializeStrategy({
        config: makeMeanRevConfig(),
        price: 120,
        botId: 'mr-1',
        placeOrder: vi.fn().mockResolvedValue({ id: 'o2', status: 'filled' }),
        onTrade: vi.fn(),
        onLog: vi.fn(),
      });

      expect(bundle.strategy).toBeDefined();
      expect(bundle.strategyChain).toBeNull();
    });

    it('throws for unknown strategy', () => {
      expect(() =>
        initializeStrategy({
          config: { ...makeGridConfig(), strategy: 'unknown' as GridBotConfig['strategy'] },
          price: 100,
          botId: 'bad',
          placeOrder: vi.fn(),
          onTrade: vi.fn(),
          onLog: vi.fn(),
        }),
      ).toThrow(/Unknown strategy/);
    });
  });

  describe('evaluateChain', () => {
    it('returns order request when chain emits signal', () => {
      const chain = makeChain([{ side: 'buy', qty: 2 }]);

      const order = evaluateChain({
        config: makeGridConfig({ symbol: 'BTC/USDT', capital: 1200 }),
        price: 100,
        totalPnl: 50,
        totalTrades: 10,
        winCount: 4,
        lossCount: 3,
        strategyChain: chain,
      });

      expect(order).toEqual({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 2,
      });
    });

    it('returns null when chain produces no signals', () => {
      const chain = makeChain([null, null]);

      const order = evaluateChain({
        config: makeGridConfig(),
        price: 100,
        totalPnl: 0,
        totalTrades: 0,
        winCount: 0,
        lossCount: 0,
        strategyChain: chain,
      });

      expect(order).toBeNull();
    });

    it('builds context with balance = capital + totalPnl', () => {
      const node = { strategy: { name: 'spy', evaluate: vi.fn() }, fallback: null };

      evaluateChain({
        config: makeGridConfig({ capital: 1000 }),
        price: 50,
        totalPnl: 250,
        totalTrades: 10,
        winCount: 6,
        lossCount: 3,
        strategyChain: [node],
      });

      expect(node.strategy.evaluate).toHaveBeenCalledWith({
        symbol: makeGridConfig().symbol,
        balance: 1250,
        openPositions: 1,
        lastPrice: 50,
      });
    });
  });
});
