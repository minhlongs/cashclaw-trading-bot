'use client';

import { Activity, Zap, Bot } from 'lucide-react';
import { type HealthResponse, type MetricsResponse, formatUptime } from './monitoring-types';
import { StatusDot, MetricRow } from './shared-components';

interface SystemHealthCardProps {
  health: HealthResponse;
  metrics: MetricsResponse;
}

export function SystemHealthCard({ health, metrics }: SystemHealthCardProps) {
  const isHealthy = health.status === 'ok';

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} style={{ color: 'var(--color-profit)' }} />
          System Health
        </div>
        <div className="panel-actions">
          <StatusDot ok={isHealthy} />
        </div>
      </div>
      <div>
        <MetricRow
          icon={Zap}
          label="Status"
          value={isHealthy ? 'Healthy' : 'Degraded'}
          color={isHealthy ? 'var(--color-profit)' : 'var(--color-loss)'}
        />
        <MetricRow icon={Activity} label="Uptime" value={formatUptime(metrics.uptime)} />
        <MetricRow icon={Bot} label="Version" value={health.version} />
        <MetricRow
          icon={Zap}
          label="Environment"
          value={health.environment === 'production' ? 'Production' : health.environment}
        />
      </div>
    </div>
  );
}
