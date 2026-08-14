import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GridStrategy } from './grid';
import type { GridBotConfig } from '../types';
import type { Ticker, OrderResult } from '../../exchange/types';

const mkTicker = (last: number): Ticker => ({
  symbol: 'BTC/USDT', last, bid: last - 10, ask: last + 10,
  high24h: last + 2000, low24h: last - 2000, volume24h: 1000, timestamp: Date.now(),
});

const baseConfig: GridBotConfig = {
  symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 10000,
  maxDrawdownPct: 10, strategy: 'grid', gridSpacingPct: 2, gridLevels: 6,
  capitalPerLevelPct: 10, takeProfitPct: 3, stopLossPct: 5, rebalanceOnFill: false,
};

const okResult: OrderResult = {
  id: 'ord-1', exchangeId: 'binance', symbol: 'BTC/USDT', side: 'buy',
  type: 'limit', price: 50000, quantity: 0.002, filled: 0.002,
  status: 'filled', fee: 0.01, timestamp: Date.now(),
};

describe('GridStrategy', () => {
  let placeOrder: ReturnType<typeof vi.fn>;
  let onLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    placeOrder = vi.fn().mockResolvedValue(okResult);
    onLog = vi.fn();
  });

  const make = (o: Partial<GridBotConfig> = {}) =>
    new GridStrategy({ ...baseConfig, ...o }, { placeOrder, onTrade: vi.fn(), onLog });

  describe('initialisation', () => {
    it('does not throw', () => expect(() => make()).not.toThrow());
    it('returns empty levels before start', () => expect(make().getLevels()).toEqual([]));
    it('returns config', () => expect(make({ symbol: 'ETH/USDT' }).getConfig().symbol).toBe('ETH/USDT'));
  });

  describe('start / stop', () => {
    it('creates pending grid levels', () => {
      const s = make(); s.start(50000);
      expect(s.getLevels()).toHaveLength(6);
      expect(s.getLevels().every(l => l.status === 'pending')).toBe(true);
    });
    it('logs start message', () => { make().start(50000); expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Grid started')); });
    it('stop halts processing', () => { const s = make(); s.start(50000); s.stop(); s.onTicker(mkTicker(50000)); expect(placeOrder).not.toHaveBeenCalled(); });
  });

  describe('onTicker — order placement', () => {
    it('places buy order when price reaches a buy level', async () => {
      const s = make(); s.start(50000);
      const lvl = s.getLevels().find(l => l.side === 'buy');
      if (lvl) { await s.onTicker(mkTicker(lvl.triggerPrice)); expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ side: 'buy' })); }
    });
    it('places sell order when price reaches a sell level', async () => {
      const s = make(); s.start(50000);
      const lvl = s.getLevels().find(l => l.side === 'sell');
      if (lvl) { await s.onTicker(mkTicker(lvl.triggerPrice)); expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ side: 'sell' })); }
    });
    it('skips levels already open or filled', async () => {
      const s = make(); s.start(50000);
      const lvl = s.getLevels().find(l => l.side === 'buy');
      if (lvl) {
        await s.onTicker(mkTicker(lvl.triggerPrice));
        placeOrder.mockClear();
        await s.onTicker(mkTicker(lvl.triggerPrice));
        expect(placeOrder).not.toHaveBeenCalled();
      }
    });
    it('does nothing when price is 0', () => { const s = make(); s.start(50000); placeOrder.mockClear(); s.onTicker(mkTicker(0)); expect(placeOrder).not.toHaveBeenCalled(); });
  });

  describe('onTicker — trailing exits', () => {
    const seed = async (s: GridStrategy, side: 'buy' | 'sell', fp: number, sp: number, ap: number) => {
      const lvl = s.getLevels().find(l => l.side === side);
      if (lvl) { lvl.status = 'filled'; lvl.filledPrice = fp; }
      await s.onTicker(mkTicker(sp));
      await s.onTicker(mkTicker(ap));
      return lvl;
    };
    it('triggers take-profit on buy level', async () => {
      const s = make(); s.start(50000);
      if (!await seed(s, 'buy', 49000, 49500, 49800)) return;
      await s.onTicker(mkTicker(50500)); expect(s.getLevels().filter(l => l.status === 'cancelled').length).toBeGreaterThan(0);
    });
    it('triggers stop-loss on buy level', async () => {
      const s = make(); s.start(50000);
      if (!await seed(s, 'buy', 49000, 49500, 49200)) return;
      await s.onTicker(mkTicker(44000)); expect(s.getLevels().filter(l => l.status === 'cancelled').length).toBeGreaterThan(0);
    });
    it('triggers take-profit on sell level', async () => {
      const s = make(); s.start(50000);
      if (!await seed(s, 'sell', 51000, 50500, 50800)) return;
      await s.onTicker(mkTicker(49400)); expect(s.getLevels().filter(l => l.status === 'cancelled').length).toBeGreaterThan(0);
    });
    it('triggers stop-loss on sell level', async () => {
      const s = make(); s.start(50000);
      if (!await seed(s, 'sell', 51000, 50500, 50200)) return;
      await s.onTicker(mkTicker(56200)); expect(s.getLevels().filter(l => l.status === 'cancelled').length).toBeGreaterThan(0);
    });
  });

  describe('onOrderFilled', () => {
    it('marks matching level as filled', () => {
      const s = make(); s.start(50000);
      const lvl = s.getLevels().find(l => l.side === 'buy');
      if (lvl) { lvl.orderId = 'ord-123'; s.onOrderFilled('ord-123'); expect(lvl.status).toBe('filled'); }
    });
    it('does nothing when orderId does not match', () => {
      const s = make(); s.start(50000);
      const levels = s.getLevels(); levels.forEach(l => { l.status = 'open'; l.orderId = 'ord-real'; });
      s.onOrderFilled('ord-nonexistent'); expect(levels.every(l => l.status === 'open')).toBe(true);
    });
  });

  describe('onTicker — rebalance', () => {
    it('rebalances when price exceeds upper range', async () => {
      const s = make({ rebalanceOnFill: true }); s.start(50000);
      await s.onTicker(mkTicker(54000)); expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Rebalance'));
    });
    it('rebalances when price drops below lower range', async () => {
      const s = make({ rebalanceOnFill: true }); s.start(50000);
      await s.onTicker(mkTicker(46000)); expect(onLog).toHaveBeenCalledWith(expect.stringContaining('Rebalance'));
    });
    it('does not rebalance within range', async () => {
      const s = make({ rebalanceOnFill: true }); s.start(50000);
      await s.onTicker(mkTicker(50000)); expect(onLog).not.toHaveBeenCalledWith(expect.stringContaining('Rebalance'));
    });
    it('does not rebalance when rebalanceOnFill is false', async () => {
      const s = make({ rebalanceOnFill: false }); s.start(50000);
      await s.onTicker(mkTicker(54000)); expect(onLog).not.toHaveBeenCalledWith(expect.stringContaining('Rebalance'));
    });
  });

  describe('metrics', () => {
    it('getDeployedCapital returns 0 before start', () => expect(make().getDeployedCapital()).toBe(0));
    it('getDeployedCapital computes for open/filled levels', () => {
      const s = make(); s.start(50000);
      s.getLevels().slice(0, 3).forEach(l => { l.status = 'open'; });
      expect(s.getDeployedCapital()).toBeGreaterThan(0);
    });
    it('getReinvestableProfit returns 0 initially', () => expect(make().getReinvestableProfit()).toBe(0));
  });

  describe('error handling', () => {
    it('logs error message when placeOrder throws an Error', async () => {
      placeOrder.mockRejectedValue(new Error('exchange down'));
      const s = make(); s.start(50000);
      const lvl = s.getLevels().find(l => l.side === 'buy');
      if (lvl) await s.onTicker(mkTicker(lvl.triggerPrice));
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('failed'));
    });
    it('logs unknown when placeOrder throws a non-Error', async () => {
      placeOrder.mockRejectedValue('string error');
      const s = make(); s.start(50000);
      const lvl = s.getLevels().find(l => l.side === 'buy');
      if (lvl) await s.onTicker(mkTicker(lvl.triggerPrice));
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('unknown'));
    });
  });
});
