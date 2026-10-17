import { vi } from 'vitest';
import type { BacktestResult } from '@/forest/backtest/types';

export { MESSAGES, BOTS } from './backtests-test-messages';

export const localeMock = vi.fn().mockReturnValue('vi');

export function makeResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    id: 'res-1',
    bot_id: 'bot-1',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    start_date: 1700000000000,
    end_date: 1707700000000,
    total_trades: 4,
    win_count: 2,
    loss_count: 2,
    win_rate: 50,
    total_pnl: 150.5,
    max_drawdown: 8.3,
    sharpe_ratio: 1.85,
    params_json: '{}',
    equity_curve_json: [
      { timestamp: 1700000000000, equity: 10000, drawdownPct: 0 },
      { timestamp: 1700100000000, equity: 10100, drawdownPct: 0 },
      { timestamp: 1700200000000, equity: 10150.5, drawdownPct: 0 },
    ],
    trades_json: [
      {
        entryTimestamp: 1700000000000,
        exitTimestamp: 1700050000000,
        side: 'buy' as const,
        entryPrice: 42000,
        exitPrice: 42500,
        quantity: 0.1,
        pnl: 50,
        fee: 1.2,
        pnlPct: 1.19,
        holdingMinutes: 833,
      },
      {
        entryTimestamp: 1700100000000,
        exitTimestamp: 1700150000000,
        side: 'sell' as const,
        entryPrice: 42500,
        exitPrice: 42100,
        quantity: 0.1,
        pnl: -40,
        fee: 1.1,
        pnlPct: -0.94,
        holdingMinutes: 833,
      },
    ],
    created_at: 1700200000000,
    ...overrides,
  };
}

export const profitData = makeResult({
  total_pnl: 320.75,
  win_count: 4,
  loss_count: 1,
  win_rate: 80,
  trades_json: [
    {
      entryTimestamp: 1700000000000,
      exitTimestamp: 1700050000000,
      side: 'buy' as const,
      entryPrice: 42000,
      exitPrice: 43000,
      quantity: 0.1,
      pnl: 100,
      fee: 1.5,
      pnlPct: 2.38,
      holdingMinutes: 833,
    },
  ],
});

export const lossData = makeResult({
  total_pnl: -85.2,
  win_count: 1,
  loss_count: 4,
  win_rate: 20,
  trades_json: [
    {
      entryTimestamp: 1700000000000,
      exitTimestamp: 1700050000000,
      side: 'sell' as const,
      entryPrice: 42000,
      exitPrice: 42500,
      quantity: 0.1,
      pnl: -50,
      fee: 1.1,
      pnlPct: -1.19,
      holdingMinutes: 833,
    },
  ],
});
