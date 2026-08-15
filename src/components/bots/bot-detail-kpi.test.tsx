import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BotDetailKpi } from './bot-detail-kpi';
import type { BotDetailData } from '@/forest/dashboard/actions';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon" {...props} />
  );
  return { TrendingUp: Icon, TrendingDown: Icon };
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

describe('BotDetailKpi', () => {
  describe('Total P&L card', () => {
    it('shows positive P&L with + prefix and profit class', () => {
      const { container } = render(<BotDetailKpi bot={makeBot({ totalPnl: 150.75 })} />);
      expect(screen.getByText('+150.75')).toBeInTheDocument();
      const profitEl = container.querySelector('.profit');
      expect(profitEl).toBeInTheDocument();
    });

    it('shows negative P&L without + prefix and loss class', () => {
      const { container } = render(<BotDetailKpi bot={makeBot({ totalPnl: -100 })} />);
      expect(screen.getByText('-100.00')).toBeInTheDocument();
      const lossEl = container.querySelector('.loss');
      expect(lossEl).toBeInTheDocument();
    });

    it('shows zero P&L with + prefix and profit class', () => {
      render(<BotDetailKpi bot={makeBot({ totalPnl: 0 })} />);
      expect(screen.getByText('+0.00')).toBeInTheDocument();
    });

    it('calculates P&L percentage from capitalAllocated', () => {
      render(<BotDetailKpi bot={makeBot({ totalPnl: 500, capitalAllocated: 10000 })} />);
      expect(screen.getByText('+5.00%')).toBeInTheDocument();
    });

    it('shows negative P&L percentage', () => {
      render(<BotDetailKpi bot={makeBot({ totalPnl: -250, capitalAllocated: 5000 })} />);
      expect(screen.getByText('+-5.00%')).toBeInTheDocument();
    });

    it('renders TrendingUp icon for profit', () => {
      render(<BotDetailKpi bot={makeBot({ totalPnl: 100 })} />);
      const icons = screen.getAllByTestId('icon');
      expect(icons.some((el) => el.getAttribute('class')?.includes('profit') || el.closest('.profit'))).toBe(true);
    });

    it('renders TrendingDown icon for loss', () => {
      render(<BotDetailKpi bot={makeBot({ totalPnl: -100 })} />);
      const icons = screen.getAllByTestId('icon');
      expect(icons.some((el) => el.getAttribute('class')?.includes('loss') || el.closest('.loss'))).toBe(true);
    });
  });

  describe('Win Rate card', () => {
    it('calculates win rate from winCount and lossCount', () => {
      render(<BotDetailKpi bot={makeBot({ winCount: 7, lossCount: 3 })} />);
      expect(screen.getByText('70.0%')).toBeInTheDocument();
    });

    it('shows 0% when no trades', () => {
      render(<BotDetailKpi bot={makeBot({ winCount: 0, lossCount: 0 })} />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('shows 100% when all wins', () => {
      render(<BotDetailKpi bot={makeBot({ winCount: 5, lossCount: 0 })} />);
      expect(screen.getByText('100.0%')).toBeInTheDocument();
    });

    it('shows 0.0% when all losses but trades exist', () => {
      render(<BotDetailKpi bot={makeBot({ winCount: 0, lossCount: 5 })} />);
      expect(screen.getByText('0.0%')).toBeInTheDocument();
    });

    it('renders W/L count breakdown', () => {
      render(<BotDetailKpi bot={makeBot({ winCount: 10, lossCount: 3 })} />);
      expect(screen.getByText('10W / 3L')).toBeInTheDocument();
    });
  });

  describe('Capital Used card', () => {
    it('shows capital used with locale formatting', () => {
      render(<BotDetailKpi bot={makeBot({ capitalUsed: 3000, capitalAllocated: 5000 })} />);
      expect(screen.getByText('$3,000')).toBeInTheDocument();
    });

    it('shows allocated capital with percentage', () => {
      render(<BotDetailKpi bot={makeBot({ capitalUsed: 3000, capitalAllocated: 5000 })} />);
      expect(screen.getByText('/ $5,000 (60%)')).toBeInTheDocument();
    });

    it('shows 0% when capitalUsed is 0', () => {
      render(<BotDetailKpi bot={makeBot({ capitalUsed: 0, capitalAllocated: 5000 })} />);
      expect(screen.getByText('/ $5,000 (0%)')).toBeInTheDocument();
    });

    it('shows 100% when fully allocated', () => {
      render(<BotDetailKpi bot={makeBot({ capitalUsed: 10000, capitalAllocated: 10000 })} />);
      expect(screen.getByText('/ $10,000 (100%)')).toBeInTheDocument();
    });
  });

  describe('Max Drawdown card', () => {
    it('shows drawdown percentage with warning text', () => {
      render(<BotDetailKpi bot={makeBot({ maxDrawdownPct: 5.2 })} />);
      expect(screen.getByText('-5.2%')).toBeInTheDocument();
      expect(screen.getByText('Giới hạn 20%')).toBeInTheDocument();
    });

    it('renders text-warning class for drawdown', () => {
      const { container } = render(<BotDetailKpi bot={makeBot({ maxDrawdownPct: 10 })} />);
      const warningEl = container.querySelector('.text-warning');
      expect(warningEl).toBeInTheDocument();
    });
  });

  describe('KPI labels', () => {
    it('renders all KPI labels', () => {
      render(<BotDetailKpi bot={makeBot()} />);
      expect(screen.getByText('Total P&L')).toBeInTheDocument();
      expect(screen.getByText('Win Rate')).toBeInTheDocument();
      expect(screen.getByText('Capital Used')).toBeInTheDocument();
      expect(screen.getByText('Max Drawdown')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('handles very large P&L values', () => {
      render(<BotDetailKpi bot={makeBot({ totalPnl: 1234567.89, capitalAllocated: 1000000 })} />);
      // toFixed(2) does not add locale separators
      expect(screen.getByText('+1234567.89')).toBeInTheDocument();
    });

    it('handles single decimal win rate', () => {
      render(<BotDetailKpi bot={makeBot({ winCount: 1, lossCount: 2 })} />);
      expect(screen.getByText('33.3%')).toBeInTheDocument();
    });
  });
});
