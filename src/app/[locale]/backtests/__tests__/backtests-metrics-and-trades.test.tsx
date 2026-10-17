import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BacktestsClient from '../backtests-client';
import { localeMock, MESSAGES, BOTS, makeResult, profitData, lossData } from './backtests-test-helpers';

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => {
    const t = (key: string) => {
      const flat = ns ? `${ns}.${key}` : key;
      return MESSAGES[`${localeMock()}:${flat}`] ?? MESSAGES[`${localeMock()}:${key}`] ?? flat;
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
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    rerender(<BacktestsClient initialBots={[BOTS[1]]} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Bot not found')).toBeTruthy();
  });

  it('renders English section headings on success', async () => {
    runMock.mockResolvedValue({ success: true, result: profitData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
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
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Request failed')).toBeTruthy();
  });

  it('shows "Backtest failed" when action returns no error field', async () => {
    const output: BacktestRunOutput = { success: false, candlesFetched: 0 };
    runMock.mockResolvedValue(output);
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Backtest failed')).toBeTruthy();
  });
});

describe('EquityCurveChart & Styling', () => {
  beforeEach(() => {
    localeMock.mockReturnValue('vi');
    runMock.mockReset();
  });

  it('returns null (no SVG) when equity_curve has fewer than 2 points', async () => {
    const shortResult = makeResult({
      equity_curve_json: [{ timestamp: 1700000000000, equity: 10000, drawdownPct: 0 }],
    });
    runMock.mockResolvedValue({ success: true, result: shortResult, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('Chi So Hieu Suat')).toBeTruthy());
    expect(document.querySelectorAll('svg').length).toBe(0);
  });

  it('renders SVG chart when equity_curve has 2 or more points', async () => {
    runMock.mockResolvedValue({ success: true, result: makeResult(), candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByText('Chi So Hieu Suat')).toBeTruthy());
    expect(document.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('renders profit/loss trade styling correctly', async () => {
    runMock.mockResolvedValueOnce({ success: true, result: profitData, candlesFetched: 100 });
    const { unmount } = render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('BUY')).toBeTruthy();
    expect(screen.getByText('+$100.00')).toHaveClass('text-profit');
    expect(screen.getByText('+2.38%')).toBeTruthy();

    unmount();
    runMock.mockResolvedValueOnce({ success: true, result: lossData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('SELL')).toBeTruthy();
    expect(screen.getByText('$-50.00')).toHaveClass('text-loss');
    expect(screen.getByText('-1.19%')).toHaveClass('text-loss');
  });

  it('renders MetricCard positive/negative values with profit/loss color', async () => {
    localeMock.mockReturnValue('en');
    runMock.mockResolvedValueOnce({ success: true, result: profitData, candlesFetched: 100 });
    const { unmount } = render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Total PnL')).toBeTruthy();
    expect(screen.getByText('+$320.75')).toHaveClass('text-profit');

    unmount();
    runMock.mockResolvedValueOnce({ success: true, result: lossData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Total PnL')).toBeTruthy();
    expect(screen.getByText('$-85.20')).toHaveClass('text-loss');
  });
});
