'use client';

import { Bot, Activity, Pause, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { type MetricsResponse, formatPnl } from './monitoring-types';
import { MetricRow } from './shared-components';

interface BotMetricsCardProps {
  metrics: MetricsResponse;
}

export function BotMetricsCard({ metrics }: BotMetricsCardProps) {
  const pnl = metrics.performance.totalPnl;
  const pnlColor = pnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)';
  const TrendIcon = pnl >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={16} style={{ color: 'var(--color-ai)' }} />
          Bot Metrics
        </div>
        <div className="panel-actions">
          <span className="badge badge-running">{metrics.bots.running} dang chay</span>
        </div>
      </div>
      <div>
        <MetricRow icon={Bot} label="Tong bot" value={metrics.bots.total} />
        <MetricRow icon={Activity} label="Dang chay" value={metrics.bots.running} color="var(--color-profit)" />
        <MetricRow icon={Pause} label="Tam dung" value={metrics.bots.paused} color="var(--color-warning)" />
        <MetricRow icon={TrendIcon} label="Tong PnL" value={formatPnl(pnl)} color={pnlColor} />
        <MetricRow icon={Zap} label="Win Rate" value={`${metrics.performance.winRate.toFixed(1)}%`} />
        <MetricRow icon={Activity} label="Tong giao dich" value={metrics.performance.totalTrades} />
      </div>
    </div>
  );
}
