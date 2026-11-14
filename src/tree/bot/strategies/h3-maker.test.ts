import { describe, it, expect, vi } from 'vitest';
import { H3MakerStrategy } from './h3-maker';
import type { H3MakerBotConfig } from '../types';
import type { Ticker } from '../../exchange/types';

function makeConfig(overrides: Partial<H3MakerBotConfig> = {}): H3MakerBotConfig {
  return {
    name: 'H3 Bot',
    symbol: 'BTC/USDT',
    exchange: 'binance',
    mode: 'paper',
    capital: 1000,
    maxDrawdownPct: 12,
    strategy: 'h3_maker',
    lookbackDays: 3,
    entryAnnualBps: 800,
    exitAnnualBps: 150,
    maxGrossLeverage: 1.0,
    ...overrides,
  };
}

function makeTicker(last: number, bid = last - 1, ask = last + 1): Ticker {
  return {
    symbol: 'BTC/USDT',
    last,
    bid,
    ask,
    high24h: last + 50,
    low24h: last - 50,
    volume24h: 1000,
    timestamp: Date.now(),
  };
}

describe('H3MakerStrategy', () => {
  it('enforces PAPER_ONLY mode and positive initial price on start', () => {
    const onLog = vi.fn();
    const liveStrat = new H3MakerStrategy(makeConfig({ mode: 'live' }), { onLog });
    expect(() => liveStrat.start(50000)).toThrow(/PAPER_ONLY/);

    const paperStrat = new H3MakerStrategy(makeConfig(), { onLog });
    expect(() => paperStrat.start(0)).toThrow(/Invalid initial price/);
    expect(() => paperStrat.start(Number.NaN)).toThrow(/Invalid initial price/);

    paperStrat.start(50000);
    expect(paperStrat.isRunning()).toBe(true);
    expect(paperStrat.getPositionSide()).toBe('flat');
    expect(paperStrat.getConfig().strategy).toBe('h3_maker');
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('H3_MAKER started'));

    paperStrat.stop();
    expect(paperStrat.isRunning()).toBe(false);
    expect(onLog).toHaveBeenCalledWith('H3_MAKER stopped');
  });

  it('ignores invalid tickers and stopped state', () => {
    const onLog = vi.fn();
    const placeOrder = vi.fn();
    const strat = new H3MakerStrategy(makeConfig(), { onLog, placeOrder });
    strat.onTicker(makeTicker(51000));
    expect(placeOrder).not.toHaveBeenCalled();

    strat.start(50000);
    strat.onTicker(makeTicker(0));
    strat.onTicker(makeTicker(-10));
    strat.onTicker(makeTicker(Number.NaN));
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('enters long on high annualized carry and exits on compression via placeOrder', async () => {
    const onLog = vi.fn();
    const onTrade = vi.fn();
    const placeOrder = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'ord-buy-1',
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        price: 50090,
        quantity: 0.02,
        filled: 0.02,
        status: 'filled',
        fee: 0.5,
        timestamp: Date.now(),
      })
      .mockResolvedValueOnce({
        id: 'ord-sell-1',
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'sell',
        type: 'limit',
        price: 50095,
        quantity: 0.02,
        filled: 0.02,
        status: 'filled',
        fee: 0.5,
        timestamp: Date.now(),
      });

    const strat = new H3MakerStrategy(
      makeConfig({ name: undefined, maxGrossLeverage: 2.0 }),
      { onLog, onTrade, placeOrder },
    );
    strat.start(50000);

    // +0.2% over 1 step => +730% annualized (> 800 bps) => triggers passive maker buy
    strat.onTicker(makeTicker(50100, 50090, 50110));
    await vi.waitFor(() => expect(strat.getPositionSide()).toBe('long'));
    expect(strat.getEntryPrice()).toBe(50090);
    expect(strat.getPositionQty()).toBeGreaterThan(0);
    expect(onTrade).toHaveBeenCalledTimes(1);

    // Push rolling window forward and flatten carry <= 150 bps => triggers passive maker sell
    strat.onTicker(makeTicker(50100, 50095, 50105));
    strat.onTicker(makeTicker(50100, 50095, 50105));
    await vi.waitFor(() => expect(strat.getPositionSide()).toBe('flat'));
    expect(strat.getPositionQty()).toBe(0);
    expect(strat.getEntryPrice()).toBe(0);
    expect(onTrade).toHaveBeenCalledTimes(2);
  });

  it('works without optional placeOrder/onTrade callbacks and fallback bid/ask', async () => {
    const onLog = vi.fn();
    const strat = new H3MakerStrategy(
      makeConfig({ maxGrossLeverage: -1, lookbackDays: 2 }),
      { onLog },
    );
    strat.start(1000);

    strat.onTicker(makeTicker(1010, 0, 0));
    await vi.waitFor(() => expect(strat.getPositionSide()).toBe('long'));

    strat.onTicker(makeTicker(1010, 0, 0));
    await vi.waitFor(() => expect(strat.getPositionSide()).toBe('flat'));
  });

  it('handles rejected/cancelled orders and order errors gracefully without crashing', async () => {
    const onLog = vi.fn();
    const placeOrder = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'rej-1', exchangeId: 'binance', symbol: 'BTC/USDT',
        side: 'buy', type: 'limit', price: 0, quantity: 1, filled: 0,
        status: 'rejected', timestamp: Date.now(),
      })
      .mockRejectedValueOnce(new Error('maker post-only rejected'))
      .mockRejectedValueOnce('raw failure');

    const strat = new H3MakerStrategy(makeConfig({ lookbackDays: 5 }), { onLog, placeOrder });
    strat.start(1000);

    strat.onTicker(makeTicker(1020));
    await vi.waitFor(() => expect(placeOrder).toHaveBeenCalledTimes(1));
    expect(strat.getPositionSide()).toBe('flat');

    strat.onTicker(makeTicker(1040));
    await vi.waitFor(() => expect(onLog).toHaveBeenCalledWith(expect.stringContaining('maker post-only rejected')));

    strat.onTicker(makeTicker(1060));
    await vi.waitFor(() => expect(onLog).toHaveBeenCalledWith(expect.stringContaining('unknown')));
  });
});
