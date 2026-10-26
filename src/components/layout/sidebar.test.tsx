import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'vi',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/vi/dashboard',
}));

vi.mock('next/link', () => {
  return {
    default: ({
      children,
      href,
      ...props
    }: {
      children: React.ReactNode;
      href: string;
    }) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  };
});

import Sidebar from './sidebar';
import { NAV_ROUTES } from './sidebar-routes';

describe('Sidebar', () => {
  const navItems = [
    { label: 'nav.dashboard', href: '/vi/dashboard' },
    { label: 'nav.bots', href: '/vi/bots' },
    { label: 'nav.strategies/volatility-dca', href: '/vi/strategies/volatility-dca' },
    { label: 'nav.backtests', href: '/vi/backtests' },
    { label: 'nav.execution-ledger', href: '/vi/execution-ledger' },
    { label: 'nav.monitoring', href: '/vi/monitoring' },
    { label: 'nav.alpha-zoo', href: '/vi/alpha-zoo' },
    { label: 'nav.deliberation', href: '/vi/deliberation' },
    { label: 'nav.fdr-gate', href: '/vi/fdr-gate' },
    { label: 'nav.survival-gate', href: '/vi/survival-gate' },
    { label: 'nav.data-quality-gate', href: '/vi/data-quality-gate' },
    { label: 'nav.regime-attribution', href: '/vi/regime-attribution' },
    { label: 'nav.microstructure', href: '/vi/microstructure' },
    { label: 'nav.orderbook-imbalance-lob', href: '/vi/orderbook-imbalance-lob' },
    { label: 'nav.correlation-matrix', href: '/vi/correlation-matrix' },
    { label: 'nav.relative-value-basis', href: '/vi/relative-value-basis' },
    { label: 'nav.portfolio-cvar-stress', href: '/vi/portfolio-cvar-stress' },
    { label: 'nav.rough-volatility-hurst', href: '/vi/rough-volatility-hurst' },
    { label: 'nav.leadlag-hayashi-yoshida', href: '/vi/leadlag-hayashi-yoshida' },
    { label: 'nav.optimal-execution-almgren-chriss', href: '/vi/optimal-execution-almgren-chriss' },
    { label: 'nav.regime-switching-hamilton-hmm', href: '/vi/regime-switching-hamilton-hmm' },
    { label: 'nav.hrp-allocator', href: '/vi/hrp-allocator' },
    { label: 'nav.martingale-optimal-transport', href: '/vi/martingale-optimal-transport' },
    { label: 'nav.rough-path-signatures', href: '/vi/rough-path-signatures' },
    { label: 'nav.sovereign-enclave', href: '/vi/sovereign-enclave' },
    { label: 'nav.billing', href: '/vi/billing' },
    { label: 'nav.style-guide', href: '/vi/style-guide' },
    { label: 'nav.settings', href: '/vi/settings' },
  ];

  const groupLabels = [
    'nav.groups.trading',
    'nav.groups.research',
    'nav.groups.quantlib',
    'nav.groups.system',
  ];

  it('renders all 28 nav items across 4 semantic groups', () => {
    expect(NAV_ROUTES).toHaveLength(28);
    render(<Sidebar />);

    for (const groupLabel of groupLabels) {
      expect(screen.getByText(groupLabel)).toBeInTheDocument();
    }

    for (const item of navItems) {
      const label = screen.getByText(item.label);
      expect(label).toBeInTheDocument();
      expect(label.closest('a')).toHaveAttribute('href', item.href);
    }

    expect(screen.getAllByRole('link')).toHaveLength(navItems.length);
  });

  it('shows CashClaw brand name when not collapsed', () => {
    render(<Sidebar />);
    expect(screen.getByText('CashClaw')).toBeInTheDocument();
  });

  it('toggles collapse state on button click', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const aside = document.querySelector('aside');
    expect(aside).not.toHaveClass('sidebar-collapsed');

    expect(screen.getByText('CashClaw')).toBeInTheDocument();

    const collapseButton = screen.getByRole('button');
    await user.click(collapseButton);

    expect(aside).toHaveClass('sidebar-collapsed');
    expect(screen.queryByText('CashClaw')).toBeNull();

    await user.click(collapseButton);
    expect(aside).not.toHaveClass('sidebar-collapsed');
    expect(screen.getByText('CashClaw')).toBeInTheDocument();
  });

  it('highlights active nav item based on current pathname with aria-current', () => {
    render(<Sidebar />);

    const activeLink = screen.getByText('nav.dashboard').closest('a') as HTMLElement;
    expect(activeLink).toHaveClass('active');
    expect(activeLink).toHaveAttribute('aria-current', 'page');

    for (const item of navItems.filter((i) => i.href !== '/vi/dashboard')) {
      const link = screen.getByText(item.label).closest('a') as HTMLElement;
      expect(link).not.toHaveClass('active');
      expect(link).not.toHaveAttribute('aria-current');
    }
  });

  it('shows icon labels and group headers when expanded, hides them when collapsed', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    for (const item of navItems) {
      expect(screen.getByText(item.label)).toBeDefined();
    }

    const collapseButton = screen.getByRole('button');
    await user.click(collapseButton);

    const aside = document.querySelector('aside');
    expect(aside).toHaveClass('sidebar-collapsed');

    for (const item of navItems) {
      expect(screen.queryByText(item.label)).toBeNull();
    }
    for (const groupLabel of groupLabels) {
      expect(screen.queryByText(groupLabel)).toBeNull();
    }
  });

  it('renders ADR-001 PAPER ONLY safety badge in footer', () => {
    render(<Sidebar />);
    expect(screen.getByText('nav.paperOnlyBadge')).toBeInTheDocument();
  });
});
