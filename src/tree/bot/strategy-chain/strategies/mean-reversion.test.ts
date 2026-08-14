import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StrategyContext } from '../types';
import type { MeanRevBotConfig } from '@/tree/bot/types';

let mockTradeCount = 0;
const mockOnTicker = vi.fn();

vi.mock('@/tree/bot/strategies/mean-reversion', () => ({
  MeanRevStrategy: vi.fn().mockImplementation(() => ({
    onTicker: mockOnTicker,
    get tradeCount() { return mockTradeCount; },
  })),
}));

const { createMeanRevChainStrategy } = await import('./mean-reversion');

const meanRevConfig: MeanRevBotConfig = {
  strategy: 'mean_reversion',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  mode: 'paper',
  capital: 1000,
  bbPeriod: 20,
  bbStdDev: 2,
  rsiPeriod: 14,
  rsiBuyThreshold: 30,
  rsiSellThreshold: 70,
  volumeMultiplier: 1.5,
  positionSizePct: 20,
  maxDrawdownPct: 10,
  cooldownMinutes: 5,
};

const ctx: StrategyContext = {
  symbol: 'BTCUSDT',
  balance: 100,
  openPositions: 0,
  lastPrice: 50000,
};

beforeEach(() => {
  mockTradeCount = 0;
  mockOnTicker.mockClear();
});

function makeChain(): ReturnType<typeof createMeanRevChainStrategy> {
  return createMeanRevChainStrategy({ type: 'mean_reversion', meanRevConfig });
}

describe('createMeanRevChainStrategy', () => {
  it('returns ChainStrategy with name mean_reversion', () => {
    expect(makeChain().name).toBe('mean_reversion');
  });

  it('returns null when tradeCount is 0', () => {
    mockTradeCount = 0;
    expect(makeChain().evaluate(ctx)).toBeNull();
  });

  it('returns null when tradeCount is nullish (fallback ?? 0)', () => {
    mockTradeCount = undefined as unknown as number;
    expect(makeChain().evaluate(ctx)).toBeNull();
  });

  it('calls onTicker with constructed Ticker', () => {
    makeChain().evaluate(ctx);
    expect(mockOnTicker).toHaveBeenCalledOnce();
    const ticker = mockOnTicker.mock.calls[0][0];
    expect(ticker.symbol).toBe('BTCUSDT');
    expect(ticker.last).toBe(50000);
    expect(ticker.bid).toBe(50000);
    expect(ticker.ask).toBe(50000);
  });

  it('returns buy signal when tradeCount > 0 and lastPrice > 0', () => {
    mockTradeCount = 1;
    const signal = makeChain().evaluate(ctx);
    expect(signal).toEqual({
      side: 'buy',
      qty: 1,
      price: 50000,
      reason: 'mean_reversion',
    });
  });

  it('returns sell side when lastPrice is 0', () => {
    mockTradeCount = 2;
    const signal = makeChain().evaluate({ ...ctx, lastPrice: 0 });
    expect(signal!.side).toBe('sell');
    expect(signal!.reason).toBe('mean_reversion');
  });

  it('returns qty=0 when balance is 0', () => {
    mockTradeCount = 1;
    const signal = makeChain().evaluate({ ...ctx, balance: 0 });
    expect(signal!.qty).toBe(0);
  });

  it('caps qty at 1 for large balances', () => {
    mockTradeCount = 3;
    const signal = makeChain().evaluate({ ...ctx, balance: 200 });
    expect(signal!.qty).toBe(1);
  });

  it('computes qty as balance*0.1 when result is below 1', () => {
    mockTradeCount = 1;
    const signal = makeChain().evaluate({ ...ctx, balance: 5 });
    expect(signal!.qty).toBe(0.5);
  });
});
