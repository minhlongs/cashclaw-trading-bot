import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GridStrategy } from './grid';
import type { GridBotConfig } from '../types';
import type { Ticker, OrderResult } from '../../exchange/types';

function makeTicker(overrides: Partial<Ticker> = {}): Ticker {
  return {
    symbol: 'BTC/USDT',
    last: 50000,
    bid: 49990,
    ask: 50010,
    high24h: 52000,
    low24h: 48000,
    volume24h: 1000,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<GridBotConfig> = {}): GridBotConfig {
  return {
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    capital: 1000,
    gridSpacingPct: 2,
    gridLevels: 6,
    takeProfitPct: 2,
    stopLossPct: 5,
    mode: 'paper',
    ...overrides,
  };
}

function makeOrderResult(overrides: Partial<OrderResult> = {}): OrderResult {
  return {
    id: 'order-1',
    exchangeId: 'binance',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'limit',
    price: 50000,
    quantity: 0.001,
    filled: 0.001,
    status: 'filled',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('GridStrategy', () => {
  let placeOrder: ReturnType<typeof vi.fn>;
  let onLog: ReturnType<typeof vi.fn>;
  let onTrade: ReturnType<typeof vi.fn>;
  let strategy: GridStrategy;

  beforeEach(() => {
    placeOrder = vi.fn().mockResolvedValue(makeOrderResult());
    onLog = vi.fn();
    onTrade = vi.fn();
  });

  function createStrategy(configOverrides: Partial<GridBotConfig> = {}) {
    const config = makeConfig(configOverrides);
    strategy = new GridStrategy(config, {
      placeOrder,
      onLog,
      onTrade,
    });
    return strategy;
  }

  describe('initialization', () => {
    it('starts with no levels before start()', () => {
      createStrategy();
      expect(strategy.getLevels()).toHaveLength(0);
      expect(strategy.levelCount).toBe(0);
    });

    it('creates grid levels after start()', () => {
      createStrategy({ gridLevels: 6, gridSpacingPct: 2 });
      strategy.start(50000);

      expect(strategy.levelCount).toBe(6);
      expect(strategy.getLevels()).toHaveLength(6);
    });

    it('distributes buy and sell levels', () => {
      createStrategy({ gridLevels: 6 });
      strategy.start(50000);
      const levels = strategy.getLevels();
      const buys = levels.filter(l => l.side === 'buy');
      const sells = levels.filter(l => l.side === 'sell');

      expect(buys.length).toBeGreaterThan(0);
      expect(sells.length).toBeGreaterThan(0);
    });

    it('buy levels have lower price than sell levels', () => {
      createStrategy({ gridLevels: 6 });
      strategy.start(50000);
      const levels = strategy.getLevels();
      const buys = levels.filter(l => l.side === 'buy');
      const sells = levels.filter(l => l.side === 'sell');

      const maxBuy = Math.max(...buys.map(l => l.triggerPrice));
      const minSell = Math.min(...sells.map(l => l.triggerPrice));

      expect(maxBuy).toBeLessThan(minSell);
    });

    it('logs grid start message', () => {
      createStrategy({ gridLevels: 4 });
      strategy.start(50000);

      expect(onLog).toHaveBeenCalledWith(
        expect.stringContaining('Grid started'),
      );
    });
  });

  describe('onTicker', () => {
    it('does nothing when not started', () => {
      createStrategy({ gridLevels: 4 });
      // Don't call start()
      strategy.onTicker(makeTicker({ last: 50000 }));

      expect(placeOrder).not.toHaveBeenCalled();
    });

    it('does nothing when price is 0', () => {
      createStrategy({ gridLevels: 4 });
      strategy.start(50000);
      strategy.onTicker(makeTicker({ last: 0 }));

      expect(placeOrder).not.toHaveBeenCalled();
    });

    it('places buy order when price drops to buy level', () => {
      createStrategy({ gridSpacingPct: 2, gridLevels: 6 });
      strategy.start(50000);
      const levels = strategy.getLevels();
      const buyLevel = levels.find(l => l.side === 'buy');
      if (!buyLevel) return;

      strategy.onTicker(makeTicker({ last: buyLevel.triggerPrice }));

      expect(placeOrder).toHaveBeenCalled();
    });

    it('places sell order when price rises to sell level', () => {
      createStrategy({ gridSpacingPct: 2, gridLevels: 6 });
      strategy.start(50000);
      const levels = strategy.getLevels();
      const sellLevel = levels.find(l => l.side === 'sell');
      if (!sellLevel) return;

      strategy.onTicker(makeTicker({ last: sellLevel.triggerPrice }));

      expect(placeOrder).toHaveBeenCalled();
    });

    it('skips already-filled levels', () => {
      createStrategy({ gridSpacingPct: 2, gridLevels: 6 });
      strategy.start(50000);
      const levels = strategy.getLevels();
      const buyLevel = levels.find(l => l.side === 'buy');
      if (!buyLevel) return;

      strategy.onTicker(makeTicker({ last: buyLevel.triggerPrice }));
      expect(placeOrder).toHaveBeenCalledTimes(1);

      placeOrder.mockClear();
      strategy.onTicker(makeTicker({ last: buyLevel.triggerPrice }));
      expect(placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('stops processing ticks', () => {
      createStrategy({ gridSpacingPct: 2, gridLevels: 6 });
      strategy.start(50000);
      strategy.stop();

      const levels = strategy.getLevels();
      const buyLevel = levels.find(l => l.side === 'buy');
      if (!buyLevel) return;

      strategy.onTicker(makeTicker({ last: buyLevel.triggerPrice }));
      expect(placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('onOrderFilled', () => {
    it('marks level as filled by orderId', () => {
      createStrategy({ gridSpacingPct: 2, gridLevels: 6 });
      strategy.start(50000);

      // Manually assign an orderId to a pending level
      const levels = strategy.getLevels();
      const buyLevel = levels.find(l => l.side === 'buy');
      if (!buyLevel) return;

      buyLevel.orderId = 'test-order-123';
      strategy.onOrderFilled('test-order-123');

      const updatedLevels = strategy.getLevels();
      const filledLevel = updatedLevels.find(l => l.orderId === 'test-order-123');
      expect(filledLevel?.status).toBe('filled');
    });

    it('ignores unknown orderId', () => {
      createStrategy({ gridSpacingPct: 2, gridLevels: 6 });
      strategy.start(50000);

      strategy.onOrderFilled('nonexistent-order');

      const levels = strategy.getLevels();
      const allPending = levels.every(l => l.status === 'pending');
      expect(allPending).toBe(true);
    });
  });

  describe('metrics', () => {
    it('reports deployed capital correctly', () => {
      createStrategy({ gridLevels: 6, gridSpacingPct: 2 });
      strategy.start(50000);
      const deployed = strategy.getDeployedCapital();

      expect(deployed).toBeGreaterThanOrEqual(0);
    });

    it('reports reinvestable profit as zero initially', () => {
      createStrategy();
      expect(strategy.getReinvestableProfit()).toBe(0);
    });

    it('returns config', () => {
      const config = makeConfig({ gridLevels: 8 });
      createStrategy({ gridLevels: 8 });
      expect(strategy.getConfig()).toEqual(config);
    });
  });

  describe('error handling', () => {
    it('logs error when order placement fails', async () => {
      placeOrder.mockRejectedValue(new Error('exchange down'));
      createStrategy({ gridSpacingPct: 2, gridLevels: 6 });
      strategy.start(50000);

      const levels = strategy.getLevels();
      const buyLevel = levels.find(l => l.side === 'buy');
      if (buyLevel) {
        await strategy.onTicker(makeTicker({ last: buyLevel.triggerPrice }));
        expect(onLog).toHaveBeenCalledWith(
          expect.stringContaining('failed'),
        );
      }
    });
  });
});
