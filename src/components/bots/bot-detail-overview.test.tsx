import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BotDetailOverview } from './bot-detail-overview';
import type { BotDetailData } from '@/forest/dashboard/actions';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'vi',
}));

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon" {...props} />
  );
  return { ArrowLeft: Icon, Play: Icon, Pause: Icon, RotateCcw: Icon, Settings2: Icon };
});

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeBot(overrides: Partial<BotDetailData> = {}): BotDetailData {
  return {
    id: 'bot-1',
    name: 'Grid Bot',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    botStatus: 'live_running',
    totalPnl: 150.75,
    winCount: 10,
    lossCount: 3,
    capitalAllocated: 5000,
    capitalUsed: 3000,
    maxDrawdownPct: 5.2,
    startedAt: 1700000000000,
    updatedAt: 1700100000000,
    config: { levels: 10 },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('BotDetailOverview', () => {
  describe('basic rendering', () => {
    it('renders exchange name', () => {
      render(<BotDetailOverview bot={makeBot()} />);
      expect(screen.getByText('binance')).toBeInTheDocument();
    });

    it('renders total trades count', () => {
      render(<BotDetailOverview bot={makeBot()} />);
      // winCount(10) + lossCount(3) = 13
      expect(screen.getByText('13')).toBeInTheDocument();
    });

    it('shows dash for null startedAt', () => {
      render(<BotDetailOverview bot={makeBot({ startedAt: null })} />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('renders formatted date for non-null startedAt', () => {
      const bot = makeBot({ startedAt: 1700000000000 });
      render(<BotDetailOverview bot={bot} />);
      const expected = new Date(1700000000000).toLocaleDateString('vi-VN');
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });

  describe('total trades calculation', () => {
    it('computes total from winCount + lossCount', () => {
      render(<BotDetailOverview bot={makeBot({ winCount: 20, lossCount: 5 })} />);
      expect(screen.getByText('25')).toBeInTheDocument();
    });

    it('renders zero when both counts are zero', () => {
      render(<BotDetailOverview bot={makeBot({ winCount: 0, lossCount: 0 })} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('status badge', () => {
    it('renders badge-neutral for draft', () => {
      const { container } = render(<BotDetailOverview bot={makeBot({ botStatus: 'draft' })} />);
      const badge = container.querySelector('.badge-neutral');
      expect(badge).toBeInTheDocument();
    });

    it('renders badge-neutral for paper_test', () => {
      const { container } = render(<BotDetailOverview bot={makeBot({ botStatus: 'paper_test' })} />);
      const badge = container.querySelector('.badge-neutral');
      expect(badge).toBeInTheDocument();
    });

    it('renders badge-running for live_running', () => {
      const { container } = render(<BotDetailOverview bot={makeBot({ botStatus: 'live_running' })} />);
      const badge = container.querySelector('.badge-running');
      expect(badge).toBeInTheDocument();
    });

    it('renders badge-paused for paused', () => {
      const { container } = render(<BotDetailOverview bot={makeBot({ botStatus: 'paused' })} />);
      const badge = container.querySelector('.badge-paused');
      expect(badge).toBeInTheDocument();
    });

    it('renders badge-error for error', () => {
      const { container } = render(<BotDetailOverview bot={makeBot({ botStatus: 'error' })} />);
      const badge = container.querySelector('.badge-error');
      expect(badge).toBeInTheDocument();
    });

    it('renders badge-neutral for unknown status', () => {
      const { container } = render(<BotDetailOverview bot={makeBot({ botStatus: 'unknown' })} />);
      const badge = container.querySelector('.badge-neutral');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('label sections', () => {
    it('renders section labels', () => {
      render(<BotDetailOverview bot={makeBot()} />);
      expect(screen.getByText('Strategy')).toBeInTheDocument();
      expect(screen.getByText('Pair')).toBeInTheDocument();
      expect(screen.getByText('Exchange')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Total Trades')).toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
    });

    it('renders strategy translation key as value', () => {
      render(<BotDetailOverview bot={makeBot({ strategy: 'grid' })} />);
      // useTranslations mock returns key directly
      expect(screen.getByText('bots.strategy.grid')).toBeInTheDocument();
    });

    it('renders pair value', () => {
      render(<BotDetailOverview bot={makeBot({ pair: 'ETH/USDT' })} />);
      expect(screen.getByText('ETH/USDT')).toBeInTheDocument();
    });
  });
});
