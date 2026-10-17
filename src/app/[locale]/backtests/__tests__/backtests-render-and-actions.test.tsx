import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BacktestsClient from '../backtests-client';
import { localeMock, MESSAGES, BOTS, profitData } from './backtests-test-helpers';

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

describe('BacktestsClient — initial render', () => {
  beforeEach(() => {
    localeMock.mockReturnValue('vi');
    runMock.mockReset();
  });

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
    fireEvent.click(screen.getByRole('button'));
    expect(runMock).not.toHaveBeenCalled();
  });

  it('re-enables the run button once a bot is selected', async () => {
    render(<BacktestsClient initialBots={BOTS} />);
    await userEvent.setup().selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
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

describe('BacktestsClient — Vietnamese success & error paths (vi)', () => {
  beforeEach(() => {
    localeMock.mockReturnValue('vi');
    runMock.mockReset();
  });

  it('renders metrics, equity curve, and trades on success', async () => {
    runMock.mockResolvedValue({ success: true, result: profitData, candlesFetched: 100 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
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
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    rerender(<BacktestsClient initialBots={[BOTS[1]]} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Khong tim thay bot')).toBeTruthy();
  });

  it('displays error from a failed action response', async () => {
    runMock.mockResolvedValue({ success: false, error: 'invalid api key', candlesFetched: 0 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('invalid api key')).toBeTruthy();
  });

  it('displays fallback "Backtest that bai" when action returns success:false without error', async () => {
    runMock.mockResolvedValue({ success: false, candlesFetched: 0 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Backtest that bai')).toBeTruthy();
  });

  it('displays the thrown error message as-is', async () => {
    runMock.mockRejectedValue(new Error('Network error'));
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Network error')).toBeTruthy();
  });

  it('displays generic "Yeu cau that bai" when action throws a non-Error', async () => {
    runMock.mockRejectedValue('string error');
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Yeu cau that bai')).toBeTruthy();
  });

  it('shows running state and re-enables when action resolves', async () => {
    let resolve: (v: BacktestRunOutput) => void;
    runMock.mockImplementation(() => new Promise((r) => { resolve = r; }));
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));

    expect(screen.getByText('Dang chay...')).toBeTruthy();
    expect(screen.getByRole('button')).toBeDisabled();
    resolve!({ success: true, result: profitData, candlesFetched: 100 });
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  });

  it('clears prior error state when action succeeds', async () => {
    runMock.mockResolvedValueOnce({ success: false, error: 'first error', candlesFetched: 0 });
    render(<BacktestsClient initialBots={BOTS} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'bot-1');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('first error')).toBeTruthy();

    runMock.mockResolvedValueOnce({ success: true, result: profitData, candlesFetched: 100 });
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Chi So Hieu Suat')).toBeTruthy();
    expect(screen.queryByText('first error')).toBeNull();
  });
});
