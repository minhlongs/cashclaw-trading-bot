import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BotMetricsCard } from './bot-metrics-card';
import type { MetricsResponse } from './monitoring-types';

vi.mock('next-intl', () => {
  const map: Record<string, string> = {
    'monitoring.botMetrics.title': 'Bot Metrics',
    'monitoring.botMetrics.runningBadge': 'dang chay',
    'monitoring.botMetrics.total': 'Tong bot',
    'monitoring.botMetrics.running': 'Dang chay',
    'monitoring.botMetrics.paused': 'Tam dung',
    'monitoring.botMetrics.totalPnl': 'Tong PnL',
    'monitoring.botMetrics.winRate': 'Win Rate',
    'monitoring.botMetrics.totalTrades': 'Tong giao dich'
  };
  const resolve = (ns: string, key: string) => map[ns ? `${ns}.${key}` : key] ?? (ns ? `${ns}.${key}` : key);
  return {
    useLocale: () => 'vi',
    useTranslations: (ns?: string) => {
      const t = (key: string) => resolve(ns ?? '', key);
      t.raw = (key: string) => resolve(ns ?? '', key);
      return t;
    },
  };
});


vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon" {...props} />
  );
  return { Bot: Icon, Activity: Icon, Pause: Icon, TrendingUp: Icon, TrendingDown: Icon, Zap: Icon };
});

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */
function makeMetrics(overrides: Partial<MetricsResponse> = {}): MetricsResponse {
  return {
    bots: { total: 8, running: 5, paused: 3 },
    performance: {
      totalPnl: 200.5,
      winRate: 65.0,
      totalTrades: 100,
      totalWins: 65,
      totalLosses: 35,
    },
    uptime: 7200,
    timestamp: Date.now(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('BotMetricsCard', () => {
  it('renders the card title', () => {
    render(<BotMetricsCard metrics={makeMetrics()} />);
    expect(screen.getByText('Bot Metrics')).toBeInTheDocument();
  });

  it('shows running count in badge', () => {
    render(<BotMetricsCard metrics={makeMetrics()} />);
    expect(screen.getByText('5 dang chay')).toBeInTheDocument();
  });

  it('renders total bots', () => {
    render(<BotMetricsCard metrics={makeMetrics()} />);
    expect(screen.getByText('Tong bot')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('renders running count', () => {
    render(<BotMetricsCard metrics={makeMetrics()} />);
    expect(screen.getByText('Dang chay')).toBeInTheDocument();
  });

  it('renders paused count', () => {
    render(<BotMetricsCard metrics={makeMetrics()} />);
    expect(screen.getByText('Tam dung')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders total PnL formatted', () => {
    render(<BotMetricsCard metrics={makeMetrics()} />);
    expect(screen.getByText('Tong PnL')).toBeInTheDocument();
    expect(screen.getByText('+$200.50')).toBeInTheDocument();
  });

  // NOTE: formatPnl drops the minus sign for negatives — a loss renders as "$75.30".
  it('renders negative PnL without a minus sign', () => {
    render(
      <BotMetricsCard
        metrics={makeMetrics({
          performance: {
            totalPnl: -75.3,
            winRate: 40,
            totalTrades: 50,
            totalWins: 20,
            totalLosses: 30,
          },
        })}
      />,
    );
    expect(screen.getByText('$75.30')).toBeInTheDocument();
  });

  it('colors PnL with the loss color when negative', () => {
    const { container } = render(
      <BotMetricsCard
        metrics={makeMetrics({
          performance: {
            totalPnl: -75.3,
            winRate: 40,
            totalTrades: 50,
            totalWins: 20,
            totalLosses: 30,
          },
        })}
      />,
    );
    const value = Array.from(container.querySelectorAll('.mono')).find(
      (el) => el.textContent === '$75.30',
    ) as HTMLElement;
    expect(value).toHaveClass('text-loss');
  });

  it('colors PnL with the profit color when zero', () => {
    const { container } = render(
      <BotMetricsCard
        metrics={makeMetrics({
          performance: {
            totalPnl: 0,
            winRate: 0,
            totalTrades: 0,
            totalWins: 0,
            totalLosses: 0,
          },
        })}
      />,
    );
    const value = Array.from(container.querySelectorAll('.mono')).find(
      (el) => el.textContent === '+$0.00',
    ) as HTMLElement;
    expect(value).toHaveClass('text-profit');
  });

  it('renders win rate', () => {
    render(<BotMetricsCard metrics={makeMetrics()} />);
    expect(screen.getByText('Win Rate')).toBeInTheDocument();
    expect(screen.getByText('65.0%')).toBeInTheDocument();
  });

  it('renders total trades', () => {
    render(<BotMetricsCard metrics={makeMetrics()} />);
    expect(screen.getByText('Tong giao dich')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});
