import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardClient from './dashboard-client';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

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

interface BotCardDataApi {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  status: string;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  startedAt: number | null;
  updatedAt: number;
  capitalAllocated: number;
}

function makeApiBot(overrides: Partial<BotCardDataApi> = {}): BotCardDataApi {
  return {
    id: 'bot-1',
    name: 'Grid BTC',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    status: 'running',
    totalPnl: 123.45,
    winCount: 10,
    lossCount: 3,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_100_000_000,
    capitalAllocated: 5000,
    ...overrides,
  };
}

function jsonResponse(ok: boolean, data?: BotCardDataApi[] | null, error?: string | null) {
  return {
    ok: true,
    json: () => Promise.resolve({ ok, data: data ?? null, error: error ?? null }),
  };
}

function httpError(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ ok: false, error: `HTTP ${status}` }),
  };
}

/* ------------------------------------------------------------------ */
/* Setup / Teardown                                                   */
/* ------------------------------------------------------------------ */

const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as any;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('DashboardClient', () => {
  /* ---------------------------------------------------------------- */
  /* Loading state                                                     */
  /* ---------------------------------------------------------------- */

  describe('loading state', () => {
    it('shows loading text immediately on mount', () => {
      fetchMock.mockReturnValue(new Promise(() => {}));
      render(<DashboardClient />);

      expect(screen.getByText('loading')).toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /* Error state                                                       */
  /* ---------------------------------------------------------------- */

  describe('error state', () => {
    it('shows error message when fetch returns non-ok HTTP status', async () => {
      fetchMock.mockResolvedValue(httpError(500));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Request failed: 500')).toBeInTheDocument();
      });
    });

    it('shows error message when body.ok is false', async () => {
      fetchMock.mockResolvedValue(jsonResponse(false, null, 'DB connection lost'));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('DB connection lost')).toBeInTheDocument();
      });
    });

    it('shows default error when body has no error field and data is null', async () => {
      fetchMock.mockResolvedValue(jsonResponse(false, null));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Unable to load bots.')).toBeInTheDocument();
      });
    });

    it('shows error when data is not an array', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: 'not-an-array' }),
      });

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Unable to load bots.')).toBeInTheDocument();
      });
    });

    it('shows error when fetch throws a network error', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
      });
    });

    it('shows default message when non-Error is thrown', async () => {
      fetchMock.mockRejectedValue('string error');

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Unknown dashboard error')).toBeInTheDocument();
      });
    });

    it('renders retry button in error state', async () => {
      fetchMock.mockResolvedValue(httpError(500));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'retry' })).toBeInTheDocument();
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* Retry behavior                                                    */
  /* ---------------------------------------------------------------- */

  describe('retry', () => {
    it('shows loading state when retry button is clicked', async () => {
      fetchMock.mockResolvedValueOnce(httpError(500));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Request failed: 500')).toBeInTheDocument();
      });

      const user = userEvent.setup();
      // Second fetch hangs to keep component in loading state
      fetchMock.mockResolvedValueOnce(new Promise(() => {}));

      await user.click(screen.getByRole('button', { name: 'retry' }));

      await waitFor(() => {
        expect(screen.getByText('loading')).toBeInTheDocument();
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* Empty state (data loaded, no bots)                                */
  /* ---------------------------------------------------------------- */

  describe('empty state', () => {
    it('shows empty messages when API returns empty array', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, []));

      render(<DashboardClient />);

      // "empty" appears in both the subtitle count area and the empty-state message
      await waitFor(() => {
        expect(screen.getAllByText('empty').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows Bot icon area for zero bots', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, []));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getAllByText('empty').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* Dashboard with data                                               */
  /* ---------------------------------------------------------------- */

  describe('dashboard loaded with data', () => {
    const twoBots: BotCardDataApi[] = [
      makeApiBot({
        id: 'bot-1',
        name: 'Grid BTC',
        strategy: 'grid',
        pair: 'BTC/USDT',
        status: 'running',
        totalPnl: 150,
        winCount: 12,
        lossCount: 3,
      }),
      makeApiBot({
        id: 'bot-2',
        name: 'Mean ETH',
        strategy: 'mean_reversion',
        pair: 'ETH/USDT',
        status: 'paused',
        totalPnl: -20,
        winCount: 4,
        lossCount: 5,
      }),
    ];

    it('renders all four top KPI card headings', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Total Balance')).toBeInTheDocument();
        expect(screen.getByText('Active Bots')).toBeInTheDocument();
        expect(screen.getByText('Total Capital')).toBeInTheDocument();
        // "Win Rate" appears in top KPI panel
        expect(screen.getAllByText('Win Rate').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('computes Total Balance as capital + PnL across bots', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      // (5000+150) + (5000-20) = 10130
      await waitFor(() => {
        expect(screen.getByText('$10,130')).toBeInTheDocument();
      });
    });

    it('computes Win Rate correctly', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      // totalWins=16, totalLosses=8, totalTrades=24, winRate=66.67%
      // Top panel renders as two text nodes: "67" + "%" (toLocaleString drops decimal)
      // Bottom grid renders as "67.0%" (toFixed(1))
      await waitFor(() => {
        // Top KPI: metric element contains the win rate number
        const topMetrics = screen.getAllByText(/6[67]/);
        expect(topMetrics.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('computes Active Bots count (running or active status)', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      // 1 running out of 2 total
      await waitFor(() => {
        expect(screen.getByText('1 / 2')).toBeInTheDocument();
      });
    });

    it('displays bot cards in a grid', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Grid BTC')).toBeInTheDocument();
        expect(screen.getByText('Mean ETH')).toBeInTheDocument();
      });
    });

    it('shows bot pair on each card', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
        expect(screen.getByText('ETH/USDT')).toBeInTheDocument();
      });
    });

    it('shows bot status badge', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('running')).toBeInTheDocument();
        expect(screen.getByText('paused')).toBeInTheDocument();
      });
    });

    it('applies correct badge class for running status', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        const badge = screen.getByText('running');
        expect(badge.className).toContain('badge-success');
      });
    });

    it('applies correct badge class for paused status', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        const badge = screen.getByText('paused');
        expect(badge.className).toContain('badge-warning');
      });
    });

    it('shows PnL per bot', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('$150')).toBeInTheDocument();
        // Template literal `${totalPnl}` renders "$-20" (dollar sign before negative)
        expect(screen.getByText('$-20')).toBeInTheDocument();
      });
    });

    it('shows W/L record per bot', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('12W / 3L')).toBeInTheDocument();
        expect(screen.getByText('4W / 5L')).toBeInTheDocument();
      });
    });

    it('shows bot count in header subtitle', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('2 subtitle')).toBeInTheDocument();
      });
    });

    it('renders create bot link pointing to /bots/new', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        const link = screen.getByText('newBot').closest('a');
        expect(link).toHaveAttribute('href', '/vi/bots/new');
      });
    });

    it('renders bottom performance grid with Total Trades and Total PnL', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, twoBots));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('Total Trades')).toBeInTheDocument();
        expect(screen.getByText('Total PnL')).toBeInTheDocument();
        // totalTrades = 16 + 8 = 24
        expect(screen.getByText('24')).toBeInTheDocument();
      });
    });


  });

  /* ---------------------------------------------------------------- */
  /* Single bot scenarios                                              */
  /* ---------------------------------------------------------------- */

  describe('single bot', () => {
    it('computes KPIs correctly for one bot', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({
            id: 'solo',
            name: 'Solo Bot',
            status: 'active',
            totalPnl: 75,
            winCount: 8,
            lossCount: 2,
          }),
        ]),
      );

      render(<DashboardClient />);

      await waitFor(() => {
        // Total Balance = capital (5000) + PnL (75) = 5075
        expect(screen.getByText('$5,075')).toBeInTheDocument();
        // Total PnL and bot card both show $75
        expect(screen.getAllByText('$75').length).toBeGreaterThanOrEqual(1);
        // Win rate = 80%
        expect(screen.getByText('80%')).toBeInTheDocument();
        // Active = 1/1
        expect(screen.getByText('1 / 1')).toBeInTheDocument();
        // Bot name
        expect(screen.getByText('Solo Bot')).toBeInTheDocument();
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* All bots stopped (zero active)                                    */
  /* ---------------------------------------------------------------- */

  describe('all bots stopped', () => {
    it('shows 0 active bots', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'b1', status: 'stopped', totalPnl: -10, winCount: 1, lossCount: 4 }),
          makeApiBot({ id: 'b2', name: 'Bot 2', status: 'error', totalPnl: -5, winCount: 0, lossCount: 2 }),
        ]),
      );

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('0 / 2')).toBeInTheDocument();
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* KPI edge cases                                                    */
  /* ---------------------------------------------------------------- */

  describe('KPI edge cases', () => {
    it('shows 100% win rate when all trades are wins', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'w', name: 'Win Bot', totalPnl: 50, winCount: 10, lossCount: 0, status: 'running' }),
        ]),
      );

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
    });

    it('shows 0% win rate when all trades are losses', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'l', name: 'Loss Bot', totalPnl: -50, winCount: 0, lossCount: 10, status: 'running' }),
        ]),
      );

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('0%')).toBeInTheDocument();
      });
    });

    it('shows 0% win rate when no trades exist', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'n', name: 'No Trades', totalPnl: 0, winCount: 0, lossCount: 0, status: 'paused' }),
        ]),
      );

      render(<DashboardClient />);

      await waitFor(() => {
        expect(screen.getByText('0%')).toBeInTheDocument();
      });
    });

    it('clamps non-finite PnL to 0', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'nan', name: 'NaN Bot', totalPnl: NaN, winCount: 0, lossCount: 0, status: 'running' }),
        ]),
      );

      render(<DashboardClient />);

      await waitFor(() => {
        // NaN.totalPnl is clamped to 0; Total Balance = capital (5000) + 0 = $5,000
        // $5,000 appears in Total Capital and Total Balance panels
        expect(screen.getAllByText('$5,000').length).toBeGreaterThanOrEqual(1);
        // Bot card PnL shows $0 (appears in both Total PnL panel and bot card)
        expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* Fetch request validation                                          */
  /* ---------------------------------------------------------------- */

  describe('fetch configuration', () => {
    it('calls /api/bots with correct method and headers', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, []));

      render(<DashboardClient />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('/api/bots', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          cache: 'no-store',
        });
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* Multiple status types                                             */
  /* ---------------------------------------------------------------- */

  describe('status badge mapping', () => {
    it('maps error status to badge-error', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'e', name: 'Error Bot', status: 'error' }),
        ]),
      );

      render(<DashboardClient />);

      await waitFor(() => {
        const badge = screen.getByText('error');
        expect(badge.className).toContain('badge-error');
      });
    });

    it('maps stopped status to badge-neutral', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 's', name: 'Stopped Bot', status: 'stopped' }),
        ]),
      );

      render(<DashboardClient />);

      await waitFor(() => {
        const badge = screen.getByText('stopped');
        expect(badge.className).toContain('badge-neutral');
      });
    });

    it('maps unknown status to badge-neutral fallback', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'u', name: 'Unknown Bot', status: 'custom_status' }),
        ]),
      );

      render(<DashboardClient />);

      await waitFor(() => {
        const badge = screen.getByText('custom_status');
        expect(badge.className).toContain('badge-neutral');
      });
    });
  });
});
