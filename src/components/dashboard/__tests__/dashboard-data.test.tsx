import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  setupDashboardMocks,
  makeApiBot,
  jsonResponse,
  type BotCardDataApi,
} from './dashboard-test-utils';

setupDashboardMocks();

import DashboardClient from '../dashboard-client';

describe('DashboardClient — Loaded with Data', () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

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

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders all four top KPI card headings', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, twoBots));
    render(<DashboardClient />);
    await waitFor(() => {
      expect(screen.getByText('Total Balance')).toBeInTheDocument();
      expect(screen.getByText('Active Bots')).toBeInTheDocument();
      expect(screen.getByText('Total Capital')).toBeInTheDocument();
      expect(screen.getAllByText('Win Rate').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('computes Total Balance as capital + PnL across bots', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, twoBots));
    render(<DashboardClient />);
    await waitFor(() => {
      expect(screen.getByText('$10,130')).toBeInTheDocument();
    });
  });

  it('computes Win Rate correctly', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, twoBots));
    render(<DashboardClient />);
    await waitFor(() => {
      const topMetrics = screen.getAllByText(/6[67]/);
      expect(topMetrics.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('computes Active Bots count (running or active status)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, twoBots));
    render(<DashboardClient />);
    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });
  });

  it('displays bot cards and pairs in a grid', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, twoBots));
    render(<DashboardClient />);
    await waitFor(() => {
      expect(screen.getByText('Grid BTC')).toBeInTheDocument();
      expect(screen.getByText('Mean ETH')).toBeInTheDocument();
      expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
      expect(screen.getByText('ETH/USDT')).toBeInTheDocument();
    });
  });

  it('shows bot status badges with correct classes', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, twoBots));
    render(<DashboardClient />);
    await waitFor(() => {
      const runningBadge = screen.getByText('running');
      expect(runningBadge.className).toContain('badge-success');
      const pausedBadge = screen.getByText('paused');
      expect(pausedBadge.className).toContain('badge-warning');
    });
  });

  it('shows PnL and W/L record per bot', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, twoBots));
    render(<DashboardClient />);
    await waitFor(() => {
      expect(screen.getAllByText('$150').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('$-20').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('12W / 3L')).toBeInTheDocument();
      expect(screen.getByText('4W / 5L')).toBeInTheDocument();
    });
  });

  it('shows bot count in header subtitle and renders new bot link', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, twoBots));
    render(<DashboardClient />);
    await waitFor(() => {
      expect(screen.getByText('2 subtitle')).toBeInTheDocument();
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
      expect(screen.getByText('24')).toBeInTheDocument();
    });
  });

  it('renders strategy visualizer card mounting correctly', async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, twoBots));
    render(<DashboardClient />);
    await waitFor(() => {
      expect(screen.getAllByText('grid').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('meanReversion').length).toBeGreaterThanOrEqual(1);
    });
  });
});
