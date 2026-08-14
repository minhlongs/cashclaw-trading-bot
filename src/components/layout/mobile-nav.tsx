'use client';

import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  Activity,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

const NAV_ROUTES = [
  { path: 'dashboard', icon: LayoutDashboard, labelVi: 'Tổng quan', labelEn: 'Dashboard' },
  { path: 'bots', icon: Bot, labelVi: 'Bot', labelEn: 'Bots' },
  { path: 'backtests', icon: BookOpen, labelVi: 'Backtest', labelEn: 'Backtests' },
  { path: 'monitoring', icon: Activity, labelVi: 'Monitor', labelEn: 'Monitor' },
  { path: 'settings', icon: Settings, labelVi: 'Cài đặt', labelEn: 'Settings' },
];

export default function MobileNav() {
  const locale = useLocale();
  const pathname = usePathname();

  const navItems = NAV_ROUTES.map((item) => ({
    ...item,
    href: `/${locale}/${item.path}`,
  }));

  return (
    <nav className="mobile-nav">
      {navItems.map((item) => {
        const active = pathname.includes(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="mobile-nav-item"
            style={{
              color: active ? 'var(--color-profit)' : 'var(--text-tertiary)',
            }}
          >
            <item.icon size={20} />
            <span className="mobile-nav-label">
              {item.labelVi}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
