export interface HealthResponse {
  status: string;
  timestamp: number;
  version: string;
  environment: string;
}

export interface MetricsResponse {
  bots: { total: number; running: number; paused: number };
  performance: {
    totalPnl: number;
    winRate: number;
    totalTrades: number;
    totalWins: number;
    totalLosses: number;
  };
  uptime: number;
  timestamp: number;
}

export interface KillswitchResponse {
  enabled: boolean;
  halted: boolean;
  haltReason: string | null;
  haltedAt: number | null;
  dailyPnl: number;
  consecutiveLosses: number;
  currentDrawdown: number;
  timestamp: number;
}

export interface Alert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number;
}

export interface MonitoringData {
  health: HealthResponse;
  metrics: MetricsResponse;
  killswitch: KillswitchResponse;
  alerts: Alert[];
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export const levelColors: Record<Alert['level'], string> = {
  info: 'var(--text-secondary)',
  warning: 'var(--color-warning)',
  error: 'var(--color-loss)',
  critical: '#FF0040',
};

export const levelBadges: Record<Alert['level'], string> = {
  info: 'badge-neutral',
  warning: 'badge-warning',
  error: 'badge-error',
  critical: 'badge-error',
};
