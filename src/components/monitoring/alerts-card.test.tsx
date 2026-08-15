import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertsCard } from './alerts-card';
import type { Alert } from './monitoring-types';

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon" {...props} />
  );
  return { AlertTriangle: Icon };
});

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */
function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: '1',
    level: 'warning',
    message: 'High drawdown detected',
    timestamp: Date.now() - 60_000,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('AlertsCard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the card title', () => {
    render(<AlertsCard alerts={[]} />);
    expect(screen.getByText('Canh bao gan day')).toBeInTheDocument();
  });

  it('shows empty message when no alerts', () => {
    render(<AlertsCard alerts={[]} />);
    expect(screen.getByText('Khong co canh bao nao')).toBeInTheDocument();
  });

  it('shows a zero count badge when no alerts', () => {
    render(<AlertsCard alerts={[]} />);
    expect(screen.getByText('0')).toHaveClass('badge-neutral');
  });

  it('shows the alert count in the header badge', () => {
    render(
      <AlertsCard
        alerts={[
          makeAlert({ id: 'a1' }),
          makeAlert({ id: 'a2' }),
          makeAlert({ id: 'a3' }),
        ]}
      />,
    );
    expect(screen.getByText('3')).toHaveClass('badge-neutral');
  });

  it('renders a single alert', () => {
    render(
      <AlertsCard
        alerts={[makeAlert({ id: 'a1', message: 'Test warning' })]}
      />,
    );
    expect(screen.getByText('Test warning')).toBeInTheDocument();
  });

  it('renders multiple alerts', () => {
    render(
      <AlertsCard
        alerts={[
          makeAlert({ id: 'a1', message: 'First alert' }),
          makeAlert({ id: 'a2', message: 'Second alert' }),
        ]}
      />,
    );
    expect(screen.getByText('First alert')).toBeInTheDocument();
    expect(screen.getByText('Second alert')).toBeInTheDocument();
  });

  it('displays the alert level badge uppercased', () => {
    render(
      <AlertsCard alerts={[makeAlert({ id: 'a1', level: 'critical' })]} />,
    );
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });

  it('maps each level to its badge class', () => {
    render(
      <AlertsCard
        alerts={[
          makeAlert({ id: 'i', level: 'info' }),
          makeAlert({ id: 'w', level: 'warning' }),
          makeAlert({ id: 'e', level: 'error' }),
          makeAlert({ id: 'c', level: 'critical' }),
        ]}
      />,
    );
    expect(screen.getByText('INFO')).toHaveClass('badge-neutral');
    expect(screen.getByText('WARNING')).toHaveClass('badge-warning');
    expect(screen.getByText('ERROR')).toHaveClass('badge-error');
    expect(screen.getByText('CRITICAL')).toHaveClass('badge-error');
  });

  it('displays relative timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    render(
      <AlertsCard
        alerts={[makeAlert({ id: 'a1', timestamp: Date.now() - 120_000 })]}
      />,
    );
    expect(screen.getByText('2m ago')).toBeInTheDocument();
  });
});
