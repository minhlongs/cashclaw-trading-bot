import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeanRevStrategy } from './mean-reversion';
import type { MeanRevBotConfig } from '../types';
import type { Ticker, OrderResult } from '../../exchange/types';

const mkTicker = (last: number, overrides?: Partial<Ticker>): Ticker => ({
  symbol: 'BTC/USDT', last, bid: last - 10, ask: last + 10,
  high24h: last + 2000, low24h: last - 2000, volume24h: 2000, timestamp: Date.now(),
  ...overrides,
});

const baseConfig: MeanRevBotConfig = {
  symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', capital: 10000,
  strategy: 'mean_reversion', maxDrawdownPct: 10,
  bbPeriod: 5, bbStdDev: 2, rsiPeriod: 5,
  rsiBuyThreshold: 30, rsiSellThreshold: 70,
  volumeMultiplier: 1.0, positionSizePct: 20, cooldownMinutes: 0,
};

const okBuy: OrderResult = {
  id: 'buy-1', exchangeId: 'binance', symbol: 'BTC/USDT', side: 'buy',
  type: 'limit', price: 47500, quantity: 0.04, filled: 0.04,
  status: 'filled', fee: 0.01, timestamp: Date.now(),
};

/** Flush microtasks so fire-and-forget async state updates are applied. */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

describe('MeanRevStrategy — extended coverage', () => {
  let placeOrder: ReturnType<typeof vi.fn>;
  let onLog: ReturnType<typeof vi.fn>;
  let onTrade: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    placeOrder = vi.fn().mockResolvedValue(okBuy);
    onLog = vi.fn();
    onTrade = vi.fn();
  });

  const make = (overrides?: Partial<MeanRevBotConfig>) =>
    new MeanRevStrategy({ ...baseConfig, ...overrides }, { placeOrder, onTrade, onLog });

  /**
   * 8 flat ticks at 50000 then drop to 47500 → oversold entry fires.
   * Each onTicker followed by tick() to flush enterLong microtask.
   */
  const feedEntry = async (s: MeanRevStrategy) => {
    s.start(50000);
    for (let i = 0; i < 8; i++) {
      s.onTicker(mkTicker(50000));
      await tick();
    }
    s.onTicker(mkTicker(47500));
    await tick();
  };

  /**
   * After entry (position='long'), feeds 5 rising ticks.
   * At 52500: RSI=100 (overbought) → exitLong fires.
   */
  const feedExit = async (s: MeanRevStrategy) => {
    for (let i = 1; i <= 5; i++) {
      s.onTicker(mkTicker(47500 + i * 1000));
      await tick();
    }
  };
  it('getPosition returns current state', async () => {
    const s = make();
    expect(s.getPosition()).toBe('none');
    await feedEntry(s);
    expect(s.getPosition()).toBe('long');
  });

  it('getConfig returns a shallow copy', () => {
    const s = make();
    const c1 = s.getConfig();
    const c2 = s.getConfig();
    expect(c1).toEqual(c2);
    expect(c1).not.toBe(c2);
  });

  it('tradeCount is 0 initially, increments on entry', async () => {
    const s = make();
    expect(s.tradeCount).toBe(0);
    await feedEntry(s);
    expect(s.tradeCount).toBe(1);
  });

  it('stop() prevents further processing', () => {
    const s = make();
    s.start(50000);
    s.stop();
    onLog.mockClear();
    s.onTicker(mkTicker(49000));
    expect(onLog).not.toHaveBeenCalled();
  });

  it('onTicker ignores price <= 0', () => {
    const s = make();
    s.start(50000);
    onLog.mockClear();
    s.onTicker(mkTicker(0));
    expect(onLog).not.toHaveBeenCalled();
  });

  it('rolling window slices when data exceeds maxLen', async () => {
    const s = make({ bbPeriod: 5, rsiPeriod: 5 });
    s.start(50000);
    for (let i = 0; i < 70; i++) {
      s.onTicker(mkTicker(50000 + i * 10));
      await tick();
    }
    expect(s.getPosition()).toBe('none');
  });

  it('entry skipped when volume check fails (volumeMultiplier=3)', async () => {
    const s = make({ volumeMultiplier: 3.0 });
    await feedEntry(s);
    expect(s.getPosition()).toBe('none');
  });

  it('entry skipped when position already long', async () => {
    const s = make();
    await feedEntry(s);
    expect(s.getPosition()).toBe('long');
    const countBefore = placeOrder.mock.calls.length;
    s.onTicker(mkTicker(47000));
    await tick();
    expect(placeOrder.mock.calls.length).toBe(countBefore);
  });

  it('exit via RSI overbought: sells, logs PnL, resets position', async () => {
    const s = make();
    await feedEntry(s);
    await feedExit(s);
    expect(placeOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({ side: 'sell' }),
    );
    expect(onLog).toHaveBeenCalledWith(
      expect.stringContaining('LONG exit'),
    );
    expect(s.getPosition()).toBe('none');
  });

  it('cooldown blocks re-entry after recent trade', async () => {
    const s = make({ cooldownMinutes: 60 });
    await feedEntry(s);
    expect(s.getPosition()).toBe('long');
    const countBefore = placeOrder.mock.calls.length;
    s.onTicker(mkTicker(47000));
    await tick();
    expect(placeOrder.mock.calls.length).toBe(countBefore);
  });

  it('no entry when signal conditions not met', async () => {
    const s = make();
    s.start(50000);
    for (let i = 0; i < 15; i++) {
      s.onTicker(mkTicker(55000 + i * 500));
      await tick();
    }
    expect(s.getPosition()).toBe('none');
    const s2 = make();
    s2.start(60000);
    for (let i = 0; i < 15; i++) {
      s2.onTicker(mkTicker(58000));
      await tick();
    }
    expect(s2.getPosition()).toBe('none');
  });
  it('exitLong error: position stays long', async () => {
    const s = make();
    await feedEntry(s);
    expect(s.getPosition()).toBe('long');
    // Entry consumed default mock; set rejection for exit call
    placeOrder.mockRejectedValueOnce(new Error('network'));
    s.onTicker(mkTicker(52500));
    await tick();
    expect(s.getPosition()).toBe('long');
  });

  it('enterLong error: position stays none and logs error', async () => {
    placeOrder.mockRejectedValueOnce(new Error('exchange down'));
    const s = make();
    await feedEntry(s);
    expect(s.getPosition()).toBe('none');
    expect(onLog).toHaveBeenCalledWith(
      expect.stringContaining('entry failed'),
    );
  });
  it('high24h=0 skip highs/lows push', async () => {
    const s = make();
    s.start(50000);
    s.onTicker(mkTicker(50000, { high24h: 0, low24h: 0, volume24h: 0 }));
    await tick();
    expect(s.getPosition()).toBe('none');
  });
});
