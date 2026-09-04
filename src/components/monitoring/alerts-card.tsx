'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type Alert, timeAgo, levelBadges } from './monitoring-types';

const levelTextColors: Record<Alert['level'], string> = {
  info: 'alert-level-info',
  warning: 'alert-level-warning',
  error: 'alert-level-error',
  critical: 'alert-level-critical',
};

interface AlertsCardProps {
  alerts: Alert[];
}

export function AlertsCard({ alerts }: AlertsCardProps) {
  const t = useTranslations('monitoring.alerts');

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title flex items-center gap-2">
          <AlertTriangle size={16} className="text-warning" />
          {t('title')}
        </div>
        <div className="panel-actions">
          <span className="badge badge-neutral">{alerts.length}</span>
        </div>
      </div>
      <div className="alert-list">
        {alerts.length === 0 ? (
          <p className="empty-list">
            {t('empty')}
          </p>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="alert-item"
            >
              <span
                className={`badge ${levelBadges[alert.level]}`}
              >
                {alert.level.toUpperCase()}
              </span>
              <div className="alert-content">
                <p
                  className={`alert-message ${levelTextColors[alert.level]}`}
                >
                  {alert.message}
                </p>
                <span className="alert-time">
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
