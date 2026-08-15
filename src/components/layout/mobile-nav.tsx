'use client';

import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  Activity,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

const NAV_ROUTES = [
  { path: 'dashboard', icon: LayoutDashboard },
  { path: 'bots', icon: Bot },
  { path: 'backtests', icon: BookOpen },
  { path: 'monitoring', icon: Activity },
  { path: 'settings', icon: Settings },
];

export default function MobileNav() {
  const locale = useLocale();
  const t = useTranslations('nav');
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
              {t(item.path)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
