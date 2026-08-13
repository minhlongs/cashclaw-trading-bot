'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Shield,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Bot,
  Pause,
  Zap,
} from 'lucide-react';

/* ── API Response Shapes ───────────────────────────────────── */

interface HealthResponse {
  status: string;
  timestamp: number;
  version: string;
  environment: string;
}

interface MetricsResponse {
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

interface KillswitchResponse {
  enabled: boolean;
  halted: boolean;
  haltReason: string | null;
  haltedAt: number | null;
  dailyPnl: number;
  consecutiveLosses: number;
  currentDrawdown: number;
  timestamp: number;
}

interface Alert {
  id: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number;
}

interface MonitoringData {
  health: HealthResponse;
  metrics: MetricsResponse;
  killswitch: KillswitchResponse;
  alerts: Alert[];
}

/* ── Helpers ───────────────────────────────────────────────── */

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const levelColors: Record<Alert['level'], string> = {
  info: 'var(--text-secondary)',
  warning: 'var(--color-warning)',
  error: 'var(--color-loss)',
  critical: '#FF0040',
};

const levelBadges: Record<Alert['level'], string> = {
  info: 'badge-neutral',
  warning: 'badge-warning',
  error: 'badge-error',
  critical: 'badge-error',
};

/* ── Sub-components ────────────────────────────────────────── */

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: ok ? 'var(--color-profit)' : 'var(--color-loss)',
        boxShadow: ok
          ? '0 0 6px rgba(0,212,170,0.5)'
          : '0 0 6px rgba(255,71,87,0.5)',
      }}
    />
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Bot;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
        <Icon size={14} />
        {label}
      </span>
      <span className="mono" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: color ?? 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────── */

export default function MonitoringClient() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [healthRes, metricsRes, killswitchRes] = await Promise.all([
        fetch('/api/health', { cache: 'no-store' }),
        fetch('/api/metrics', { cache: 'no-store' }),
        fetch('/api/killswitch-status', { cache: 'no-store' }),
      ]);

      if (!healthRes.ok || !metricsRes.ok || !killswitchRes.ok) {
        throw new Error('One or more API endpoints returned an error');
      }

      const health: HealthResponse = await healthRes.json();
      const metrics: MetricsResponse = await metricsRes.json();
      const killswitch: KillswitchResponse = await killswitchRes.json();

      // Generate synthetic alerts from current state
      const alerts: Alert[] = [];
      if (killswitch.halted) {
        alerts.push({
          id: 'killswitch-halted',
          level: 'critical',
          message: `Killswitch triggered: ${killswitch.haltReason ?? 'unknown reason'}`,
          timestamp: killswitch.haltedAt ?? Date.now(),
        });
      }
      if (killswitch.enabled && killswitch.consecutiveLosses >= 3) {
        alerts.push({
          id: 'consecutive-losses',
          level: 'warning',
          message: `${killswitch.consecutiveLosses} consecutive losses detected`,
          timestamp: Date.now(),
        });
      }
      if (killswitch.enabled && killswitch.currentDrawdown > 10) {
        alerts.push({
          id: 'high-drawdown',
          level: 'warning',
          message: `High drawdown: ${killswitch.currentDrawdown.toFixed(1)}%`,
          timestamp: Date.now(),
        });
      }
      if (health.status !== 'ok') {
        alerts.push({
          id: 'health-degraded',
          level: 'error',
          message: `System health degraded: ${health.status}`,
          timestamp: Date.now(),
        });
      }
      // Always show a recent info alert
      alerts.push({
        id: 'refresh-ok',
        level: 'info',
        message: `Monitoring data refreshed at ${formatTimestamp(Date.now())}`,
        timestamp: Date.now(),
      });

      setData({ health, metrics, killswitch, alerts });
      setLastRefresh(Date.now());
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : 'Failed to load monitoring data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <section className="dashboard">
        <header className="section-header">
          <div>
            <h1>Monitoring</h1>
            <p className="meta">He thong dang tai...</p>
          </div>
        </header>
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
          <p>Dang tai du lieu...</p>
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="dashboard">
        <header className="section-header">
          <div>
            <h1>Monitoring</h1>
            <p className="meta">He thong quan sat</p>
          </div>
        </header>
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <AlertTriangle size={24} style={{ color: 'var(--color-loss)', marginBottom: 8 }} />
          <p style={{ color: 'var(--color-loss)' }}>{error}</p>
          <button
            onClick={fetchData}
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
          >
            <RefreshCw size={14} /> Thu tai
          </button>
        </div>
      </section>
    );
  }

  const { health, metrics, killswitch, alerts } = data!;
  const isHealthy = health.status === 'ok';
  const pnl = metrics.performance.totalPnl;
  const pnlColor = pnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)';
  const TrendIcon = pnl >= 0 ? TrendingUp : TrendingDown;

  return (
    <section className="dashboard">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="section-header">
        <div>
          <h1>Monitoring</h1>
          <p className="meta">
            He thong quan sat — Tu dong lam moi moi 30 giay
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            Cap nhat: {timeAgo(lastRefresh)}
          </span>
          <button onClick={fetchData} className="btn btn-secondary" style={{ padding: '6px 10px' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* ── Grid: 4 cards ───────────────────────────────────── */}
      <div className="panel-group" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>

        {/* 1. System Health */}
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

        {/* 2. Bot Metrics */}
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

        {/* 3. Killswitch Status */}
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

        {/* 4. Recent Alerts */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
              Canh bao gan day
            </div>
            <div className="panel-actions">
              <span className="badge badge-neutral">{alerts.length}</span>
            </div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {alerts.length === 0 ? (
              <p style={{ padding: '1rem 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                Khong co canh bao nao
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
      </div>
    </section>
  );
}
