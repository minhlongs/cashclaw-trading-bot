import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MonitoringClient } from './monitoring-client';
import type { HealthResponse, MetricsResponse, KillswitchResponse } from './monitoring-types';

const health: HealthResponse = { status: 'ok', timestamp: 1720000000000, version: '1.0.0', environment: 'test' };
const metrics: MetricsResponse = {
  bots: { total: 2, running: 1, paused: 1 },
  performance: { totalPnl: 150.5, winRate: 60, totalTrades: 10, totalWins: 6, totalLosses: 4 },
};
const killswitch: KillswitchResponse = {
  enabled: true, halted: false, haltReason: null, haltedAt: null,
  dailyPnl: 25.1, consecutiveLosses: 1, currentDrawdown: 3.5, timestamp: 1720000000000,
};

function jsonResponse(data: unknown): { ok: boolean; json: () => Promise<unknown> } {
  return { ok: true, json: () => Promise.resolve(data) };
}

const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn()
    .mockResolvedValueOnce(jsonResponse(health))
    .mockResolvedValueOnce(jsonResponse(metrics))
    .mockResolvedValueOnce(jsonResponse(killswitch));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; });

describe('MonitoringClient', () => {
  it('renders loading spinner initially', () => {
    render(<MonitoringClient />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('fetches three endpoints and renders cards on success', async () => {
    render(<MonitoringClient />);
    expect(await screen.findByText(/Binh thuong/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
    expect(fetchMock).toHaveBeenCalledWith('/api/metrics');
    expect(fetchMock).toHaveBeenCalledWith('/api/killswitch-status');
  });

  it('renders killswitch card details from fetched data', async () => {
    render(<MonitoringClient />);
    expect(await screen.findByText('+$25.10')).toBeInTheDocument();
  });

  it('shows error message when endpoint fails', async () => {
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(jsonResponse(health))
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce(jsonResponse(killswitch));
    render(<MonitoringClient />);
    expect(await screen.findByText(/One or more API endpoints returned an error/i)).toBeInTheDocument();
  });

  it('shows error message when fetch rejects', async () => {
    fetchMock.mockReset().mockRejectedValue(new Error('Network down'));
    render(<MonitoringClient />);
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });
});
