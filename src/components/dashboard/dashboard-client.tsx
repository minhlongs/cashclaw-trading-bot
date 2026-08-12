'use client';

import { useTranslations } from 'next-intl';
import { Activity, Plus, Pause, TrendingUp, TrendingDown, Bot } from 'lucide-react';
import Link from 'next/link';

import type { BotCardData, DashboardKpis } from '@/forest/dashboard/actions';

interface DashboardData {
  kpis: DashboardKpis;
  bots: BotCardData[];
}

interface Props {
  initialData: DashboardData;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'badge-neutral', paper_test: 'badge-neutral',
    live_running: 'badge-running', paused: 'badge-paused',
    error: 'badge-error', stopped: 'badge-neutral',
    running: 'badge-running',
  };
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
}

function PnlValue({ value }: { value: number }) {
  const cls = value >= 0 ? 'text-profit' : 'text-loss';
  const prefix = value >= 0 ? '+' : '';
  return (
    <span className={`mono ${cls}`}>
      {prefix}{value.toFixed(2)}
    </span>
  );
}

export default function DashboardClient({ initialData }: Props) {
  const t = useTranslations();
  const data = initialData;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>
            {t('dashboard.title')}
          </h1>
        </div>
        <div className="flex gap-3">
          <Link href="/vi/bots/new" className="btn btn-primary">
            <Plus size={16} /> {t('dashboard.newBot')}
          </Link>
          <button className="btn btn-ghost">
            <Pause size={16} /> {t('dashboard.pauseAll')}
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label bi-label">
            <span className="vi">{t('dashboard.portfolioValue')}</span>
            <span className="en">Portfolio Value</span>
          </div>
          <div className="kpi-value mono">
            ${data.kpis.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label bi-label">
            <span className="vi">{t('dashboard.todayPnl')}</span>
            <span className="en">Today&apos;s P&L</span>
          </div>
          <div className={`kpi-value mono ${data.kpis.todayPnl >= 0 ? 'profit' : 'loss'}`}>
            {data.kpis.todayPnl >= 0 ? '+' : ''}{data.kpis.todayPnl.toFixed(2)}
          </div>
          <div className={`kpi-change mono ${data.kpis.todayPnl >= 0 ? 'profit' : 'loss'}`}>
            {data.kpis.todayPnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {data.kpis.todayPnl >= 0 ? '+' : ''}{((data.kpis.todayPnl / Math.max(data.kpis.totalBalance, 1)) * 100).toFixed(2)}%
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label bi-label">
            <span className="vi">{t('dashboard.activeBots')}</span>
            <span className="en">Active Bots</span>
          </div>
          <div className="kpi-value" style={{ color: 'var(--color-profit)' }}>{data.kpis.activeBots}</div>
          <div className="flex items-center gap-1 mt-2" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
            <Activity size={12} /> {t('common.loading')}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label bi-label">
            <span className="vi">{t('dashboard.winRate')}</span>
            <span className="en">Win Rate</span>
          </div>
          <div className="kpi-value mono">{data.kpis.winRate}%</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            {data.kpis.totalTrades} {t('dashboard.totalTrades').toLowerCase()}
          </div>
        </div>
      </div>

      {/* Bot List + Recent Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bots */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <h2 className="card-title">
              <Bot size={16} /> {t('bots.listTitle')}
            </h2>
            <Link href="/vi/bots/new" className="btn btn-ghost" style={{ fontSize: 'var(--text-xs)' }}>
              <Plus size={14} /> {t('bots.createNew')}
            </Link>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t('bots.columns.name')}</th>
                  <th>{t('bots.columns.pair')}</th>
                  <th>{t('bots.columns.strategy')}</th>
                  <th>{t('bots.columns.status')}</th>
                  <th className="text-right">{t('bots.columns.pnl')}</th>
                  <th className="text-right">{t('bots.columns.winRate')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.bots.map((bot) => (
                  <tr key={bot.id}>
                    <td>
                      <Link href={`/vi/bots/${bot.id}`} className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                        {bot.name}
                      </Link>
                      <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                        {bot.exchange}
                      </div>
                    </td>
                    <td className="mono">{bot.pair}</td>
                    <td>{t(`bots.strategy.${bot.strategy}`)}</td>
                    <td><StatusBadge status={bot.botStatus} /></td>
                    <td className="text-right"><PnlValue value={bot.totalPnl} /></td>
                    <td className="text-right mono">
                      {((bot.winCount / Math.max(bot.winCount + bot.lossCount, 1)) * 100).toFixed(0)}%
                    </td>
                    <td>
                      <Link href={`/vi/bots/${bot.id}`} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 'var(--text-xs)' }}>
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="card-title mb-4">{t('dashboard.quickActions')}</h3>
            <div className="space-y-2">
              <Link href="/vi/bots/new" className="btn btn-primary w-full justify-center">
                <Plus size={16} /> {t('dashboard.newBot')}
              </Link>
              <button className="btn btn-ghost w-full justify-center">
                <Pause size={16} /> {t('dashboard.pauseAll')}
              </button>
              <Link href="/vi/settings" className="btn btn-ghost w-full justify-center">
                Settings
              </Link>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Risk Overview</h3>
            <div className="space-y-3 mt-4">
              <div>
                <div className="flex justify-between" style={{ fontSize: 'var(--text-sm)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Max Drawdown</span>
                  <span className="mono text-warning">-8.2%</span>
                </div>
                <div className="mt-1 h-2 rounded" style={{ background: 'var(--bg-primary)' }}>
                  <div className="h-2 rounded" style={{ width: '41%', background: 'var(--color-warning)' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between" style={{ fontSize: 'var(--text-sm)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Capital Used</span>
                  <span className="mono">$2,450 / $5,000</span>
                </div>
                <div className="mt-1 h-2 rounded" style={{ background: 'var(--bg-primary)' }}>
                  <div className="h-2 rounded" style={{ width: '49%', background: 'var(--color-profit)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
