import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StrategyContext, TradeSignal } from '../types';
import type { GridBotConfig } from '@/tree/bot/types';

let mockLevelCount = 0;
const mockOnTicker = vi.fn();

vi.mock('@/tree/bot/strategies/grid', () => ({
  GridStrategy: vi.fn().mockImplementation(() => ({
    onTicker: mockOnTicker,
    get levelCount() { return mockLevelCount; },
  })),
}));

const { createGridChainStrategy } = await import('./grid');

const gridConfig: GridBotConfig = {
  strategy: 'grid',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  mode: 'paper',
  capital: 1000,
  gridSpacingPct: 1,
  gridLevels: 5,
  capitalPerLevelPct: 20,
  takeProfitPct: 0.5,
  stopLossPct: 2,
  maxDrawdownPct: 10,
  rebalanceOnFill: false,
};

const ctx: StrategyContext = {
  symbol: 'BTCUSDT',
  balance: 100,
  openPositions: 0,
  lastPrice: 50000,
};

beforeEach(() => {
  mockLevelCount = 0;
  mockOnTicker.mockClear();
});

function makeChain(): ReturnType<typeof createGridChainStrategy> {
  return createGridChainStrategy({ type: 'grid', gridConfig });
}

describe('createGridChainStrategy', () => {
  it('returns ChainStrategy with name grid', () => {
    expect(makeChain().name).toBe('grid');
  });

  it('returns null when levelCount is 0', () => {
    mockLevelCount = 0;
    expect(makeChain().evaluate(ctx)).toBeNull();
  });

  it('returns null when levelCount is nullish (fallback ?? 0)', () => {
    mockLevelCount = undefined as unknown as number;
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

  it('returns buy signal when levelCount > 0 and lastPrice > 0', () => {
    mockLevelCount = 3;
    const signal = makeChain().evaluate(ctx);
    expect(signal).toEqual({
      side: 'buy',
      qty: 1,
      price: 50000,
      reason: 'grid',
    });
  });

  it('returns sell side when lastPrice is 0', () => {
    mockLevelCount = 1;
    const signal = makeChain().evaluate({ ...ctx, lastPrice: 0 });
    expect(signal!.side).toBe('sell');
    expect(signal!.reason).toBe('grid');
  });

  it('returns qty=0 when balance is 0', () => {
    mockLevelCount = 2;
    const signal = makeChain().evaluate({ ...ctx, balance: 0 });
    expect(signal!.qty).toBe(0);
  });

  it('caps qty at 1 for large balances', () => {
    mockLevelCount = 2;
    const signal = makeChain().evaluate({ ...ctx, balance: 200 });
    expect(signal!.qty).toBe(1);
  });

  it('computes qty as balance*0.1 when result is below 1', () => {
    mockLevelCount = 2;
    const signal = makeChain().evaluate({ ...ctx, balance: 5 });
    expect(signal!.qty).toBe(0.5);
  });
});
