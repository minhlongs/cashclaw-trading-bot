import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  setupDashboardMocks,
  makeApiBot,
  jsonResponse,
} from './dashboard-test-utils';

setupDashboardMocks();

import DashboardClient from '../dashboard-client';

describe('DashboardClient — Edge Cases & Badge Mappings', () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('single bot and all stopped', () => {
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
        expect(screen.getByText('$5,075')).toBeInTheDocument();
        expect(screen.getAllByText('$75').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('80%').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('1 / 1')).toBeInTheDocument();
        expect(screen.getByText('Solo Bot')).toBeInTheDocument();
      });
    });

    it('shows 0 active bots when all bots stopped or in error', async () => {
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

  describe('KPI edge cases', () => {
    it('shows 100% win rate when all trades are wins', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'w', name: 'Win Bot', totalPnl: 50, winCount: 10, lossCount: 0, status: 'running' }),
        ]),
      );
      render(<DashboardClient />);
      await waitFor(() => {
        expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('shows 0% win rate when all trades are losses or no trades exist', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'l', name: 'Loss Bot', totalPnl: -50, winCount: 0, lossCount: 10, status: 'running' }),
          makeApiBot({ id: 'n', name: 'No Trades', totalPnl: 0, winCount: 0, lossCount: 0, status: 'paused' }),
        ]),
      );
      render(<DashboardClient />);
      await waitFor(() => {
        expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
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
        expect(screen.getAllByText('$5,000').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('$0').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('fetch configuration and status badges', () => {
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

    it('maps error, stopped, and unknown statuses to appropriate badges', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(true, [
          makeApiBot({ id: 'e', name: 'Error Bot', status: 'error' }),
          makeApiBot({ id: 's', name: 'Stopped Bot', status: 'stopped' }),
          makeApiBot({ id: 'u', name: 'Unknown Bot', status: 'custom_status' }),
        ]),
      );
      render(<DashboardClient />);
      await waitFor(() => {
        expect(screen.getByText('error').className).toContain('badge-error');
        expect(screen.getByText('stopped').className).toContain('badge-neutral');
        expect(screen.getByText('custom_status').className).toContain('badge-neutral');
      });
    });
  });
});
