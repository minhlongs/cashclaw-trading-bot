'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Plus, Bot } from 'lucide-react';
import Link from 'next/link';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used as type on line 26 for DashboardKpis prop
import type { BotCardData } from '@/forest/dashboard/actions';
import type { DashboardKpis } from '@/forest/dashboard/bot-kpis';

interface BotCardDataApi {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: string;
  status: string;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  startedAt: number | null;
  updatedAt: number;
  capitalAllocated: number;
}

interface DashboardData {
  kpis: DashboardKpis;
  bots: BotCardData[];
}

const statusStyles: Record<string, string> = {
  running: 'badge-success',
  active: 'badge-success',
  paused: 'badge-warning',
  stopped: 'badge-neutral',
  error: 'badge-error',
};

export default function DashboardClient() {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/bots', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const body = (await response.json()) as { ok: boolean; data?: BotCardDataApi[] | null; error?: string | null };

        if (!body.ok || !Array.isArray(body.data)) {
          throw new Error(body.error ?? 'Unable to load bots.');
        }

        const bots: BotCardData[] = body.data.map((item) => ({
          id: item.id,
          name: item.name,
          strategy: item.strategy,
          pair: item.pair,
          exchange: item.exchange,
          botStatus: item.status,
          totalPnl: Number.isFinite(item.totalPnl) ? item.totalPnl : 0,
          winCount: Number.isFinite(item.winCount) ? item.winCount : 0,
          lossCount: Number.isFinite(item.lossCount) ? item.lossCount : 0,
          startedAt: item.startedAt ?? null,
          updatedAt: item.updatedAt,
          capitalAllocated: Number.isFinite(item.capitalAllocated) ? item.capitalAllocated : 0,
          maxDrawdownPct: 0,
        }));

        const totalWinCount = bots.reduce((sum, b) => sum + b.winCount, 0);
        const totalLossCount = bots.reduce((sum, b) => sum + b.lossCount, 0);
        const totalTrades = totalWinCount + totalLossCount;

        const kpis: DashboardKpis = {
          totalBalance: bots.reduce((sum, b) => sum + b.capitalAllocated + b.totalPnl, 0),
          todayPnl: bots.reduce((sum, b) => sum + b.totalPnl, 0),
          activeBots: bots.filter((b) => b.botStatus === 'running' || b.botStatus === 'active').length,
          totalTrades,
          winRate: totalTrades > 0 ? Math.round((totalWinCount / totalTrades) * 100) : 0,
        };

        if (!cancelled) {
          setData({ kpis, bots });
        }
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Unknown dashboard error';
        if (!cancelled) {
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="dashboard">
        <header className="section-header">
          <div>
            <h1>{t('title')}</h1>
            <p className="meta">{t('subtitle')}</p>
          </div>
        </header>
        <div className="panel" style={{ padding: '2rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>{t('loading') ?? 'Loading dashboard...'}</p>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="dashboard">
        <header className="section-header">
          <div>
            <h1>{t('title')}</h1>
            <p className="meta">{t('subtitle')}</p>
          </div>
        </header>
        <div className="panel" style={{ padding: '2rem' }}>
          <p style={{ color: 'var(--color-loss)' }}>{error ?? t('failed') ?? 'Failed to load dashboard data.'}</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => {
              setError(null);
              setLoading(true);
              setData(null);
            }}
          >
            {t('retry') ?? 'Retry'}
          </button>
        </div>
      </section>
    );
  }

  const { kpis, bots } = data;
  const winRate = kpis.winRate;

  return (
    <section className="dashboard">
      <header className="section-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="meta">{t('subtitle')}</p>
        </div>
        <Link href={`/${locale}/bots/new`} className="btn btn-primary">
          <Plus className="btn-icon" />
          {t('newBot')}
        </Link>
      </header>

      <div className="panel-group">
        <div className="panel">
          <h3>Total Balance</h3>
          <p className="metric" style={{ color: 'var(--color-profit)' }}>
            ${kpis.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="meta">
            CashClaw {t('title').toLowerCase()} {bots.length} · PnL: $
            {kpis.todayPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="panel">
          <h3>Win Rate</h3>
          <p className="metric">{winRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</p>
          <p className="meta">
            {bots.reduce((sum, b) => sum + b.winCount, 0).toLocaleString()}W / {bots.reduce((sum, b) => sum + b.lossCount, 0).toLocaleString()}L
          </p>
        </div>

        <div className="panel">
          <h3>Active Bots</h3>
          <p className="metric">
            {kpis.activeBots.toLocaleString()} / {bots.length.toLocaleString()}
          </p>
          <p className="meta">
            Active rate: {bots.length > 0 ? `${((kpis.activeBots / bots.length) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : '—'}
          </p>
        </div>

        <div className="panel">
          <h3>Total Capital</h3>
          <p className="metric">
            ${bots.reduce((sum, b) => sum + b.capitalAllocated, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="meta">
            Across {bots.length} bots
          </p>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <header className="panel-header">
          <h2>Bots</h2>
          <div className="panel-actions">
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {bots.length === 0
                ? (t('empty') ?? 'No bots found. Create your first bot to get started.')
                : `${bots.length} ${t('subtitle')}`}
            </span>
            <Link className="btn btn-secondary" href={`/${locale}/bots/new`} prefetch={false}>
              <Bot className="btn-icon" />
              {t('createBot')}
            </Link>
          </div>
        </header>

        {bots.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Bot className="btn-icon" style={{ width: '2.5rem', height: '2.5rem', margin: '0 auto 1rem' }} />
            <p>{t('empty') ?? 'No bots found. Start by creating a new trading bot.'}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {bots.map((bot) => (
              <div className="list-item" key={bot.id}>
                <div className="list-meta">
                  <div className="list-titles">
                    <h4>{bot.name}</h4>
                    <span>{bot.pair}</span>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <span className={`badge ${statusStyles[bot.botStatus] ?? 'badge-neutral'}`}>
                    {bot.botStatus}
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono" style={{ color: 'var(--color-profit)' }}>
                      ${bot.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="meta">
                      {bot.winCount}W / {bot.lossCount}L
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: '1.5rem' }}>
        <div className="panel">
          <h3>Win Rate</h3>
          <p className="metric">{winRate.toFixed(1)}%</p>
          <p className="meta">
            {bots.reduce((sum, b) => sum + b.winCount, 0).toLocaleString()}W / {bots.reduce((sum, b) => sum + b.lossCount, 0).toLocaleString()}L
          </p>
        </div>
        <div className="panel">
          <h3>Total Trades</h3>
          <p className="metric">{kpis.totalTrades.toLocaleString()}</p>
          <p className="meta">Over {bots.length.toLocaleString()} bots</p>
        </div>
        <div className="panel">
          <h3>Total PnL</h3>
          <p className="metric" style={{ color: kpis.todayPnl >= 0 ? 'var(--color-profit)' : 'var(--color-loss)' }}>
            ${kpis.todayPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="meta">Realized across all bots</p>
        </div>
      </div>
    </section>
  );
}
