'use client';

import { useTranslations } from 'next-intl';
import type { BotCardData } from '@/forest/dashboard/actions';
import type { DashboardKpis } from '@/forest/dashboard/bot-kpis';

export interface DashboardKpiCardsProps {
  kpis: DashboardKpis;
  bots: BotCardData[];
}

export function DashboardTopKpiCards({ kpis, bots }: DashboardKpiCardsProps) {
  const t = useTranslations('dashboard');
  const winRate = kpis.winRate;

  return (
    <div className="panel-group">
      <div className="panel">
        <h3>Total Balance</h3>
        <p className="metric text-profit">${kpis.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        <p className="meta">CashClaw {t('title').toLowerCase()} {bots.length} · PnL: ${kpis.todayPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
      </div>
      <div className="panel">
        <h3>Win Rate</h3>
        <p className="metric">{winRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</p>
        <p className="meta">{bots.reduce((sum, b) => sum + b.winCount, 0).toLocaleString()}W / {bots.reduce((sum, b) => sum + b.lossCount, 0).toLocaleString()}L</p>
      </div>
      <div className="panel">
        <h3>Active Bots</h3>
        <p className="metric">{kpis.activeBots.toLocaleString()} / {bots.length.toLocaleString()}</p>
        <p className="meta">Active rate: {bots.length > 0 ? `${((kpis.activeBots / bots.length) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : '—'}</p>
      </div>
      <div className="panel">
        <h3>Total Capital</h3>
        <p className="metric">${bots.reduce((sum, b) => sum + b.capitalAllocated, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        <p className="meta">Across {bots.length} bots</p>
      </div>
    </div>
  );
}

export function DashboardPerformanceGrid({ kpis, bots }: DashboardKpiCardsProps) {
  const winRate = kpis.winRate;

  return (
    <div className="grid-auto-fit mt-6">
      <div className="panel">
        <h3>Win Rate</h3>
        <p className="metric">{winRate.toFixed(1)}%</p>
        <p className="meta">{bots.reduce((sum, b) => sum + b.winCount, 0).toLocaleString()}W / {bots.reduce((sum, b) => sum + b.lossCount, 0).toLocaleString()}L</p>
      </div>
      <div className="panel">
        <h3>Total Trades</h3>
        <p className="metric">{kpis.totalTrades.toLocaleString()}</p>
        <p className="meta">Over {bots.length.toLocaleString()} bots</p>
      </div>
      <div className="panel">
        <h3>Total PnL</h3>
        <p className={`metric ${kpis.todayPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
          ${kpis.todayPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        <p className="meta">Realized across all bots</p>
      </div>
    </div>
  );
}
