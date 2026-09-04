'use client';

import { Bot, Activity, Pause, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type MetricsResponse, formatPnl } from './monitoring-types';
import { MetricRow } from './shared-components';

interface BotMetricsCardProps {
  metrics: MetricsResponse;
}

export function BotMetricsCard({ metrics }: BotMetricsCardProps) {
  const t = useTranslations('monitoring.botMetrics');
  const pnl = metrics.performance.totalPnl;
  const TrendIcon = pnl >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title flex items-center gap-2">
          <Bot size={16} className="text-ai" />
          {t('title')}
        </div>
        <div className="panel-actions">
          <span className="badge badge-running">{metrics.bots.running} {t('runningBadge')}</span>
        </div>
      </div>
      <div>
        <MetricRow icon={Bot} label={t('total')} value={metrics.bots.total} />
        <MetricRow icon={Activity} label={t('running')} value={metrics.bots.running} color="profit" />
        <MetricRow icon={Pause} label={t('paused')} value={metrics.bots.paused} color="warning" />
        <MetricRow icon={TrendIcon} label={t('totalPnl')} value={formatPnl(pnl)} color={pnl >= 0 ? 'profit' : 'loss'} />
        <MetricRow icon={Zap} label={t('winRate')} value={`${metrics.performance.winRate.toFixed(1)}%`} />
        <MetricRow icon={Activity} label={t('totalTrades')} value={metrics.performance.totalTrades} />
      </div>
    </div>
  );
}
