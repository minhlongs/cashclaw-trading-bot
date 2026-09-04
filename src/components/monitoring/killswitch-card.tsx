'use client';

import { Shield, Activity, TrendingDown, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KillswitchResponse, formatPnl, formatTimestamp } from './monitoring-types';
import { MetricRow } from './shared-components';

interface KillswitchCardProps {
  killswitch: KillswitchResponse;
}

function getBadgeClass(killswitch: KillswitchResponse): string {
  if (killswitch.halted) return 'badge-error';
  if (killswitch.enabled) return 'badge-profit';
  return 'badge-neutral';
}

function getBadgeLabel(killswitch: KillswitchResponse, t: (key: string) => string): string {
  if (killswitch.halted) return t('monitoring.killswitch.halted');
  if (killswitch.enabled) return t('monitoring.killswitch.armed');
  return t('monitoring.killswitch.disabled');
}

function getStatusText(killswitch: KillswitchResponse, t: (key: string) => string): string {
  if (killswitch.halted) return t('monitoring.killswitch.haltedStatus');
  if (killswitch.enabled) return t('monitoring.killswitch.armedStatus');
  return t('monitoring.killswitch.disabledStatus');
}

export function KillswitchCard({ killswitch }: KillswitchCardProps) {
  const t = useTranslations();

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title flex items-center gap-2">
          <Shield size={16} className={killswitch.halted ? 'text-loss' : 'text-profit'} />
          {t('monitoring.killswitch.title')}
        </div>
        <div className="panel-actions">
          <span className={`badge ${getBadgeClass(killswitch)}`}>
            {getBadgeLabel(killswitch, t)}
          </span>
        </div>
      </div>
      <div>
        <MetricRow
          icon={Shield}
          label={t('monitoring.killswitch.status')}
          value={getStatusText(killswitch, t)}
          color={killswitch.halted ? 'loss' : 'profit'}
        />
        {killswitch.halted && killswitch.haltReason && (
          <div className="halt-reason">
            {t('monitoring.killswitch.reason')}{killswitch.haltReason}
          </div>
        )}
        {killswitch.halted && killswitch.haltedAt && (
          <MetricRow icon={Activity} label={t('monitoring.killswitch.haltedAt')} value={formatTimestamp(killswitch.haltedAt)} />
        )}
        <MetricRow
          icon={TrendingDown}
          label={t('monitoring.killswitch.dailyPnl')}
          value={formatPnl(killswitch.dailyPnl)}
          color={killswitch.dailyPnl >= 0 ? 'profit' : 'loss'}
        />
        <MetricRow
          icon={AlertTriangle}
          label={t('monitoring.killswitch.consecutiveLosses')}
          value={killswitch.consecutiveLosses}
          color={killswitch.consecutiveLosses >= 3 ? 'warning' : undefined}
        />
        <MetricRow
          icon={TrendingDown}
          label={t('monitoring.killswitch.drawdown')}
          value={`${killswitch.currentDrawdown.toFixed(1)}%`}
          color={killswitch.currentDrawdown > 10 ? 'loss' : undefined}
        />
      </div>
    </div>
  );
}
