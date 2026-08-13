'use client';

import { Shield, Activity, TrendingDown, AlertTriangle } from 'lucide-react';
import { type KillswitchResponse, formatPnl, formatTimestamp } from './monitoring-types';
import { MetricRow } from './shared-components';

interface KillswitchCardProps {
  killswitch: KillswitchResponse;
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
          <span
            className={`badge ${killswitch.halted ? 'badge-error' : killswitch.enabled ? 'badge-profit' : 'badge-neutral'}`}
          >
            {killswitch.halted ? 'Da kich hoat' : killswitch.enabled ? 'San sang' : 'Tat'}
          </span>
        </div>
      </div>
      <div>
        <MetricRow
          icon={Shield}
          label="Trang thai"
          value={killswitch.halted ? 'DA KICH HOAT' : killswitch.enabled ? 'Binh thuong' : 'Tat'}
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
