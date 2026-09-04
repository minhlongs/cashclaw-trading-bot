import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockLocale = vi.hoisted(() => ({ current: 'vi' }));
const mockPathname = vi.hoisted(() => ({ current: '/vi/dashboard' }));

vi.mock('next-intl', () => ({
  useLocale: () => mockLocale.current,
  useTranslations: (ns?: string) => (key: string) => (ns ? `${ns}.${key}` : key),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.current,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('lucide-react', () => ({
  LayoutDashboard: () => <svg data-testid="icon-dashboard" />,
  Bot: () => <svg data-testid="icon-bot" />,
  BookOpen: () => <svg data-testid="icon-backtests" />,
  Activity: () => <svg data-testid="icon-monitoring" />,
  Settings: () => <svg data-testid="icon-settings" />,
}));

import MobileNav from './mobile-nav';

describe('MobileNav', () => {
  it('renders all five nav items', () => {
    mockLocale.current = 'vi';
    render(<MobileNav />);
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('builds hrefs from the active locale — vi', () => {
    mockLocale.current = 'vi';
    mockPathname.current = '/vi/dashboard';
    render(<MobileNav />);
    expect(screen.getByText('nav.dashboard').closest('a')).toHaveAttribute('href', '/vi/dashboard');
    expect(screen.getByText('nav.settings').closest('a')).toHaveAttribute('href', '/vi/settings');
  });

  it('builds hrefs from the active locale — en', () => {
    mockLocale.current = 'en';
    mockPathname.current = '/en/dashboard';
    render(<MobileNav />);
    expect(screen.getByText('nav.dashboard').closest('a')).toHaveAttribute('href', '/en/dashboard');
    expect(screen.getByText('nav.settings').closest('a')).toHaveAttribute('href', '/en/settings');
  });

  it('highlights the item matching the current pathname', () => {
    mockLocale.current = 'vi';
    mockPathname.current = '/vi/settings';
    render(<MobileNav />);
    const settings = screen.getByText('nav.settings').closest('a');
    const dashboard = screen.getByText('nav.dashboard').closest('a');
    expect(settings).toHaveClass('text-profit');
    expect(dashboard).toHaveClass('text-tertiary');
  });

  it('highlights the English route when locale is en', () => {
    mockLocale.current = 'en';
    mockPathname.current = '/en/bots';
    render(<MobileNav />);
    expect(screen.getByText('nav.bots').closest('a')).toHaveClass('text-profit');
  });
});
