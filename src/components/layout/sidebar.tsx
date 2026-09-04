'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Settings,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Activity,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

const NAV_ROUTES = [
  { path: 'dashboard', icon: LayoutDashboard },
  { path: 'bots', icon: Bot },
  { path: 'backtests', icon: BookOpen },
  { path: 'monitoring', icon: Activity },
  { path: 'settings', icon: Settings },
];

export default function Sidebar() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = NAV_ROUTES.map((item) => ({
    ...item,
    href: `/${locale}/${item.path}`,
  }));

  return (
    <aside
      className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}
    >
      {/* Logo */}
      <div className={`sidebar-logo-container ${collapsed ? 'sidebar-logo-collapsed' : ''}`}>
        <div className="sidebar-logo">
          <Zap size={18} className="sidebar-logo-icon" />
        </div>
        {!collapsed && (
          <div>
            <div className="sidebar-title">CashClaw</div>
            <div className="sidebar-subtitle">Algo Trader</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} className="sidebar-icon" />
              {!collapsed && <span>{t(`nav.${item.path}`)}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Status footer */}
      <div className="sidebar-footer">
        <Activity size={14} className="text-profit sidebar-icon" />
        {!collapsed && (
          <span className="sidebar-status-text">
            {t('common.loading')}
          </span>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}