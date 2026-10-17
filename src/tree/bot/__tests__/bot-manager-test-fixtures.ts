import type { Bot } from '@/lib/db/types';

export function mockRequest(id: string) {
  return {
    id,
    config: {
      symbol: 'BTC/USDT',
      strategy: 'grid' as const,
      capital: 1000,
      gridSpacingPct: 1,
      gridLevels: 4,
      capitalPerLevelPct: 25,
      takeProfitPct: 2,
      stopLossPct: 3,
      rebalanceOnFill: false,
      maxDrawdownPct: 15,
      exchange: 'binance',
      mode: 'paper' as const,
    },
    exchangeConfig: {
      apiKey: 'test',
      apiSecret: 'secret',
      testnet: false,
      sandbox: false,
      rateLimitMs: 1000,
    },
    mode: 'paper' as const,
  };
}

export function makeBotRow(overrides: Partial<Bot> = {}): Bot {
  return {
    id: 'd1-bot-1',
    user_id: 'user-1',
    name: 'D1 Bot',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    status: 'paper_test',
    capital_allocated: 1000,
    capital_used: 0,
    config_json: JSON.stringify({
      strategy: 'grid',
      symbol: 'BTC/USDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 1000,
      maxDrawdownPct: 15,
    }),
    total_pnl: 0,
    total_trades: 0,
    win_count: 0,
    loss_count: 0,
    max_drawdown: 0,
    started_at: null,
    stopped_at: null,
    last_error: null,
    last_tick_at: null,
    last_order_at: null,
    current_drawdown: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}
