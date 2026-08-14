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
    { label: 'Tổng quan', href: '/vi/dashboard' },
    { label: 'Bot của tôi', href: '/vi/bots' },
    { label: 'Backtest', href: '/vi/backtests' },
    { label: 'Monitoring', href: '/vi/monitoring' },
    { label: 'Cài đặt', href: '/vi/settings' },
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

    // Initially expanded: aside width is 240px
    const aside = document.querySelector('aside');
    expect(aside?.style.width).toBe('240px');

    expect(screen.getByText('CashClaw')).toBeInTheDocument();

    // Single collapse toggle button
    const collapseButton = screen.getByRole('button');
    await user.click(collapseButton);

    // After collapse: aside width is 64px and brand name is unmounted
    expect(aside?.style.width).toBe('64px');
    expect(screen.queryByText('CashClaw')).toBeNull();

    // Toggling back restores the expanded width
    await user.click(collapseButton);
    expect(aside?.style.width).toBe('240px');
    expect(screen.getByText('CashClaw')).toBeInTheDocument();
  });

  it('highlights active nav item based on current pathname', () => {
    render(<Sidebar />);

    // Mocked pathname is /vi/dashboard, so only that link carries the active style
    const activeLink = screen.getByText('Tổng quan').closest('a') as HTMLElement;
    expect(activeLink.style.background).toBe('rgba(0, 212, 170, 0.08)');
    expect(activeLink.style.color).toBe('var(--color-profit)');

    // Every other nav item stays transparent / secondary
    for (const item of navItems.filter((i) => i.href !== '/vi/dashboard')) {
      const link = screen.getByText(item.label).closest('a') as HTMLElement;
      expect(link.style.background).toBe('transparent');
      expect(link.style.color).toBe('var(--text-secondary)');
    }
  });

  it('shows icon labels when expanded, hides them when collapsed', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    // Expanded: all labels visible
    for (const item of navItems) {
      expect(screen.getByText(item.label)).toBeDefined();
    }

    // Collapse the sidebar
    const collapseButton = screen.getByRole('button');
    await user.click(collapseButton);

    // Labels are removed via conditional rendering: {!collapsed && <span>{label}</span>}
    const aside = document.querySelector('aside');
    expect(aside?.style.width).toBe('64px');

    for (const item of navItems) {
      expect(screen.queryByText(item.label)).toBeNull();
    }
  });

  it('renders status footer with loading text', () => {
    render(<Sidebar />);
    // useTranslations mock returns the key itself as translation text
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });
});
