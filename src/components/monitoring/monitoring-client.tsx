'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MonitoringData } from './monitoring-types';
import { SystemHealthCard } from './system-health-card';
import { BotMetricsCard } from './bot-metrics-card';
import { KillswitchCard } from './killswitch-card';
import { AlertsCard } from './alerts-card';

export function MonitoringClient() {
  const t = useTranslations('monitoring');
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      setError(null);

      const [healthRes, metricsRes, killswitchRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/metrics'),
        fetch('/api/killswitch-status'),
      ]);

      if (!healthRes.ok || !metricsRes.ok || !killswitchRes.ok) {
        throw new Error(t('endpointError'));
      }

      const [health, metrics, killswitch] = await Promise.all([
        healthRes.json() as Promise<MonitoringData['health']>,
        metricsRes.json() as Promise<MonitoringData['metrics']>,
        killswitchRes.json() as Promise<MonitoringData['killswitch']>,
      ]);

      setData({ health, metrics, killswitch, alerts: [] });
      setLastRefresh(new Date());
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : t('loadFailed');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchData is useCallback-memoized; setState only fires on async completion
    void fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-profit)' }} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          padding: '2rem',
          color: 'var(--color-loss)',
          textAlign: 'center',
        }}
      >
        <AlertTriangle size={48} />
        <p style={{ color: 'var(--color-loss)' }}>{error}</p>
        <button className="btn btn-ghost" onClick={fetchData}>
          {t('refresh')}
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {t('systemHealth.title')}
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', margin: 0 }}>
            {lastRefresh.toLocaleTimeString('vi-VN')}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
        <SystemHealthCard health={data.health} metrics={data.metrics} />
        <BotMetricsCard metrics={data.metrics} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
        <KillswitchCard killswitch={data.killswitch} />
        <AlertsCard alerts={data.alerts} />
      </div>
    </div>
  );
}
