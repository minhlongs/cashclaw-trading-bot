'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  BarChart3,
  Settings,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Activity,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

const navItems = [
  { href: '/vi/dashboard', icon: LayoutDashboard, labelVi: 'Tổng quan', labelEn: 'Dashboard' },
  { href: '/vi/bots', icon: Bot, labelVi: 'Bot của tôi', labelEn: 'My Bots' },
  { href: '/vi/backtests', icon: BookOpen, labelVi: 'Backtest', labelEn: 'Backtests' },
  { href: '/vi/settings', icon: Settings, labelVi: 'Cài đặt', labelEn: 'Settings' },
];

export default function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      style={{
        width: collapsed ? '64px' : '240px',
        minHeight: '100vh',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms ease',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: collapsed ? '16px 12px' : '20px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '8px',
            background: 'var(--color-profit)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Zap size={18} style={{ color: 'var(--bg-primary)' }} />
        </div>
        {!collapsed && (
          <div>
            <div
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                lineHeight: 1.2,
              }}
            >
              CashClaw
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                lineHeight: 1,
              }}
            >
              Algo Trader
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: collapsed ? '10px 12px' : '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                color: isActive ? 'var(--color-profit)' : 'var(--text-secondary)',
                background: isActive ? 'rgba(0, 212, 170, 0.08)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 150ms ease',
                justifyContent: collapsed ? 'center' : 'flex-start',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{item.labelVi}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Status footer */}
      <div
        style={{
          padding: collapsed ? '12px' : '12px 16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Activity size={14} style={{ color: 'var(--color-profit)', flexShrink: 0 }} />
        {!collapsed && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            {t('common.loading')}
          </span>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          background: 'none',
          border: '1px solid var(--border-subtle)',
          borderTop: 'none',
          padding: '8px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}
