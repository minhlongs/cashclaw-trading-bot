'use client';

import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  BookOpen,
  Activity,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

const navItems = [
  { href: '/vi/dashboard', icon: LayoutDashboard, labelVi: 'Tổng quan', labelEn: 'Dashboard' },
  { href: '/vi/bots', icon: Bot, labelVi: 'Bot', labelEn: 'Bots' },
  { href: '/vi/backtests', icon: BookOpen, labelVi: 'Backtest', labelEn: 'Backtests' },
  { href: '/vi/monitoring', icon: Activity, labelVi: 'Monitor', labelEn: 'Monitor' },
  { href: '/vi/settings', icon: Settings, labelVi: 'Cài đặt', labelEn: 'Settings' },
];

export default function MobileNav() {
  const pathname = usePathname();

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
