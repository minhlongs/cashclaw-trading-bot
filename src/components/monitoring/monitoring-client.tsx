'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

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
      if (mountedRef.current) setLoading(false);
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
      <div className="flex-center h-50">
        <Loader2 size={32} className="animate-spin text-profit" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex-col flex-center gap-4 p-8 text-loss text-center">
        <AlertTriangle size={48} />
        <p className="text-loss">{error}</p>
        <button className="btn btn-ghost" onClick={fetchData}>
          {t('refresh')}
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex-col gap-6">
      <div className="flex-between">
        <div>
          <h2 className="text-xl font-semibold text-primary mb-0">
            {t('systemHealth.title')}
          </h2>
          <p className="text-sm text-tertiary mb-0">
            {lastRefresh.toLocaleTimeString('vi-VN')}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      </div>

      <div className="grid-auto-fit-lg gap-6">
        <SystemHealthCard health={data.health} metrics={data.metrics} />
        <BotMetricsCard metrics={data.metrics} />
      </div>

      <div className="grid-auto-fit-lg gap-6">
        <KillswitchCard killswitch={data.killswitch} />
        <AlertsCard alerts={data.alerts} />
      </div>
    </div>
  );
}
