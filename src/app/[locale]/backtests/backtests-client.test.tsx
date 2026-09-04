import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BacktestsClient from './backtests-client';
import type { BacktestResult } from '@/forest/backtest/types';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

const localeMock = vi.fn().mockReturnValue('vi');

const MESSAGES: Record<string, string> = {
  'vi:backtests.title': 'Backtest',
  'vi:backtests.selectBotPlaceholder': 'Chon bot...',
  'vi:backtests.running': 'Dang chay...',
  'vi:backtests.run': 'Chay Backtest',
  'vi:backtests.pleaseSelectBot': 'Chon bot truoc',
  'vi:backtests.botNotFound': 'Khong tim thay bot',
  'vi:backtests.failed': 'Backtest that bai',
  'vi:backtests.requestFailed': 'Yeu cau that bai',
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
  'en:backtests.pleaseSelectBot': 'Please select a bot',
  'en:backtests.botNotFound': 'Bot not found',
  'en:backtests.failed': 'Backtest failed',
  'en:backtests.requestFailed': 'Request failed',
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

import { runBacktestAction, type BacktestRunOutput } from '@/forest/backtest/actions';
const runMock = vi.mocked(runBacktestAction);

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function getBotSelect() {
  return screen.getAllByRole('combobox')[0];
}

function fireBtn() {
  fireEvent.click(screen.getByRole('button'));
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

const BOTS = [
  { id: 'bot-1', name: 'Grid BTC', strategy: 'grid', configJson: '{"exchange":"binance","symbol":"BTC/USDT"}' },
  { id: 'bot-2', name: 'MeanRev ETH', strategy: 'mean_reversion', configJson: '{}' },
];

function makeResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
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
      { timestamp: 1700100000000, equity: 10150, drawdownPct: 0 },
      { timestamp: 1700200000000, equity: 10200, drawdownPct: 0 },
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

const profitData = makeResult({
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

const lossData = makeResult({
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

beforeEach(() => {
  localeMock.mockReturnValue('vi');
  runMock.mockReset();
});

/* ------------------------------------------------------------------ */
/* Initial render                                                    */
/* ------------------------------------------------------------------ */

describe('BacktestsClient — initial render', () => {
  it('renders bot selector options', () => {
    render(<BacktestsClient initialBots={BOTS} />);
    expect(screen.getByText('Grid BTC (grid)')).toBeTruthy();
    expect(screen.getByText('MeanRev ETH (mean_reversion)')).toBeTruthy();
  });

  it('disables the run button when no bot is selected', () => {
    render(<BacktestsClient initialBots={BOTS} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not fire action when button is forcibly clicked with no bot selected', () => {
    render(<BacktestsClient initialBots={BOTS} />);
    fireBtn();
    expect(runMock).not.toHaveBeenCalled();
  });

  it('re-enables the run button once a bot is selected', async () => {
    render(<BacktestsClient initialBots={BOTS} />);
    await userEvent.setup().selectOptions(getBotSelect(), 'bot-1');
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('changes interval selector value', async () => {
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[1], '4h');
    expect(selects[1]).toHaveValue('4h');
    await user.selectOptions(selects[1], '1d');
    expect(selects[1]).toHaveValue('1d');
  });
});

/* ------------------------------------------------------------------ */
/* Vietnamese success path                                           */
/* ------------------------------------------------------------------ */

describe('BacktestsClient — Vietnamese success (vi)', () => {
  it('renders metrics, equity curve, and trades on success', async () => {
    const output: BacktestRunOutput = { success: true, result: profitData, candlesFetched: 100 };
    runMock.mockResolvedValue(output);
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Chi So Hieu Suat')).toBeTruthy();
    expect(screen.getByText('Tong Loi Nhuan')).toBeTruthy();
    expect(screen.getByText('Ty Le Thang')).toBeTruthy();
    expect(screen.getByText('Max Drawdown')).toBeTruthy();
    expect(screen.getByText('Duong Equity')).toBeTruthy();
    expect(screen.getByText('Giao Dich Gan Day')).toBeTruthy();
    expect(screen.getByText('Huong')).toBeTruthy();
    expect(screen.getByText('Thoi Gian Vao')).toBeTruthy();
    expect(screen.getByText('Gia Vao')).toBeTruthy();
    expect(screen.getByText('Loi Nhuan')).toBeTruthy();
  });

  it('shows "Khong tim thay bot" when selected bot is removed from list', async () => {
    const { rerender } = render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(getBotSelect(), 'bot-1');
    rerender(<BacktestsClient initialBots={[BOTS[1]]} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Khong tim thay bot')).toBeTruthy();
  });

  it('displays error from a failed action response', async () => {
    const output: BacktestRunOutput = { success: false, error: 'invalid api key', candlesFetched: 0 };
    runMock.mockResolvedValue(output);
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('invalid api key')).toBeTruthy();
  });

  it('displays fallback "Backtest that bai" when action returns success:false without error', async () => {
    const output: BacktestRunOutput = { success: false, candlesFetched: 0 };
    runMock.mockResolvedValue(output);
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Backtest that bai')).toBeTruthy();
  });

  it('displays the thrown error message as-is', async () => {
    runMock.mockRejectedValue(new Error('Network error'));
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Network error')).toBeTruthy();
  });

  it('displays generic "Yeu cau that bai" when action throws a non-Error', async () => {
    runMock.mockRejectedValue('string error');
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Yeu cau that bai')).toBeTruthy();
  });

  it('shows running state and re-enables when action resolves', async () => {
    let resolve: (v: BacktestRunOutput) => void;
    runMock.mockImplementation(() => new Promise((r) => { resolve = r; }));
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(screen.getByText('Dang chay...')).toBeTruthy();
    expect(screen.getByRole('button')).toBeDisabled();
    resolve!({ success: true, result: profitData, candlesFetched: 100 });
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  });

  it('clears prior error state when action succeeds', async () => {
    const errOutput: BacktestRunOutput = { success: false, error: 'first error', candlesFetched: 0 };
    runMock.mockResolvedValueOnce(errOutput);
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('first error')).toBeTruthy();

    runMock.mockResolvedValueOnce({ success: true, result: profitData, candlesFetched: 100 });
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Chi So Hieu Suat')).toBeTruthy();
    expect(screen.queryByText('first error')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* English success path                                              */
/* ------------------------------------------------------------------ */

describe('BacktestsClient — English success (en)', () => {
  beforeEach(() => {
    localeMock.mockReturnValue('en');
    runMock.mockReset();
  });

  it('disables run button when no bot is selected', () => {
    render(<BacktestsClient initialBots={BOTS} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows "Bot not found" when selected bot is removed from list', async () => {
    const { rerender } = render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(getBotSelect(), 'bot-1');
    rerender(<BacktestsClient initialBots={[BOTS[1]]} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Bot not found')).toBeTruthy();
  });

  it('renders English section headings on success', async () => {
    runMock.mockResolvedValue({ success: true, result: profitData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Performance Metrics')).toBeTruthy();
    expect(screen.getByText('Equity Curve')).toBeTruthy();
    expect(screen.getByText('Recent Trades')).toBeTruthy();
    expect(screen.getByText('Run Backtest')).toBeTruthy();
  });

  it('shows "Request failed" when action throws non-Error', async () => {
    runMock.mockRejectedValue('string error');
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Request failed')).toBeTruthy();
  });

  it('shows "Backtest failed" when action returns no error field', async () => {
    const output: BacktestRunOutput = { success: false, candlesFetched: 0 };
    runMock.mockResolvedValue(output);
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Backtest failed')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* Equity curve length guard                                          */
/* ------------------------------------------------------------------ */

describe('EquityCurveChart — data length guard', () => {
  beforeEach(() => {
    runMock.mockReset();
  });

  it('returns null (no SVG) when equity_curve has fewer than 2 points', async () => {
    const shortResult = makeResult({
      equity_curve_json: [{ timestamp: 1700000000000, equity: 10000, drawdownPct: 0 }],
    });
    runMock.mockResolvedValue({ success: true, result: shortResult, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Chi So Hieu Suat')).toBeTruthy();
    });
    expect(document.querySelectorAll('svg').length).toBe(0);
  });

  it('renders SVG chart when equity_curve has 2 or more points', async () => {
    runMock.mockResolvedValue({ success: true, result: makeResult(), candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Chi So Hieu Suat')).toBeTruthy();
    });
    expect(document.querySelectorAll('svg').length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Trade row styling edges                                            */
/* ------------------------------------------------------------------ */

describe('RecentTradesTable — pnl styling', () => {
  beforeEach(() => {
    runMock.mockReset();
  });

  it('renders profit trade with plus prefix and profit color', async () => {
    runMock.mockResolvedValue({ success: true, result: profitData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('BUY')).toBeTruthy();
    const pnl = screen.getByText('+$100.00');
    expect(pnl).toHaveClass('text-profit');
  });

  it('renders loss trade with minus sign and loss color', async () => {
    runMock.mockResolvedValue({ success: true, result: lossData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('SELL')).toBeTruthy();
    const pnl = screen.getByText('$-50.00');
    expect(pnl).toHaveClass('text-loss');
  });

  it('renders profit PnL percentage with plus sign', async () => {
    runMock.mockResolvedValue({ success: true, result: profitData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('+2.38%')).toBeTruthy();
  });

  it('renders loss PnL percentage with loss color', async () => {
    runMock.mockResolvedValue({ success: true, result: lossData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    const pct = screen.getByText('-1.19%');
    expect(pct).toHaveClass('text-loss');
  });
});

/* ------------------------------------------------------------------ */
/* MetricCard positive/negative styling                               */
/* ------------------------------------------------------------------ */

describe('MetricCard styling', () => {
  beforeEach(() => {
    localeMock.mockReturnValue('en');
    runMock.mockReset();
  });

  it('renders positive PnL value with profit color', async () => {
    runMock.mockResolvedValue({ success: true, result: profitData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Total PnL')).toBeTruthy();
    const pnlValue = screen.getByText('+$320.75');
    expect(pnlValue).toHaveClass('text-profit');
  });

  it('renders negative PnL value with loss color', async () => {
    runMock.mockResolvedValue({ success: true, result: lossData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();

    await user.selectOptions(getBotSelect(), 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(await screen.findByText('Total PnL')).toBeTruthy();
    const pnlValue = screen.getByText('$-85.20');
    expect(pnlValue).toHaveClass('text-loss');
  });
});