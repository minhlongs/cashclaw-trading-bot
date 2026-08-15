import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemHealthCard } from './system-health-card';
import type { HealthResponse, MetricsResponse } from './monitoring-types';

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon" {...props} />
  );
  return { Activity: Icon, Zap: Icon, Bot: Icon };
});

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */
function makeHealth(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    timestamp: Date.now(),
    version: '1.2.3',
    environment: 'production',
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<MetricsResponse> = {}): MetricsResponse {
  return {
    bots: { total: 5, running: 3, paused: 2 },
    performance: {
      totalPnl: 150.75,
      winRate: 62.5,
      totalTrades: 40,
      totalWins: 25,
      totalLosses: 15,
    },
    uptime: 86400,
    timestamp: Date.now(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('SystemHealthCard', () => {
  it('renders Healthy when status is ok', () => {
    render(<SystemHealthCard health={makeHealth({ status: 'ok' })} metrics={makeMetrics()} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('renders Degraded when status is not ok', () => {
    render(
      <SystemHealthCard
        health={makeHealth({ status: 'error' })}
        metrics={makeMetrics()}
      />,
    );
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('shows title System Health', () => {
    render(<SystemHealthCard health={makeHealth()} metrics={makeMetrics()} />);
    expect(screen.getByText('System Health')).toBeInTheDocument();
  });

  it('renders uptime formatted', () => {
    render(
      <SystemHealthCard health={makeHealth()} metrics={makeMetrics({ uptime: 3660 })} />,
    );
    expect(screen.getByText('1h 1m')).toBeInTheDocument();
  });

  it('renders version', () => {
    render(
      <SystemHealthCard health={makeHealth({ version: '2.0.1' })} metrics={makeMetrics()} />,
    );
    expect(screen.getByText('2.0.1')).toBeInTheDocument();
  });

  it('renders Production for production environment', () => {
    render(
      <SystemHealthCard
        health={makeHealth({ environment: 'production' })}
        metrics={makeMetrics()}
      />,
    );
    expect(screen.getByText('Production')).toBeInTheDocument();
  });

  it('renders raw environment for non-production', () => {
    render(
      <SystemHealthCard
        health={makeHealth({ environment: 'staging' })}
        metrics={makeMetrics()}
      />,
    );
    expect(screen.getByText('staging')).toBeInTheDocument();
  });
});
