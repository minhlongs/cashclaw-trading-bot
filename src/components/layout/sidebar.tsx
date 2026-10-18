'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Bot, Settings, BookOpen, ChevronLeft, ChevronRight,
  Activity, Zap, Filter, Cpu, MessageSquare, GitBranch, BarChart3,
  Grid, Layers, Database, KeyRound, Scale, Flame, Palette, Compass, Waypoints,
} from 'lucide-react';
import Link from 'next/link';

const NAV_ROUTES = [
  { path: 'dashboard', icon: LayoutDashboard },
  { path: 'bots', icon: Bot },
  { path: 'backtests', icon: BookOpen },
  { path: 'monitoring', icon: Activity },
  { path: 'regime-attribution', icon: Activity },
  { path: 'fdr-gate', icon: Filter },
  { path: 'alpha-zoo', icon: Cpu },
  { path: 'deliberation', icon: MessageSquare },
  { path: 'survival-gate', icon: GitBranch },
  { path: 'microstructure', icon: BarChart3 },
  { path: 'correlation-matrix', icon: Grid },
  { path: 'execution-ledger', icon: Layers },
  { path: 'data-quality-gate', icon: Database },
  { path: 'sovereign-enclave', icon: KeyRound },
  { path: 'relative-value-basis', icon: Scale },
  { path: 'portfolio-cvar-stress', icon: Flame },
  { path: 'orderbook-imbalance-lob', icon: Activity },
  { path: 'rough-volatility-hurst', icon: Zap },
  { path: 'leadlag-hayashi-yoshida', icon: GitBranch },
  { path: 'optimal-execution-almgren-chriss', icon: Layers },
  { path: 'regime-switching-hamilton-hmm', icon: Activity },
  { path: 'hrp-allocator', icon: Scale },
  { path: 'martingale-optimal-transport', icon: Compass },
  { path: 'rough-path-signatures', icon: Waypoints },
  { path: 'style-guide', icon: Palette },
  { path: 'settings', icon: Settings },
];

export default function Sidebar() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = NAV_ROUTES.map((item) => ({ ...item, href: `/${locale}/${item.path}` }));

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className={`sidebar-logo-container ${collapsed ? 'sidebar-logo-collapsed' : ''}`}>
        <div className="sidebar-logo"><Zap size={18} className="sidebar-logo-icon" /></div>
        {!collapsed && (
          <div>
            <div className="sidebar-title">CashClaw</div>
            <div className="sidebar-subtitle">Algo Trader</div>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`sidebar-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} className="sidebar-icon" />
              {!collapsed && <span>{t(`nav.${item.path}`)}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <Activity size={14} className="text-profit sidebar-icon" />
        {!collapsed && <span className="sidebar-status-text">{t('common.loading')}</span>}
      </div>

      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}