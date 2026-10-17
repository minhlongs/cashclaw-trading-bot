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

describe('Sidebar', () => {
  const navItems = [
    { label: 'nav.dashboard', href: '/vi/dashboard' },
    { label: 'nav.bots', href: '/vi/bots' },
    { label: 'nav.backtests', href: '/vi/backtests' },
    { label: 'nav.monitoring', href: '/vi/monitoring' },
    { label: 'nav.regime-attribution', href: '/vi/regime-attribution' },
    { label: 'nav.fdr-gate', href: '/vi/fdr-gate' },
    { label: 'nav.alpha-zoo', href: '/vi/alpha-zoo' },
    { label: 'nav.deliberation', href: '/vi/deliberation' },
    { label: 'nav.survival-gate', href: '/vi/survival-gate' },
    { label: 'nav.microstructure', href: '/vi/microstructure' },
    { label: 'nav.correlation-matrix', href: '/vi/correlation-matrix' },
    { label: 'nav.execution-ledger', href: '/vi/execution-ledger' },
    { label: 'nav.data-quality-gate', href: '/vi/data-quality-gate' },
    { label: 'nav.sovereign-enclave', href: '/vi/sovereign-enclave' },
    { label: 'nav.relative-value-basis', href: '/vi/relative-value-basis' },
    { label: 'nav.portfolio-cvar-stress', href: '/vi/portfolio-cvar-stress' },
    { label: 'nav.orderbook-imbalance-lob', href: '/vi/orderbook-imbalance-lob' },
    { label: 'nav.rough-volatility-hurst', href: '/vi/rough-volatility-hurst' },
    { label: 'nav.style-guide', href: '/vi/style-guide' },
    { label: 'nav.settings', href: '/vi/settings' },
  ];

  it('renders all nav items', () => {
    render(<Sidebar />);

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

  it('highlights active nav item based on current pathname', () => {
    render(<Sidebar />);

    const activeLink = screen.getByText('nav.dashboard').closest('a') as HTMLElement;
    expect(activeLink).toHaveClass('active');

    for (const item of navItems.filter((i) => i.href !== '/vi/dashboard')) {
      const link = screen.getByText(item.label).closest('a') as HTMLElement;
      expect(link).not.toHaveClass('active');
    }
  });

  it('shows icon labels when expanded, hides them when collapsed', async () => {
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
  });

  it('renders status footer with loading text', () => {
    render(<Sidebar />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });
});
