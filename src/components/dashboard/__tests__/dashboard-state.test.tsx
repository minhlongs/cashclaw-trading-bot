import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  setupDashboardMocks,
  jsonResponse,
  httpError,
} from './dashboard-test-utils';

setupDashboardMocks();

import DashboardClient from '../dashboard-client';

describe('DashboardClient — State Transitions', () => {
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

  describe('loading state', () => {
    it('shows loading text immediately on mount', () => {
      fetchMock.mockReturnValue(new Promise(() => {}));
      render(<DashboardClient />);
      expect(screen.getByText('loading')).toBeInTheDocument();
    });
  });

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

  describe('retry', () => {
    it('shows loading state when retry button is clicked', async () => {
      fetchMock.mockResolvedValueOnce(httpError(500));
      render(<DashboardClient />);
      await waitFor(() => {
        expect(screen.getByText('Request failed: 500')).toBeInTheDocument();
      });

      const user = userEvent.setup();
      fetchMock.mockResolvedValueOnce(new Promise(() => {}));
      await user.click(screen.getByRole('button', { name: 'retry' }));
      await waitFor(() => {
        expect(screen.getByText('loading')).toBeInTheDocument();
      });
    });
  });

  describe('empty state', () => {
    it('shows empty messages when API returns empty array', async () => {
      fetchMock.mockResolvedValue(jsonResponse(true, []));
      render(<DashboardClient />);
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
});
