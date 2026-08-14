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

/** Flush microtasks so async fire-and-forget state updates are applied. */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

describe('GridStrategy — extended coverage', () => {
  let placeOrder: ReturnType<typeof vi.fn>;
  let onLog: ReturnType<typeof vi.fn>;
  let onTrade: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    placeOrder = vi.fn().mockResolvedValue(okResult);
    onLog = vi.fn();
    onTrade = vi.fn();
  });

  const make = (overrides?: Partial<GridBotConfig>) =>
    new GridStrategy({ ...baseConfig, ...overrides }, { placeOrder, onTrade, onLog });

  it('getConfig returns a shallow copy (mutation-safe)', () => {
    const s = make();
    s.start(50000);
    const cfg1 = s.getConfig();
    const cfg2 = s.getConfig();
    expect(cfg1).toEqual(cfg2);
    expect(cfg1).not.toBe(cfg2);
  });

  it('getLevels returns a copy (mutation-safe)', () => {
    const s = make();
    s.start(50000);
    const lvls1 = s.getLevels();
    const lvls2 = s.getLevels();
    expect(lvls1).not.toBe(lvls2);
    expect(lvls1).toEqual(lvls2);
  });

  it('closeLevel via stop-loss trailing exit', async () => {
    const s = make({ gridLevels: 6, gridSpacingPct: 1, stopLossPct: 1 });
    s.start(50000);
    onLog.mockClear();
    const buyLvl = s.getLevels().find(l => l.side === 'buy');
    expect(buyLvl).toBeDefined();
    // Tick 1: fill the buy level
    s.onTicker(mkTicker(buyLvl!.triggerPrice));
    await tick();
    // Tick 2: trailing init + skipExit consumed
    s.onTicker(mkTicker(buyLvl!.triggerPrice));
    await tick();
    // Tick 3: skipExit cleared
    s.onTicker(mkTicker(buyLvl!.triggerPrice));
    await tick();
    // Tick 4: price below trailing SL → closeLevel fires
    const stopPrice = buyLvl!.triggerPrice * 0.95;
    s.onTicker(mkTicker(stopPrice));
    await tick();
    expect(onLog).toHaveBeenCalledWith(
      expect.stringContaining('closed'),
    );
  });

  it('fillLevel stores orderId and sets status to filled on success', async () => {
    placeOrder.mockResolvedValue({ ...okResult, id: 'ord-xyz', side: 'buy' });
    const s = make();
    s.start(50000);
    const lvl = s.getLevels().find(l => l.side === 'buy');
    expect(lvl).toBeDefined();
    s.onTicker(mkTicker(lvl!.triggerPrice));
    await tick();
    expect(lvl!.orderId).toBe('ord-xyz');
    expect(lvl!.status).toBe('filled');
  });

  it('rebalanceOnFill=true: rebalances after fill moves price outside range', async () => {
    const s = make({ rebalanceOnFill: true });
    s.start(50000);
    onLog.mockClear();
    const buyLvl = s.getLevels().find(l => l.side === 'buy');
    expect(buyLvl).toBeDefined();
    // Tick 1: fill the buy level
    s.onTicker(mkTicker(buyLvl!.triggerPrice));
    await tick();
    onLog.mockClear();
    // Tick 2: price far below range → triggers rebalance
    const rangeLow = s.getLevels().reduce(
      (min, l) => Math.min(min, l.triggerPrice), Infinity,
    );
    s.onTicker(mkTicker(rangeLow * 0.8));
    await tick();
    expect(onLog).toHaveBeenCalledWith(
      expect.stringContaining('Rebalance'),
    );
  });

  it('rebalanceOnFill=false: no rebalance when price outside range', async () => {
    const s = make({ rebalanceOnFill: false, gridLevels: 6, gridSpacingPct: 1 });
    s.start(50000);
    onLog.mockClear();
    const rangeLow = s.getLevels().reduce(
      (min, l) => Math.min(min, l.triggerPrice), Infinity,
    );
    s.onTicker(mkTicker(rangeLow * 0.8));
    await tick();
    expect(onLog).not.toHaveBeenCalledWith(
      expect.stringContaining('Rebalance'),
    );
  });

  it('multiple buy levels fill when price drops through all triggers', async () => {
    const s = make();
    s.start(50000);
    const buyLevels = s.getLevels().filter(l => l.side === 'buy');
    expect(buyLevels.length).toBeGreaterThanOrEqual(2);
    const lowestTrigger = Math.min(...buyLevels.map(l => l.triggerPrice));
    s.onTicker(mkTicker(lowestTrigger));
    await tick();
    const filled = s.getLevels().filter(
      l => l.side === 'buy' && l.status === 'filled',
    );
    expect(filled.length).toBeGreaterThanOrEqual(1);
  });

  it('onTicker ignores ticks after stop()', () => {
    const s = make();
    s.start(50000);
    s.stop();
    onLog.mockClear();
    s.onTicker(mkTicker(49000));
    expect(onLog).not.toHaveBeenCalled();
  });

  it('levelCount is 0 before start', () => {
    const s = make();
    expect(s.levelCount).toBe(0);
  });

  it('getDeployedCapital sums pending level capital', async () => {
    const s = make();
    s.start(50000);
    const lvl = s.getLevels().find(l => l.side === 'buy');
    expect(lvl).toBeDefined();
    s.onTicker(mkTicker(lvl!.triggerPrice));
    await tick();
    expect(s.getDeployedCapital()).toBeGreaterThan(0);
  });

  it('getReinvestableProfit starts at 0', () => {
    const s = make();
    s.start(50000);
    expect(s.getReinvestableProfit()).toBe(0);
  });
});
