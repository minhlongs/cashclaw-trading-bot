import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BacktestsClient from './backtests-client';
import type { BacktestResult } from '@/forest/backtest/types';

const localeMock = vi.fn().mockReturnValue('vi');

const MESSAGES: Record<string, string> = {
  'vi:backtests.title': 'Backtest',
  'vi:backtests.selectBotPlaceholder': 'Chon bot...',
  'vi:backtests.running': 'Dang chay...',
  'vi:backtests.run': 'Chay Backtest',
  'vi:backtests.pleaseSelectBot': 'Chon bot truoc',
  'vi:backtests.performanceMetrics': 'Chi So Hieu Suat',
  'vi:backtests.totalPnl': 'Tong Loi Nhuan',
  'vi:backtests.winRate': 'Ty Le Thang',
  'vi:backtests.maxDrawdown': 'Max Drawdown',
  'vi:backtests.sharpeRatio': 'Sharpe Ratio',
  'vi:backtests.totalTrades': 'Tong Giao Dich',
  'vi:backtests.equityCurve': 'Duong Equity',
  'vi:backtests.recentTrades': 'Giao Dich Gan Day',
  'vi:backtests.side': 'Huong',
  'vi:backtests.entryTime': 'Thoi Gian Vao',
  'vi:backtests.exitTime': 'Thoi Gian Ra',
  'vi:backtests.pnlPct': 'Loi Nhuan %',
  'vi:common.entryPrice': 'Gia Vao',
  'vi:common.exitPrice': 'Gia Ra',
  'vi:common.pnl': 'Loi Nhuan',
  'en:backtests.title': 'Backtest',
  'en:backtests.selectBotPlaceholder': 'Select a bot...',
  'en:backtests.running': 'Running...',
  'en:backtests.run': 'Run Backtest',
  'en:backtests.performanceMetrics': 'Performance Metrics',
  'en:backtests.totalPnl': 'Total PnL',
  'en:backtests.winRate': 'Win Rate',
  'en:backtests.maxDrawdown': 'Max Drawdown',
  'en:backtests.sharpeRatio': 'Sharpe Ratio',
  'en:backtests.totalTrades': 'Total Trades',
  'en:backtests.equityCurve': 'Equity Curve',
  'en:backtests.recentTrades': 'Recent Trades',
  'en:backtests.side': 'Side',
  'en:backtests.entryTime': 'Entry Time',
  'en:backtests.exitTime': 'Exit Time',
  'en:backtests.pnlPct': 'PnL %',
  'en:common.entryPrice': 'Entry Price',
  'en:common.exitPrice': 'Exit Price',
  'en:common.pnl': 'PnL',
};

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => {
    const t = (key: string) => {
      const flat = ns ? `${ns}.${key}` : key;
      const value = MESSAGES[`${localeMock()}:${flat}`] ?? MESSAGES[`${localeMock()}:${key}`];
      return value ?? flat;
    };
    t.raw = (key: string) => MESSAGES[`${localeMock()}:${ns ? ns + '.' + key : key}`] ?? (ns ? `${ns}.${key}` : key);
    return t;
  },
  useLocale: (...args: unknown[]) => localeMock(...args),
}));

vi.mock('@/forest/backtest/actions', () => ({
  runBacktestAction: vi.fn(),
}));

import { runBacktestAction } from '@/forest/backtest/actions';
const runMock = vi.mocked(runBacktestAction);

const VOL_DCA_BOTS = [
  {
    id: 'bot-vdca-1',
    name: 'Vol DCA BTC',
    strategy: 'volatility_dca',
    configJson: JSON.stringify({
      strategy: 'volatility_dca',
      exchange: 'binance',
      symbol: 'BTC/USDT',
      capital: 10000,
      priceDropStep: 1.5,
      maxSteps: 4,
      baseOrderSizePct: 10,
      volatilityWindow: 20,
      volBaseline: 45,
      reboundTarget: 2.5,
    }),
  },
];

const mockVdcaResult: BacktestResult = {
  id: 'bt_vdca_123',
  bot_id: 'bot-vdca-1',
  strategy: 'volatility_dca',
  pair: 'BTC/USDT',
  exchange: 'binance',
  start_date: 1700000000000,
  end_date: 1707700000000,
  total_trades: 2,
  win_count: 2,
  loss_count: 0,
  win_rate: 100,
  total_pnl: 245.5,
  max_drawdown: 3.2,
  sharpe_ratio: 2.15,
  params_json: '{}',
  equity_curve_json: [
    { timestamp: 1700000000000, equity: 10000, drawdownPct: 0 },
    { timestamp: 1700100000000, equity: 10245.5, drawdownPct: 0 },
  ],
  trades_json: [
    {
      entryTimestamp: 1700000000000,
      exitTimestamp: 1700050000000,
      side: 'buy',
      entryPrice: 48000,
      exitPrice: 49500,
      quantity: 0.2,
      pnl: 145.5,
      fee: 2.5,
      pnlPct: 3.12,
      holdingMinutes: 500,
    },
  ],
  created_at: 1700200000000,
};

describe('BacktestsClient — Volatility DCA Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localeMock.mockReturnValue('vi');
  });

  it('renders Volatility DCA option localized in Vietnamese', () => {
    localeMock.mockReturnValue('vi');
    render(<BacktestsClient initialBots={VOL_DCA_BOTS} />);
    expect(screen.getByText('Vol DCA BTC (DCA Biến Động)')).toBeTruthy();
  });

  it('renders Volatility DCA option localized in English', () => {
    localeMock.mockReturnValue('en');
    render(<BacktestsClient initialBots={VOL_DCA_BOTS} />);
    expect(screen.getByText('Vol DCA BTC (Volatility DCA)')).toBeTruthy();
  });

  it('dispatches backtest action with volatility_dca strategy and config', async () => {
    const user = userEvent.setup();
    runMock.mockResolvedValue({ success: true, result: mockVdcaResult, candlesFetched: 150 });

    render(<BacktestsClient initialBots={VOL_DCA_BOTS} />);

    const botSelect = screen.getAllByRole('combobox')[0];
    await user.selectOptions(botSelect, 'bot-vdca-1');
    await user.click(screen.getByRole('button', { name: /Chay Backtest/i }));

    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({
      botId: 'bot-vdca-1',
      exchange: 'binance',
      symbol: 'BTC/USDT',
      strategy: 'volatility_dca',
      config: expect.objectContaining({
        strategy: 'volatility_dca',
        priceDropStep: 1.5,
        maxSteps: 4,
      }),
    }));

    // Verifies performance metrics rendered
    expect(await screen.findByText('+$245.50')).toBeTruthy();
    expect(screen.getByText('100.0%')).toBeTruthy();
    expect(screen.getByText('-3.2%')).toBeTruthy();
    expect(screen.getByText('2.15')).toBeTruthy();
    expect(screen.getByText('2 (2W / 0L)')).toBeTruthy();
  });
});
