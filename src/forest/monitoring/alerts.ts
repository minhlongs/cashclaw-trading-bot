/**
 * Alert system for critical trading errors.
 * v1: Logs alerts to structured format. Future: webhook/email integration.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger({ module: 'alerts' });

export interface Alert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  context: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface AlertHandler {
  (alert: Alert): void;
}

const alerts: Alert[] = [];
const handlers: AlertHandler[] = [];

export function onAlert(handler: AlertHandler): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  };
}

export function emitAlert(
  level: Alert['level'],
  message: string,
  context: string,
  data?: Record<string, unknown>,
): Alert {
  const alert: Alert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    context,
    timestamp: Date.now(),
    data,
  };

  alerts.push(alert);

  // Keep only last 1000 alerts in memory
  if (alerts.length > 1000) {
    alerts.splice(0, alerts.length - 1000);
  }

  // Notify handlers
  for (const handler of handlers) {
    try {
      handler(alert);
    } catch (error) {
      log.warn('Alert handler error (non-fatal)', { action: 'fireAlert', error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  return alert;
}

export function getAlerts(limit = 100): Alert[] {
  return alerts.slice(-limit);
}

export function getAlertsByLevel(level: Alert['level']): Alert[] {
  return alerts.filter(a => a.level === level);
}

export function clearAlerts(): void {
  alerts.length = 0;
}
