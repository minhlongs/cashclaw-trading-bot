'use client';

import { useTranslations } from 'next-intl';
import { Layers } from 'lucide-react';
import type { BotCardData } from '@/forest/dashboard/actions';
import { computeStrategyGroups, getStrategyLabel } from './strategy-visualizer-helpers';

interface StrategyVisualizerCardProps {
  bots: BotCardData[];
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

  const { groups, totalAllocated } = computeStrategyGroups(bots);

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
