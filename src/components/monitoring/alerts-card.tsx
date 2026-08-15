'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type Alert, timeAgo, levelColors, levelBadges } from './monitoring-types';

interface AlertsCardProps {
  alerts: Alert[];
}

export function AlertsCard({ alerts }: AlertsCardProps) {
  const t = useTranslations('monitoring.alerts');

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
          {t('title')}
        </div>
        <div className="panel-actions">
          <span className="badge badge-neutral">{alerts.length}</span>
        </div>
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {alerts.length === 0 ? (
          <p style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
            {t('empty')}
          </p>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 0',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <span
                className={`badge ${levelBadges[alert.level]}`}
                style={{ fontSize: 'var(--text-xs)', flexShrink: 0, padding: '2px 6px' }}
              >
                {alert.level.toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: levelColors[alert.level],
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}
                >
                  {alert.message}
                </p>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  {timeAgo(alert.timestamp)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
