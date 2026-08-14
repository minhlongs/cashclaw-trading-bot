import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StrategyContext } from '../types';
import type { MeanRevBotConfig, BotTrade } from '@/tree/bot/types';
import type { OrderRequest, OrderResult } from '@/tree/exchange/types';

let mockTradeCount = 0;
const mockOnTicker = vi.fn();

interface CapturedCallbacks {
  placeOrder: (req: OrderRequest) => Promise<OrderResult>;
  onTrade: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
}
let capturedCallbacks: CapturedCallbacks = {
  placeOrder: () => Promise.resolve({} as OrderResult),
  onTrade: () => {},
  onLog: () => {},
};

vi.mock('@/tree/bot/strategies/mean-reversion', () => ({
  MeanRevStrategy: vi.fn().mockImplementation((_config: MeanRevBotConfig, callbacks: CapturedCallbacks) => {
    capturedCallbacks = callbacks;
    return {
      onTicker: mockOnTicker,
      get tradeCount() { return mockTradeCount; },
    };
  }),
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

describe('captured callbacks', () => {
  const config = { type: 'mean_reversion' as const, meanRevConfig: {} as MeanRevBotConfig };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTradeCount = 0;
  });

  it('placeOrder returns filled OrderResult with correct fields', async () => {
    const chain = createMeanRevChainStrategy(config);
    expect(chain).toBeDefined();

    const req: OrderRequest = {
      symbol: 'ETH/USDT',
      side: 'sell',
      type: 'market',
      quantity: 1.0,
    };

    const result = await capturedCallbacks.placeOrder(req);

    expect(result.symbol).toBe('ETH/USDT');
    expect(result.side).toBe('sell');
    expect(result.type).toBe('market');
    expect(result.price).toBe(0);
    expect(result.quantity).toBe(1.0);
    expect(result.filled).toBe(1.0);
    expect(result.status).toBe('filled');
    expect(result.fee).toBe(0);
    expect(result.id).toBe('');
    expect(result.exchangeId).toBe('');
  });

  it('onTrade accepts a BotTrade without error', () => {
    const chain = createMeanRevChainStrategy(config);
    expect(chain).toBeDefined();

    const trade: BotTrade = {
      id: 'trade-2',
      botId: 'bot-2',
      exchangeId: 'ex-2',
      symbol: 'ETH/USDT',
      side: 'sell',
      type: 'market',
      price: 2000,
      quantity: 1.0,
      filled: 1.0,
      fee: 0.05,
      pnl: 0,
      status: 'filled',
      timestamp: Date.now(),
    };

    expect(() => capturedCallbacks.onTrade(trade)).not.toThrow();
  });

  it('onLog accepts a message string without error', () => {
    const chain = createMeanRevChainStrategy(config);
    expect(chain).toBeDefined();

    expect(() => capturedCallbacks.onLog('mean rev log')).not.toThrow();
  });
});
