import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotRowActions } from './bot-row-actions';
import type { BotCardData } from '@/forest/dashboard/actions';

const translations: Record<string, string> = {
  'bots.actions.pause': 'Pause',
  'bots.actions.resume': 'Resume',
  'bots.actions.start': 'Start',
  'bots.columns.detail': 'Detail',
  'bots.actions.actionFailed': 'Action failed: Unknown',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => translations[k] ?? k,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock('lucide-react', () => ({
  Play: () => <svg data-testid="icon-play" />,
  Pause: () => <svg data-testid="icon-pause" />,
  Loader2: () => <svg data-testid="icon-loader" />,
}));

function makeBot(overrides: Partial<BotCardData> = {}): BotCardData {
  return {
    id: 'b-1', name: 'Bot', strategy: 'grid', pair: 'BTC/USDT', exchange: 'binance',
    botStatus: 'live_running', totalPnl: 10, winCount: 1, lossCount: 0,
    startedAt: 1, updatedAt: 2, capitalAllocated: 1000, maxDrawdownPct: 1, ...overrides,
  };
}

describe('BotRowActions', () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders Pause button for live_running and paper_test bots', () => {
    const { unmount } = render(
      <BotRowActions bot={makeBot({ botStatus: 'live_running' })} locale="en" onStatusChange={vi.fn()} onError={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-pause')).toBeInTheDocument();
    unmount();

    render(
      <BotRowActions bot={makeBot({ botStatus: 'paper_test' })} locale="en" onStatusChange={vi.fn()} onError={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('renders Play button with Start title for draft, stopped, error bots', () => {
    const { unmount } = render(
      <BotRowActions bot={makeBot({ botStatus: 'draft' })} locale="en" onStatusChange={vi.fn()} onError={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-play')).toBeInTheDocument();
    unmount();

    render(
      <BotRowActions bot={makeBot({ botStatus: 'stopped' })} locale="en" onStatusChange={vi.fn()} onError={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('renders Play button with Resume title for paused bots', () => {
    render(
      <BotRowActions bot={makeBot({ botStatus: 'paused' })} locale="en" onStatusChange={vi.fn()} onError={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('dispatches pause action and calls onStatusChange with paused', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const onStatusChange = vi.fn();
    const user = userEvent.setup();
    render(<BotRowActions bot={makeBot({ id: 'b-99', botStatus: 'live_running' })} locale="en" onStatusChange={onStatusChange} onError={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/bots/b-99', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'pause' }),
      }));
    });
    expect(onStatusChange).toHaveBeenCalledWith('b-99', 'paused');
  });

  it('dispatches resume action and calls onStatusChange with live_running', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const onStatusChange = vi.fn();
    const user = userEvent.setup();
    render(<BotRowActions bot={makeBot({ id: 'b-99', botStatus: 'paused' })} locale="en" onStatusChange={onStatusChange} onError={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/bots/b-99', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'resume' }),
      }));
    });
    expect(onStatusChange).toHaveBeenCalledWith('b-99', 'live_running');
  });

  it('shows Loader2 and disables button while action is in-flight', async () => {
    let resolveReq!: (val: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((res) => { resolveReq = res; }));
    const user = userEvent.setup();
    render(<BotRowActions bot={makeBot({ botStatus: 'live_running' })} locale="en" onStatusChange={vi.fn()} onError={vi.fn()} />);

    const btn = screen.getByRole('button', { name: 'Pause' });
    await user.click(btn);

    expect(btn).toBeDisabled();
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();

    resolveReq({ ok: true, json: async () => ({ ok: true }) });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('invokes onError when API returns ok: false or throws', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'Unauthorized' }) });
    const onError = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <BotRowActions bot={makeBot({ botStatus: 'live_running' })} locale="en" onStatusChange={vi.fn()} onError={onError} />
    );

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Unauthorized'));
    unmount();

    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    render(<BotRowActions bot={makeBot({ botStatus: 'live_running' })} locale="en" onStatusChange={vi.fn()} onError={onError} />);
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Network error'));
  });

  it('renders detail link with correct href', () => {
    render(<BotRowActions bot={makeBot({ id: 'bot-xyz' })} locale="vi" onStatusChange={vi.fn()} onError={vi.fn()} />);
    const link = screen.getByText('Detail');
    expect(link).toHaveAttribute('href', '/vi/bots/bot-xyz');
  });
});
