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
    <nav className="mobile-nav" aria-label="Mobile Navigation">
      {navItems.map((item) => {
        const active = pathname.includes(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`mobile-nav-item ${active ? 'text-profit' : 'text-tertiary'}`}
          >
            <item.icon size={20} aria-hidden="true" />
            <span className="mobile-nav-label">
              {t(item.path)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
