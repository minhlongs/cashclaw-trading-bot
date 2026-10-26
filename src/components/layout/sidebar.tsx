'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Activity, Zap } from 'lucide-react';
import Link from 'next/link';
import { NAV_GROUPS } from './sidebar-routes';

export default function Sidebar() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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

      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="sidebar-group">
            {!collapsed && (
              <div className="sidebar-group-label" role="presentation">
                {t(`nav.groups.${group.id}`)}
              </div>
            )}
            {group.routes.map((item) => {
              const href = `/${locale}/${item.path}`;
              const isActive = pathname === href || pathname.startsWith(href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? t(`nav.${item.path}`) : undefined}
                >
                  <Icon size={18} className="sidebar-icon" />
                  {!collapsed && <span>{t(`nav.${item.path}`)}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer" role="status" aria-live="polite">
        <Activity size={14} className="text-profit sidebar-icon" />
        {!collapsed && (
          <span className="sidebar-status-text sidebar-paper-badge">
            {t('nav.paperOnlyBadge')}
          </span>
        )}
      </div>

      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}
