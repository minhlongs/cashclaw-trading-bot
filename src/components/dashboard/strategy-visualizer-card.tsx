'use client';

import { useTranslations } from 'next-intl';
import { Layers } from 'lucide-react';
import type { BotCardData } from '@/forest/dashboard/actions';

interface StrategyVisualizerCardProps {
  bots: BotCardData[];
}

interface StrategyGroup {
  strategy: string;
  allocated: number;
  pnl: number;
  winRate: number;
  totalBots: number;
  activeBots: number;
}

const STRATEGY_ORDER = ['grid', 'mean_reversion', 'volatility_dca'];

function getStrategyLabel(key: string, t: (k: string) => string): string {
  if (key === 'grid') return t('grid');
  if (key === 'mean_reversion') return t('meanReversion');
  if (key === 'volatility_dca') return t('volatilityDca');
  return key;
}

export function StrategyVisualizerCard({ bots }: StrategyVisualizerCardProps) {
  const t = useTranslations('dashboard.strategyVisualizer');

  if (bots.length === 0) {
    return (
      <div className="panel mt-6">
        <header className="panel-header">
          <div className="panel-title flex items-center gap-2">
            <Layers size={18} className="text-ai" />
            <span>{t('title')}</span>
          </div>
        </header>
        <div className="empty-state">
          <p>{t('noStrategies')}</p>
        </div>
      </div>
    );
  }

  const groupMap = new Map<string, {
    allocated: number;
    pnl: number;
    wins: number;
    losses: number;
    totalBots: number;
    activeBots: number;
  }>();

  for (const bot of bots) {
    const key = bot.strategy || 'unknown';
    const curr = groupMap.get(key) ?? {
      allocated: 0, pnl: 0, wins: 0, losses: 0, totalBots: 0, activeBots: 0,
    };
    curr.allocated += Number.isFinite(bot.capitalAllocated) ? bot.capitalAllocated : 0;
    curr.pnl += Number.isFinite(bot.totalPnl) ? bot.totalPnl : 0;
    curr.wins += Number.isFinite(bot.winCount) ? bot.winCount : 0;
    curr.losses += Number.isFinite(bot.lossCount) ? bot.lossCount : 0;
    curr.totalBots += 1;
    if (bot.botStatus === 'running' || bot.botStatus === 'active') curr.activeBots += 1;
    groupMap.set(key, curr);
  }

  const totalAllocated = bots.reduce(
    (sum, b) => sum + (Number.isFinite(b.capitalAllocated) ? b.capitalAllocated : 0),
    0
  );

  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
    const idxA = STRATEGY_ORDER.indexOf(a);
    const idxB = STRATEGY_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const groups: StrategyGroup[] = sortedKeys.map((key) => {
    const data = groupMap.get(key)!;
    const trades = data.wins + data.losses;
    return {
      strategy: key,
      allocated: data.allocated,
      pnl: data.pnl,
      winRate: trades > 0 ? Math.round((data.wins / trades) * 100) : 0,
      totalBots: data.totalBots,
      activeBots: data.activeBots,
    };
  });

  return (
    <div className="panel mt-6">
      <header className="panel-header">
        <div>
          <div className="panel-title flex items-center gap-2">
            <Layers size={18} className="text-ai" />
            <span>{t('title')}</span>
          </div>
          <p className="meta">{t('subtitle')}</p>
        </div>
        <div className="panel-actions">
          <span className="badge badge-neutral">
            {t('allocated')}: ${totalAllocated.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
      </header>

      <div className="grid-auto-fit mt-4 gap-3">
        {groups.map((group) => {
          const isProfit = group.pnl >= 0;
          return (
            <div key={group.strategy} className="card">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-semibold">{getStrategyLabel(group.strategy, t)}</h4>
                <span className={`badge ${group.activeBots > 0 ? 'badge-success' : 'badge-neutral'}`}>
                  {group.activeBots}/{group.totalBots} {t('activeBots')}
                </span>
              </div>

              <div className="grid gap-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-secondary">{t('allocated')}</span>
                  <span className="mono font-semibold">${group.allocated.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-secondary">{t('pnl')}</span>
                  <span className={`mono font-semibold ${isProfit ? 'text-profit' : 'text-loss'}`}>${group.pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-secondary">{t('winRate')}</span>
                  <span className="mono font-semibold">{group.winRate}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
