import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BotsListClient from './bots-list-client';
import type { BotCardData } from '@/forest/dashboard/actions';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon" {...props} />
  );
  return { Plus: Icon, Search: Icon, Filter: Icon, Play: Icon, Pause: Icon };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'vi',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeBot(overrides: Partial<BotCardData> = {}): BotCardData {
  return {
    id: 'bot-1',
    name: 'Grid BTC',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    botStatus: 'live_running',
    totalPnl: 123.45,
    winCount: 10,
    lossCount: 3,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_100_000_000,
    capitalAllocated: 5000,
    maxDrawdownPct: 2.5,
    ...overrides,
  };
}

const sampleBots: BotCardData[] = [
  makeBot({ id: 'bot-1', name: 'Grid BTC', botStatus: 'live_running' }),
  makeBot({ id: 'bot-2', name: 'Mean ETH', strategy: 'mean_reversion', botStatus: 'paused' }),
  makeBot({ id: 'bot-3', name: 'Draft Bot', botStatus: 'draft' }),
];

function mockFetchOk(bots: BotCardData[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, data: bots }),
  });
}

function mockFetchFail() {
  fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
}

function mockFetchError() {
  fetchMock.mockRejectedValue(new Error('Network error'));
}

/* ------------------------------------------------------------------ */
/* Setup / Teardown                                                   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('BotsListClient', () => {
  it('shows loading state before data arrives', () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<BotsListClient />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders bot table after successful fetch', async () => {
    mockFetchOk(sampleBots);
    render(<BotsListClient />);

    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });
    expect(screen.getByText('Mean ETH')).toBeInTheDocument();
    expect(screen.getByText('Draft Bot')).toBeInTheDocument();
  });

  it('renders table headers', async () => {
    mockFetchOk(sampleBots);
    render(<BotsListClient />);

    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });

    expect(screen.getByText('bots.columns.name')).toBeInTheDocument();
    expect(screen.getByText('bots.columns.strategy')).toBeInTheDocument();
    expect(screen.getByText('bots.columns.pair')).toBeInTheDocument();
    expect(screen.getByText('bots.columns.status')).toBeInTheDocument();
    expect(screen.getByText('bots.columns.pnl')).toBeInTheDocument();
  });

  it('renders "Create New Bot" link pointing to /vi/bots/new', async () => {
    mockFetchOk(sampleBots);
    render(<BotsListClient />);

    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });

    const link = screen.getByText('bots.createNew');
    expect(link.closest('a')).toHaveAttribute('href', '/vi/bots/new');
  });

  /* ---- Error state ---- */

  it('shows error when fetch returns non-ok response', async () => {
    mockFetchFail();
    render(<BotsListClient />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch bots')).toBeInTheDocument();
    });
  });

  it('shows error when fetch throws', async () => {
    mockFetchError();
    render(<BotsListClient />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch bots')).toBeInTheDocument();
    });
  });

  it('retry button triggers page reload', async () => {
    mockFetchFail();
    const reloadSpy = vi.fn();
    // window.location is read-only in jsdom, replace with spy
    vi.spyOn(window, 'location', 'get').mockReturnValue({ reload: reloadSpy } as any);

    render(<BotsListClient />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch bots')).toBeInTheDocument();
    });

    // Button text is the hardcoded "Thử lại / Try again" string
    const retryBtn = screen.getByRole('button', { name: /thử lại|try again/i });
    await userEvent.click(retryBtn);
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('shows error when API payload lacks ok or bots array', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'unauthorized' }),
    });
    render(<BotsListClient />);

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch bots')).toBeInTheDocument();
    });
  });

  /* ---- Search filter ---- */

  it('filters bots by name via search input', async () => {
    mockFetchOk(sampleBots);
    const user = userEvent.setup();

    render(<BotsListClient />);
    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('common.search'), 'Grid');

    expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    expect(screen.queryByText('Mean ETH')).not.toBeInTheDocument();
    expect(screen.queryByText('Draft Bot')).not.toBeInTheDocument();
  });

  it('filters bots by pair via search input', async () => {
    mockFetchOk(sampleBots);
    const user = userEvent.setup();

    render(<BotsListClient />);
    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('common.search'), 'ETH');

    expect(screen.getByText('Mean ETH')).toBeInTheDocument();
    expect(screen.queryByText('Grid BTC')).not.toBeInTheDocument();
  });

  it('shows no-bots-found when search matches nothing', async () => {
    mockFetchOk(sampleBots);
    const user = userEvent.setup();

    render(<BotsListClient />);
    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('common.search'), 'zzz_nonexistent');

    expect(screen.getByText(/Không tìm thấy bot|No bots found/)).toBeInTheDocument();
  });

  /* ---- Status filter ---- */

  it('filters bots by status dropdown', async () => {
    mockFetchOk(sampleBots);
    const user = userEvent.setup();

    render(<BotsListClient />);
    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'paused');

    expect(screen.getByText('Mean ETH')).toBeInTheDocument();
    expect(screen.queryByText('Grid BTC')).not.toBeInTheDocument();
    expect(screen.queryByText('Draft Bot')).not.toBeInTheDocument();
  });

  it('shows no-bots-found when status filter matches nothing', async () => {
    mockFetchOk(sampleBots);
    const user = userEvent.setup();

    render(<BotsListClient />);
    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByRole('combobox'), 'error');

    expect(screen.getByText(/Không tìm thấy bot|No bots found/)).toBeInTheDocument();
  });

  /* ---- Combined filters ---- */

  it('applies search and status filter together', async () => {
    mockFetchOk(sampleBots);
    const user = userEvent.setup();

    render(<BotsListClient />);
    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });

    // Filter by paused status + search for ETH
    await user.type(screen.getByPlaceholderText('common.search'), 'ETH');
    await user.selectOptions(screen.getByRole('combobox'), 'paused');

    // Only Mean ETH matches both paused + "ETH"
    expect(screen.getByText('Mean ETH')).toBeInTheDocument();
    expect(screen.queryByText('Grid BTC')).not.toBeInTheDocument();
    expect(screen.queryByText('Draft Bot')).not.toBeInTheDocument();
  });

  /* ---- Status badge rendering ---- */

  it('renders status badge text for each bot', async () => {
    mockFetchOk(sampleBots);
    render(<BotsListClient />);

    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
    });

    // StatusBadge renders the raw status string inside a <span>
    expect(screen.getByText('live_running')).toBeInTheDocument();
    expect(screen.getByText('paused')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  /* ---- Empty initial state ---- */

  it('shows no-bots-found when API returns empty array', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: [] }),
    });
    render(<BotsListClient />);

    await waitFor(() => {
      expect(screen.getByText(/Không tìm thấy bot|No bots found/)).toBeInTheDocument();
    });
  });
});
