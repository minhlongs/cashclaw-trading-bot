import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotDetailClient } from './bot-detail-client';
import type { BotDetailData, TradeRow } from '@/forest/dashboard/actions';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon" {...props} />
  );
  return {
    ArrowLeft: Icon,
    Play: Icon,
    Pause: Icon,
    RotateCcw: Icon,
    Settings2: Icon,
    TrendingUp: Icon,
    TrendingDown: Icon,
    ArrowUp: Icon,
    ArrowDown: Icon,
  };
});

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'vi',
}));

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
    config: { levels: 10, capital_per_level_pct: 20 },
    ...overrides,
  };
}

function makeTrade(overrides: Partial<TradeRow> = {}): TradeRow {
  return {
    id: 't1',
    side: 'buy',
    price: 42000,
    quantity: 0.5,
    pnl: 120.5,
    status: 'filled',
    openedAt: 1700000000000,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('BotDetailClient', () => {
  const bot = makeBot();
  const trades = [makeTrade(), makeTrade({ id: 't2', side: 'sell', pnl: -50 })];

  describe('header', () => {
    it('renders bot name', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      expect(screen.getByRole('heading', { name: 'Grid Bot' })).toBeInTheDocument();
    });

    it('renders bot status badge', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      // live_running appears in header badge and overview StatusBadge
      expect(screen.getAllByText('live_running').length).toBeGreaterThanOrEqual(1);
    });

    it('renders pair badge', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      // BTC/USDT appears in header badge and overview pair value
      expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThanOrEqual(1);
    });

    it('renders strategy badge', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      expect(screen.getByText('grid')).toBeInTheDocument();
    });

    it('renders status badge as running for live_running bot', () => {
      const { container } = render(<BotDetailClient bot={bot} trades={trades} />);
      expect(container.querySelector('.badge-running')).toBeInTheDocument();
    });

    it('renders paused badge for paused bot', () => {
      const { container } = render(<BotDetailClient bot={makeBot({ botStatus: 'paused' })} trades={[]} />);
      expect(container.querySelector('.badge-paused')).toBeInTheDocument();
    });

    it('renders neutral badge for draft bot', () => {
      const { container } = render(<BotDetailClient bot={makeBot({ botStatus: 'draft' })} trades={[]} />);
      expect(container.querySelector('.badge-neutral')).toBeInTheDocument();
    });
  });

  describe('control buttons', () => {
    it('renders Resume, Pause, Reset control buttons', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    });

    it('renders a Config control button', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      // Two Config buttons exist: control + tab; assert at least one control button
      const configButtons = screen.getAllByRole('button', { name: /config/i });
      expect(configButtons.length).toBeGreaterThanOrEqual(2);
    });

    it('clicking control buttons does not crash', async () => {
      const user = userEvent.setup();
      render(<BotDetailClient bot={bot} trades={trades} />);
      // Control buttons have no-op handlers in source; clicking must be safe
      await user.click(screen.getByRole('button', { name: /resume/i }));
      await user.click(screen.getByRole('button', { name: /pause/i }));
      await user.click(screen.getByRole('button', { name: /reset/i }));
      // Still rendering without error
      expect(screen.getByRole('heading', { name: 'Grid Bot' })).toBeInTheDocument();
    });
  });

  describe('back link', () => {
    it('renders back link to /bots', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      const link = screen.getByRole('link', { name: /back to bots/i });
      expect(link).toHaveAttribute('href', '/bots');
    });
  });

  describe('tabs', () => {
    function tabsContainer(): HTMLElement {
      const container = document.body.querySelector<HTMLElement>('.tabs');
      if (!container) throw new Error('tabs container not found');
      return container;
    }

    it('renders all three tabs', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      const tabs = tabsContainer();
      expect(within(tabs).getByRole('button', { name: 'Overview' })).toBeInTheDocument();
      expect(within(tabs).getByRole('button', { name: 'Trade History' })).toBeInTheDocument();
      expect(within(tabs).getByRole('button', { name: 'Config' })).toBeInTheDocument();
    });

    it('defaults to Overview tab active', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      const tabs = tabsContainer();
      expect(within(tabs).getByRole('button', { name: 'Overview' }).className).toContain('active');
    });

    it('switches to Trade History tab on click', async () => {
      const user = userEvent.setup();
      render(<BotDetailClient bot={bot} trades={trades} />);
      const tabs = tabsContainer();
      await user.click(within(tabs).getByRole('button', { name: 'Trade History' }));
      expect(within(tabs).getByRole('button', { name: 'Trade History' }).className).toContain('active');
      expect(within(tabs).getByRole('button', { name: 'Overview' }).className).not.toContain('active');
    });

    it('switches to Config tab on click', async () => {
      const user = userEvent.setup();
      render(<BotDetailClient bot={bot} trades={trades} />);
      const tabs = tabsContainer();
      await user.click(within(tabs).getByRole('button', { name: 'Config' }));
      expect(within(tabs).getByRole('button', { name: 'Config' }).className).toContain('active');
    });

    it('switches back to Overview from Config', async () => {
      const user = userEvent.setup();
      render(<BotDetailClient bot={bot} trades={trades} />);
      const tabs = tabsContainer();
      await user.click(within(tabs).getByRole('button', { name: 'Config' }));
      await user.click(within(tabs).getByRole('button', { name: 'Overview' }));
      expect(within(tabs).getByRole('button', { name: 'Overview' }).className).toContain('active');
    });
  });

  describe('tab content', () => {
    it('shows overview content by default', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      // BotDetailOverview renders these labels
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Total Trades')).toBeInTheDocument();
    });

    it('shows trades content when Trade History tab active', async () => {
      const user = userEvent.setup();
      render(<BotDetailClient bot={bot} trades={trades} />);
      const tabs = document.body.querySelector<HTMLElement>('.tabs');
      if (!tabs) throw new Error('tabs container not found');
      await user.click(within(tabs).getByRole('button', { name: 'Trade History' }));
      expect(screen.getByText('buy')).toBeInTheDocument();
      expect(screen.getByText('sell')).toBeInTheDocument();
    });

    it('shows config content when Config tab active', async () => {
      const user = userEvent.setup();
      render(<BotDetailClient bot={bot} trades={trades} />);
      const tabs = document.body.querySelector<HTMLElement>('.tabs');
      if (!tabs) throw new Error('tabs container not found');
      await user.click(within(tabs).getByRole('button', { name: 'Config' }));
      expect(screen.getByText('levels')).toBeInTheDocument();
      expect(screen.getByText('capital_per_level_pct')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save config/i })).toBeInTheDocument();
    });

    it('passes emptyMsg to BotDetailTrades when no trades', async () => {
      const user = userEvent.setup();
      render(<BotDetailClient bot={bot} trades={[]} />);
      const tabs = document.body.querySelector<HTMLElement>('.tabs');
      if (!tabs) throw new Error('tabs container not found');
      await user.click(within(tabs).getByRole('button', { name: 'Trade History' }));
      expect(screen.getByText('No trades yet')).toBeInTheDocument();
    });
  });

  describe('KPI rendering', () => {
    it('renders KPI data from bot', () => {
      render(<BotDetailClient bot={bot} trades={trades} />);
      expect(screen.getByText('Total P&L')).toBeInTheDocument();
      expect(screen.getByText('Win Rate')).toBeInTheDocument();
    });
  });
});
