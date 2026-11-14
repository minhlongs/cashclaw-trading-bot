'use client';

import { useTranslations } from 'next-intl';
import type { BotCardData } from '@/forest/dashboard/actions';
import type { DashboardKpis } from '@/forest/dashboard/bot-kpis';

export interface DashboardKpiCardsProps {
  kpis: DashboardKpis;
  bots: BotCardData[];
}

function resolveCopy(
  t: ReturnType<typeof useTranslations>,
  key: string,
  fallback: string,
  values?: Record<string, string | number>,
): string {
  const translated = values ? t(key, values) : t(key);
  return translated === key ? fallback : translated;
}

export function DashboardTopKpiCards({ kpis, bots }: DashboardKpiCardsProps) {
  const t = useTranslations('dashboard');
  const winRate = kpis.winRate;
  const simulationBadge = resolveCopy(
    t,
    'paperSimulationBadge',
    'SIMULATED PAPER PnL — NOT REAL FUNDS',
  );
  const paperNotice = resolveCopy(
    t,
    'paperCapitalNotice',
    'Virtual paper simulation only — separated from SaaS billing',
  );

  return (
    <div className="panel-group">
      <div className="panel">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3>{resolveCopy(t, 'kpi.totalBalance', 'Total Balance')}</h3>
          <span
            data-testid="paper-simulation-badge"
            className="badge badge-warning text-xs font-mono"
          >
            {simulationBadge}
          </span>
        </div>
        <p className="metric text-profit mono font-semibold">
          ${kpis.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        <p className="meta">
          CashClaw {t('title').toLowerCase()} {bots.length} · PnL:{' '}
          {kpis.todayPnl >= 0 ? '+' : '-'}$
          {Math.abs(kpis.todayPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
      </div>
      <div className="panel">
        <h3>{resolveCopy(t, 'kpi.winRate', 'Win Rate')}</h3>
        <p className="metric mono font-semibold">
          {winRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}%
        </p>
        <p className="meta">
          {bots.reduce((sum, b) => sum + b.winCount, 0).toLocaleString()}W /{' '}
          {bots.reduce((sum, b) => sum + b.lossCount, 0).toLocaleString()}L
        </p>
      </div>
      <div className="panel">
        <h3>{resolveCopy(t, 'kpi.activeBots', 'Active Bots')}</h3>
        <p className="metric mono font-semibold">
          {kpis.activeBots.toLocaleString()} / {bots.length.toLocaleString()}
        </p>
        <p className="meta">
          {resolveCopy(t, 'kpi.activeRate', 'Active rate')}:{' '}
          {bots.length > 0
            ? `${((kpis.activeBots / bots.length) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
            : '—'}
        </p>
      </div>
      <div className="panel">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3>{resolveCopy(t, 'kpi.totalCapital', 'Total Capital')}</h3>
          <span
            data-testid="paper-simulation-badge"
            className="badge badge-warning text-xs font-mono"
          >
            {simulationBadge}
          </span>
        </div>
        <p className="metric mono font-semibold">
          $
          {bots
            .reduce((sum, b) => sum + b.capitalAllocated, 0)
            .toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        <p className="meta">
          {resolveCopy(t, 'kpi.acrossBots', `Across ${bots.length} bots`, { count: bots.length })} ·{' '}
          {paperNotice}
        </p>
      </div>
    </div>
  );
}

export function DashboardPerformanceGrid({ kpis, bots }: DashboardKpiCardsProps) {
  const t = useTranslations('dashboard');
  const winRate = kpis.winRate;
  const simulationBadge = resolveCopy(
    t,
    'paperSimulationBadge',
    'SIMULATED PAPER PnL — NOT REAL FUNDS',
  );

  return (
    <div className="grid-auto-fit mt-6">
      <div className="panel">
        <h3>{resolveCopy(t, 'kpi.winRate', 'Win Rate')}</h3>
        <p className="metric mono font-semibold">{winRate.toFixed(1)}%</p>
        <p className="meta">
          {bots.reduce((sum, b) => sum + b.winCount, 0).toLocaleString()}W /{' '}
          {bots.reduce((sum, b) => sum + b.lossCount, 0).toLocaleString()}L
        </p>
      </div>
      <div className="panel">
        <h3>{resolveCopy(t, 'kpi.totalTrades', 'Total Trades')}</h3>
        <p className="metric mono font-semibold">{kpis.totalTrades.toLocaleString()}</p>
        <p className="meta">
          {resolveCopy(t, 'kpi.overBots', `Over ${bots.length.toLocaleString()} bots`, {
            count: bots.length.toLocaleString(),
          })}
        </p>
      </div>
      <div className="panel">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3>{resolveCopy(t, 'kpi.totalPnl', 'Total PnL')}</h3>
          <span
            data-testid="paper-simulation-badge"
            className="badge badge-warning text-xs font-mono"
          >
            {simulationBadge}
          </span>
        </div>
        <p className={`metric mono font-semibold ${kpis.todayPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
          {kpis.todayPnl >= 0 ? '+' : '-'}$
          {Math.abs(kpis.todayPnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        <p className="meta">
          {resolveCopy(t, 'kpi.realizedPaperAcrossBots', 'Realized across all bots')}
        </p>
      </div>
    </div>
  );
}
