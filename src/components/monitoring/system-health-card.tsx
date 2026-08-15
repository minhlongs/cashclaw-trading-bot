'use client';

import { Activity, Zap, Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type HealthResponse, type MetricsResponse, formatUptime } from './monitoring-types';
import { StatusDot, MetricRow } from './shared-components';

interface SystemHealthCardProps {
  health: HealthResponse;
  metrics: MetricsResponse;
}

export function SystemHealthCard({ health, metrics }: SystemHealthCardProps) {
  const t = useTranslations('monitoring.systemHealth');
  const isHealthy = health.status === 'ok';

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} style={{ color: 'var(--color-profit)' }} />
          {t('title')}
        </div>
        <div className="panel-actions">
          <StatusDot ok={isHealthy} />
        </div>
      </div>
      <div>
        <MetricRow
          icon={Zap}
          label={t('status')}
          value={isHealthy ? t('healthy') : t('degraded')}
          color={isHealthy ? 'var(--color-profit)' : 'var(--color-loss)'}
        />
        <MetricRow icon={Activity} label={t('uptime')} value={formatUptime(metrics.uptime)} />
        <MetricRow icon={Bot} label={t('version')} value={health.version} />
        <MetricRow
          icon={Zap}
          label={t('environment')}
          value={health.environment === 'production' ? t('production') : health.environment}
        />
      </div>
    </div>
  );
}
