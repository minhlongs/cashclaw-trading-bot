import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeanRevStrategy } from './mean-reversion';
import type { MeanRevBotConfig } from '../types';
import type { Ticker, OrderResult } from '../../exchange/types';

const mkTicker = (last: number): Ticker => ({
  symbol: 'BTC/USDT', last, bid: last - 10, ask: last + 10,
  high24h: last + 2000, low24h: last - 2000, volume24h: 2000, timestamp: Date.now(),
});

const baseConfig: MeanRevBotConfig = {
  symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 10000,
  strategy: 'mean_reversion', maxDrawdownPct: 10,
  bbPeriod: 10, bbStdDev: 2, rsiPeriod: 7,
  rsiBuyThreshold: 30, rsiSellThreshold: 70,
  volumeMultiplier: 1.0, positionSizePct: 20, cooldownMinutes: 0,
};

const okResult: OrderResult = {
  id: 'ord-1', exchangeId: 'binance', symbol: 'BTC/USDT', side: 'buy',
  type: 'market', price: 50000, quantity: 0.1, filled: 0.1,
  status: 'filled', fee: 0.01, timestamp: Date.now(),
};

/** Wait for microtasks/macrotasks to drain (exitLong/enterLong run async) */
const flush = () => new Promise<void>((r) => { setTimeout(r, 10); });

describe('MeanRevStrategy', () => {
  let placeOrder: ReturnType<typeof vi.fn>;
  let onTrade: ReturnType<typeof vi.fn>;
  let onLog: ReturnType<typeof vi.fn>;

  beforeEach(() => { placeOrder = vi.fn().mockResolvedValue(okResult); onTrade = vi.fn(); onLog = vi.fn(); });

  const make = (o: Partial<MeanRevBotConfig> = {}) =>
    new MeanRevStrategy({ ...baseConfig, ...o }, { placeOrder, onTrade, onLog });

  /** Feed 9 stable prices then 1 crash → triggers BB lower + RSI oversold */
  const enterSignal = async (s: MeanRevStrategy) => {
    for (let i = 0; i < 9; i++) await s.onTicker(mkTicker(50000));
    await s.onTicker(mkTicker(48000));
    await flush();
  };

  /** Feed 7 rising prices at +500 → RSI hits 100 → overbought → exit */
  const exitSignal = async (s: MeanRevStrategy) => {
    for (let i = 1; i <= 7; i++) await s.onTicker(mkTicker(48000 + i * 500));
    await flush();
  };

  describe('initialization', () => {
    it('creates instance', () => { expect(make()).toBeDefined(); });
    it('getConfig returns config', () => { expect(make({ symbol: 'ETH/USDT' }).getConfig().symbol).toBe('ETH/USDT'); });
    it('getPosition returns none initially', () => { expect(make().getPosition()).toBe('none'); });
    it('tradeCount is 0 initially', () => { expect(make().tradeCount).toBe(0); });
  });

  describe('start / stop', () => {
    it('start logs start message', () => { make().start(50000); expect(onLog).toHaveBeenCalledWith(expect.stringContaining('started')); });
    it('stop prevents further trading', async () => {
      const s = make(); s.start(50000); s.stop();
      await s.onTicker(mkTicker(40000)); await flush();
      expect(placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('onTicker — no signal yet', () => {
    it('accumulates prices without triggering signal', async () => {
      const s = make(); s.start(50000);
      for (let i = 0; i < 5; i++) await s.onTicker(mkTicker(50000 + i * 50));
      expect(placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('onTicker — entry signal (oversold)', () => {
    it('enters long when price drops below BB lower + RSI oversold', async () => {
      const s = make(); s.start(50000);
      await enterSignal(s);
      expect(placeOrder).toHaveBeenCalledWith(expect.objectContaining({ side: 'buy' }));
      expect(s.getPosition()).toBe('long');
    });
    it('does not enter when not oversold', async () => {
      const s = make(); s.start(50000);
      for (let i = 0; i < 12; i++) await s.onTicker(mkTicker(50000 + i * 10));
      expect(placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('onTicker — exit signal (overbought)', () => {
    it('exits long when RSI becomes overbought', async () => {
      const s = make(); s.start(50000);
      await enterSignal(s);
      expect(s.getPosition()).toBe('long');
      await exitSignal(s);
      // placeOrder should have been called with 'sell'
      const sellCalls = placeOrder.mock.calls.filter((c: Record<string, unknown>[]) => c[0]?.side === 'sell');
      expect(sellCalls.length).toBeGreaterThanOrEqual(1);
      expect(s.getPosition()).toBe('none');
    });
  });

  describe('onTicker — cooldown', () => {
    it('blocks all signals during cooldown (including exit)', async () => {
      const s = make({ cooldownMinutes: 60 });
      s.start(50000);
      await enterSignal(s);
      expect(s.getPosition()).toBe('long');
      placeOrder.mockClear();
      // Try exit signal — blocked by cooldown
      await exitSignal(s);
      const sellCalls = placeOrder.mock.calls.filter((c: Record<string, unknown>[]) => c[0]?.side === 'sell');
      expect(sellCalls).toHaveLength(0);
      expect(s.getPosition()).toBe('long');
    });
  });

  describe('onTicker — error handling', () => {
    it('logs entry error when placeOrder throws', async () => {
      placeOrder.mockRejectedValueOnce(new Error('exchange down'));
      const s = make(); s.start(50000);
      await enterSignal(s);
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('entry failed'));
    });
    it('logs unknown error for non-Error throw', async () => {
      placeOrder.mockRejectedValueOnce('string err');
      const s = make(); s.start(50000);
      await enterSignal(s);
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('unknown'));
    });
    it('logs exit error when sell order fails', async () => {
      const s = make(); s.start(50000);
      await enterSignal(s);
      // First sell order fails, entry was buy
      placeOrder.mockRejectedValueOnce(new Error('network'));
      await exitSignal(s);
      expect(onLog).toHaveBeenCalledWith(expect.stringContaining('exit failed'));
    });
  });
});
