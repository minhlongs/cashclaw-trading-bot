import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BotsListClient from './bots-list-client';
import type { BotCardData } from '@/forest/dashboard/actions';

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="icon" {...props} />;
  return { Plus: Icon, Search: Icon, Filter: Icon, Play: Icon, Pause: Icon, Loader2: Icon };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => 'vi',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>
  ),
}));

function makeBot(overrides: Partial<BotCardData> = {}): BotCardData {
  return {
    id: 'bot-1', name: 'Grid BTC', strategy: 'grid', pair: 'BTC/USDT', exchange: 'binance',
    botStatus: 'live_running', totalPnl: 123.45, winCount: 10, lossCount: 3, startedAt: 1,
    updatedAt: 2, capitalAllocated: 5000, maxDrawdownPct: 2.5, ...overrides,
  };
}

const sampleBots: BotCardData[] = [
  makeBot({ id: 'bot-1', name: 'Grid BTC', botStatus: 'live_running' }),
  makeBot({ id: 'bot-2', name: 'Mean ETH', pair: 'ETH/USDT', strategy: 'mean_reversion', botStatus: 'paused' }),
  makeBot({ id: 'bot-3', name: 'Draft Bot', botStatus: 'draft' }),
];

describe('BotsListClient', () => {
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

  it('shows loading state before data arrives', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<BotsListClient />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders bot table and headers after successful fetch', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: sampleBots }) });
    render(<BotsListClient />);

    await waitFor(() => expect(screen.getByText('Grid BTC')).toBeInTheDocument());
    expect(screen.getByText('Mean ETH')).toBeInTheDocument();
    expect(screen.getByText('Draft Bot')).toBeInTheDocument();
    expect(screen.getByText('bots.columns.name')).toBeInTheDocument();
    const link = screen.getByText('bots.createNew');
    expect(link.closest('a')).toHaveAttribute('href', '/vi/bots/new');
  });

  it('shows error when fetch fails and retry button reloads page', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const reloadSpy = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload: reloadSpy } as unknown as Location);

    render(<BotsListClient />);
    await waitFor(() => expect(screen.getByText('Failed to fetch bots')).toBeInTheDocument());

    const retryBtn = screen.getByRole('button', { name: /thử lại|try again/i });
    await userEvent.click(retryBtn);
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('filters bots by name and pair in search input', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: sampleBots }) });
    const user = userEvent.setup();
    render(<BotsListClient />);
    await waitFor(() => expect(screen.getByText('Grid BTC')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('common.search'), 'ETH');
    expect(screen.getByText('Mean ETH')).toBeInTheDocument();
    expect(screen.queryByText('Grid BTC')).not.toBeInTheDocument();
  });

  it('filters bots by status dropdown and shows empty state when no match', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: sampleBots }) });
    const user = userEvent.setup();
    render(<BotsListClient />);
    await waitFor(() => expect(screen.getByText('Grid BTC')).toBeInTheDocument());

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'paused');
    expect(screen.getByText('Mean ETH')).toBeInTheDocument();
    expect(screen.queryByText('Grid BTC')).not.toBeInTheDocument();

    await user.selectOptions(select, 'error');
    expect(screen.getByText('bots.actions.noBotsFound')).toBeInTheDocument();
  });

  it('applies search and status filters simultaneously', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: sampleBots }) });
    const user = userEvent.setup();
    render(<BotsListClient />);
    await waitFor(() => expect(screen.getByText('Grid BTC')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('common.search'), 'ETH');
    await user.selectOptions(screen.getByRole('combobox'), 'paused');
    expect(screen.getByText('Mean ETH')).toBeInTheDocument();
    expect(screen.queryByText('Grid BTC')).not.toBeInTheDocument();
  });

  it('updates bot status reactively on row action success', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: sampleBots }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    const user = userEvent.setup();
    render(<BotsListClient />);
    await waitFor(() => expect(screen.getByText('Grid BTC')).toBeInTheDocument());

    const pauseBtns = screen.getAllByRole('button', { name: 'bots.actions.pause' });
    await user.click(pauseBtns[0]);

    await waitFor(() => {
      expect(screen.getAllByText('paused')).toHaveLength(2);
    });
  });

  it('renders dismissible error banner when row action fails', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: sampleBots }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, error: 'Start action rejected' }) });

    const user = userEvent.setup();
    render(<BotsListClient />);
    await waitFor(() => expect(screen.getByText('Grid BTC')).toBeInTheDocument());

    const pauseBtns = screen.getAllByRole('button', { name: 'bots.actions.pause' });
    await user.click(pauseBtns[0]);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('Start action rejected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
