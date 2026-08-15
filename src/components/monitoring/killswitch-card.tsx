'use client';

import { Shield, Activity, TrendingDown, AlertTriangle } from 'lucide-react';
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

function getBadgeLabel(killswitch: KillswitchResponse): string {
  if (killswitch.halted) return 'Da kich hoat';
  if (killswitch.enabled) return 'San sang';
  return 'Tat';
}

function getStatusText(killswitch: KillswitchResponse): string {
  if (killswitch.halted) return 'DA KICH HOAT';
  if (killswitch.enabled) return 'Binh thuong';
  return 'Tat';
}

export function KillswitchCard({ killswitch }: KillswitchCardProps) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={16} style={{ color: killswitch.halted ? 'var(--color-loss)' : 'var(--color-profit)' }} />
          Killswitch
        </div>
        <div className="panel-actions">
          <span className={`badge ${getBadgeClass(killswitch)}`}>
            {getBadgeLabel(killswitch)}
          </span>
        </div>
      </div>
      <div>
        <MetricRow
          icon={Shield}
          label="Trang thai"
          value={getStatusText(killswitch)}
          color={killswitch.halted ? 'var(--color-loss)' : 'var(--color-profit)'}
        />
        {killswitch.halted && killswitch.haltReason && (
          <div
            style={{
              padding: '8px 12px',
              marginTop: 4,
              background: 'rgba(255,71,87,0.08)',
              borderLeft: '3px solid var(--color-loss)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-loss)',
            }}
          >
            Ly do: {killswitch.haltReason}
          </div>
        )}
        {killswitch.halted && killswitch.haltedAt && (
          <MetricRow icon={Activity} label="Thoi gian kich hoat" value={formatTimestamp(killswitch.haltedAt)} />
        )}
        <MetricRow
          icon={TrendingDown}
          label="PnL ngay"
          value={formatPnl(killswitch.dailyPnl)}
          color={killswitch.dailyPnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)'}
        />
        <MetricRow
          icon={AlertTriangle}
          label="Lo lien tiep"
          value={killswitch.consecutiveLosses}
          color={killswitch.consecutiveLosses >= 3 ? 'var(--color-warning)' : undefined}
        />
        <MetricRow
          icon={TrendingDown}
          label="Drawdown"
          value={`${killswitch.currentDrawdown.toFixed(1)}%`}
          color={killswitch.currentDrawdown > 10 ? 'var(--color-loss)' : undefined}
        />
      </div>
    </div>
  );
}
