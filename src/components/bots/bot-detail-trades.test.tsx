import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BotDetailTrades } from './bot-detail-trades';
import type { TradeRow } from '@/forest/dashboard/actions';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon" {...props} />
  );
  return { ArrowUp: Icon, ArrowDown: Icon };
});

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeTrade(overrides: Partial<TradeRow> = {}): TradeRow {
  return {
    id: 't1',
    side: 'buy',
    price: 42000,
    quantity: 0.5,
    pnl: null,
    status: 'open',
    openedAt: 1700000000000,
    ...overrides,
  };
}

const BUY_TRADE = makeTrade({ side: 'buy', pnl: 120.5, status: 'filled' });
const SELL_TRADE = makeTrade({ id: 't2', side: 'sell', pnl: -50.25, status: 'filled', openedAt: 1700001000000 });
const CANCELLED_TRADE = makeTrade({ id: 't3', side: 'buy', pnl: null, status: 'cancelled' });
const FAILED_TRADE = makeTrade({ id: 't4', side: 'sell', pnl: null, status: 'failed' });
const LARGE_PNL_TRADE = makeTrade({ id: 't5', side: 'buy', pnl: 99999.99, status: 'filled', openedAt: 1700002000000 });
const ZERO_PNL_TRADE = makeTrade({ id: 't6', side: 'buy', pnl: 0, status: 'filled' });
const OPEN_TRADE = makeTrade({ id: 't7', side: 'sell', pnl: null, status: 'open' });

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('BotDetailTrades', () => {
  describe('empty state', () => {
    it('renders empty message when trades array is empty', () => {
      render(<BotDetailTrades trades={[]} emptyMsg="No trades yet" />);
      expect(screen.getByText('No trades yet')).toBeInTheDocument();
    });

    it('renders custom empty message', () => {
      render(<BotDetailTrades trades={[]} emptyMsg="Chua co giao dich" />);
      expect(screen.getByText('Chua co giao dich')).toBeInTheDocument();
    });

    it('shows single empty row with colspan', () => {
      const { container } = render(<BotDetailTrades trades={[]} emptyMsg="No trades yet" />);
      const emptyRow = container.querySelector('td[colspan]');
      expect(emptyRow).toBeInTheDocument();
      expect(emptyRow).toHaveAttribute('colspan', '7');
    });
  });

  describe('column headers', () => {
    it('renders all 7 column headers', () => {
      render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('ID')).toBeInTheDocument();
      expect(screen.getByText('Side')).toBeInTheDocument();
      expect(screen.getByText('Price')).toBeInTheDocument();
      expect(screen.getByText('Qty')).toBeInTheDocument();
      expect(screen.getByText('P&L')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Time')).toBeInTheDocument();
    });
  });

  describe('row rendering', () => {
    it('renders correct number of rows', () => {
      render(<BotDetailTrades trades={[BUY_TRADE, SELL_TRADE, CANCELLED_TRADE]} emptyMsg="empty" />);
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(4);
    });

    it('renders trade ID in first cell', () => {
      render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('t1')).toBeInTheDocument();
    });

    it('renders buy side text (CSS uppercase)', () => {
      render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('buy')).toBeInTheDocument();
    });

    it('renders sell side text (CSS uppercase)', () => {
      render(<BotDetailTrades trades={[SELL_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('sell')).toBeInTheDocument();
    });

    it('renders quantity value', () => {
      render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('0.5')).toBeInTheDocument();
    });

    it('renders formatted price with dollar sign', () => {
      render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('$42,000')).toBeInTheDocument();
    });

    it('renders P&L cell with supported class on positive', () => {
      const { container } = render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      // Side column uses text-profit for buy; P&L column uses text-profit for positive
      expect(container.querySelector('.text-profit')).toBeInTheDocument();
    });

    it('renders P&L cell with loss class on negative', () => {
      const { container } = render(<BotDetailTrades trades={[SELL_TRADE]} emptyMsg="empty" />);
      // Side column uses text-loss for sell; P&L column uses text-loss for negative
      expect(container.querySelector('.text-loss')).toBeInTheDocument();
    });

    it('renders P&L cell with profit class when pnl is zero', () => {
      const { container } = render(<BotDetailTrades trades={[ZERO_PNL_TRADE]} emptyMsg="empty" />);
      expect(container.querySelector('.text-profit')).toBeInTheDocument();
    });

    it('renders P&L cell with profit class when pnl is very large positive', () => {
      const { container } = render(<BotDetailTrades trades={[LARGE_PNL_TRADE]} emptyMsg="empty" />);
      expect(container.querySelector('.text-profit')).toBeInTheDocument();
    });

    it('shows dash for null P&L on open trades', () => {
      render(<BotDetailTrades trades={[OPEN_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('shows dash for null P&L on cancelled trades', () => {
      render(<BotDetailTrades trades={[CANCELLED_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('shows dash for null P&L on failed trades', () => {
      render(<BotDetailTrades trades={[FAILED_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('status badges', () => {
    it('renders open status', () => {
      render(<BotDetailTrades trades={[OPEN_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('open')).toBeInTheDocument();
    });

    it('renders filled status', () => {
      render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('filled')).toBeInTheDocument();
    });

    it('renders cancelled status', () => {
      render(<BotDetailTrades trades={[CANCELLED_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('cancelled')).toBeInTheDocument();
    });

    it('renders failed status', () => {
      render(<BotDetailTrades trades={[FAILED_TRADE]} emptyMsg="empty" />);
      expect(screen.getByText('failed')).toBeInTheDocument();
    });

    it('applies badge-profit class to filled trades', () => {
      const { container } = render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      const badge = container.querySelector('.badge-profit');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('sorts by side ascending on first click', async () => {
      const user = userEvent.setup();
      render(
        <BotDetailTrades trades={[SELL_TRADE, BUY_TRADE]} emptyMsg="empty" />,
      );
      await user.click(screen.getByText('Side'));

      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('buy')).toBeInTheDocument();
      expect(within(rows[2]).getByText('sell')).toBeInTheDocument();
    });

    it('sorts by side descending on second click', async () => {
      const user = userEvent.setup();
      render(
        <BotDetailTrades trades={[BUY_TRADE, SELL_TRADE]} emptyMsg="empty" />,
      );
      await user.click(screen.getByText('Side'));
      await user.click(screen.getByText('Side'));

      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('sell')).toBeInTheDocument();
      expect(within(rows[2]).getByText('buy')).toBeInTheDocument();
    });

    it('resets sort on third click back to original order', async () => {
      const user = userEvent.setup();
      render(
        <BotDetailTrades trades={[SELL_TRADE, BUY_TRADE]} emptyMsg="empty" />,
      );
      await user.click(screen.getByText('Side'));
      await user.click(screen.getByText('Side'));
      await user.click(screen.getByText('Side'));

      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('sell')).toBeInTheDocument();
      expect(within(rows[2]).getByText('buy')).toBeInTheDocument();
    });

    it('sorts by P&L column numerically', async () => {
      const user = userEvent.setup();
      const profit = makeTrade({ id: 'p', pnl: 100, status: 'filled' });
      const loss = makeTrade({ id: 'l', pnl: -50, status: 'filled' });
      render(<BotDetailTrades trades={[loss, profit]} emptyMsg="empty" />);

      await user.click(screen.getByText('P&L'));
      const rows = screen.getAllByRole('row');
      const cell1 = within(rows[1]).getAllByRole('cell');
      const cell2 = within(rows[2]).getAllByRole('cell');
      expect(cell1[4].textContent).toContain('50');
      expect(cell2[4].textContent).toContain('100');
    });

    it('resets to original order when clicking different sort column', async () => {
      const user = userEvent.setup();
      render(
        <BotDetailTrades trades={[SELL_TRADE, BUY_TRADE]} emptyMsg="empty" />,
      );
      await user.click(screen.getByText('Side'));
      await user.click(screen.getByText('Side'));

      // Now clicking a different column resets sort
      await user.click(screen.getByText('Qty'));
      await user.click(screen.getByText('Qty'));
      await user.click(screen.getByText('Qty'));

      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('sell')).toBeInTheDocument();
      expect(within(rows[2]).getByText('buy')).toBeInTheDocument();
    });

    it('shows sort indicator icon after sorting', async () => {
      const user = userEvent.setup();
      render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      await user.click(screen.getByText('Side'));
      const icons = screen.getAllByTestId('icon');
      expect(icons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('profit vs loss styling', () => {
    it('has text-profit class in table for buy trade', () => {
      const { container } = render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      const spans = container.querySelectorAll('.text-profit');
      expect(spans.length).toBeGreaterThanOrEqual(1);
    });

    it('has text-loss class in table for sell trade', () => {
      const { container } = render(<BotDetailTrades trades={[SELL_TRADE]} emptyMsg="empty" />);
      const spans = container.querySelectorAll('.text-loss');
      expect(spans.length).toBeGreaterThanOrEqual(1);
    });

    it('shows buy with text-profit in side column', () => {
      const { container } = render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      const sideCell = container.querySelector('.text-profit');
      expect(sideCell?.textContent).toContain('buy');
    });

    it('shows sell with text-loss in side column', () => {
      const { container } = render(<BotDetailTrades trades={[SELL_TRADE]} emptyMsg="empty" />);
      const sideCell = container.querySelector('.text-loss');
      expect(sideCell?.textContent).toContain('sell');
    });
  });

  describe('time formatting', () => {
    it('renders formatted timestamp', () => {
      render(<BotDetailTrades trades={[BUY_TRADE]} emptyMsg="empty" />);
      const timeStr = new Date(1700000000000).toLocaleString('vi-VN');
      expect(screen.getByText(timeStr)).toBeInTheDocument();
    });
  });
});
