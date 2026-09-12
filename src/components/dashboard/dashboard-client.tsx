'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Plus } from 'lucide-react';
import Link from 'next/link';

import type { BotCardData } from '@/forest/dashboard/actions';
import type { DashboardKpis } from '@/forest/dashboard/bot-kpis';
import { StrategyVisualizerCard } from './strategy-visualizer-card';
import { MarketWatchCard } from './market-watch-card';
import { DashboardBotList } from './dashboard-bot-list';

interface BotCardDataApi {
  id: string; name: string; strategy: 'grid' | 'mean_reversion' | 'volatility_dca' | string;
  pair: string; exchange: string; status: string; totalPnl: number; winCount: number;
  lossCount: number; startedAt: number | null; updatedAt: number; capitalAllocated: number;
}

interface DashboardData { kpis: DashboardKpis; bots: BotCardData[]; }

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
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        const body = (await response.json()) as { ok: boolean; data?: BotCardDataApi[] | null; error?: string | null };
        if (!body.ok || !Array.isArray(body.data)) throw new Error(body.error ?? 'Unable to load bots.');

        const bots: BotCardData[] = body.data.map((item) => ({
          id: item.id, name: item.name, strategy: item.strategy, pair: item.pair,
          exchange: item.exchange, botStatus: item.status,
          totalPnl: Number.isFinite(item.totalPnl) ? item.totalPnl : 0,
          winCount: Number.isFinite(item.winCount) ? item.winCount : 0,
          lossCount: Number.isFinite(item.lossCount) ? item.lossCount : 0,
          startedAt: item.startedAt ?? null, updatedAt: item.updatedAt,
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
        if (!cancelled) setData({ kpis, bots });
      } catch (fetchError) {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'Unknown dashboard error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="dashboard">
        <header className="section-header"><div><h1>{t('title')}</h1><p className="meta">{t('subtitle')}</p></div></header>
        <div className="panel"><p className="text-secondary">{t('loading') ?? 'Loading dashboard...'}</p></div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="dashboard">
        <header className="section-header"><div><h1>{t('title')}</h1><p className="meta">{t('subtitle')}</p></div></header>
        <div className="panel">
          <p className="text-loss">{error ?? t('failed') ?? 'Failed to load dashboard data.'}</p>
          <button className="btn btn-primary mt-4" onClick={() => { setError(null); setLoading(true); setData(null); }}>
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
        <div><h1>{t('title')}</h1><p className="meta">{t('subtitle')}</p></div>
        <Link href={`/${locale}/bots/new`} className="btn btn-primary"><Plus className="btn-icon" />{t('newBot')}</Link>
      </header>

      <div className="panel-group">
        <div className="panel">
          <h3>Total Balance</h3>
          <p className="metric text-profit">${kpis.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          <p className="meta">CashClaw {t('title').toLowerCase()} {bots.length} · PnL: ${kpis.todayPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        </div>
        <div className="panel">
          <h3>Win Rate</h3>
          <p className="metric">{winRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</p>
          <p className="meta">{bots.reduce((sum, b) => sum + b.winCount, 0).toLocaleString()}W / {bots.reduce((sum, b) => sum + b.lossCount, 0).toLocaleString()}L</p>
        </div>
        <div className="panel">
          <h3>Active Bots</h3>
          <p className="metric">{kpis.activeBots.toLocaleString()} / {bots.length.toLocaleString()}</p>
          <p className="meta">Active rate: {bots.length > 0 ? `${((kpis.activeBots / bots.length) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : '—'}</p>
        </div>
        <div className="panel">
          <h3>Total Capital</h3>
          <p className="metric">${bots.reduce((sum, b) => sum + b.capitalAllocated, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          <p className="meta">Across {bots.length} bots</p>
        </div>
      </div>

      <MarketWatchCard />

      <StrategyVisualizerCard bots={bots} />

      <DashboardBotList bots={bots} />

      <div className="grid-auto-fit mt-6">
        <div className="panel">
          <h3>Win Rate</h3>
          <p className="metric">{winRate.toFixed(1)}%</p>
          <p className="meta">{bots.reduce((sum, b) => sum + b.winCount, 0).toLocaleString()}W / {bots.reduce((sum, b) => sum + b.lossCount, 0).toLocaleString()}L</p>
        </div>
        <div className="panel">
          <h3>Total Trades</h3>
          <p className="metric">{kpis.totalTrades.toLocaleString()}</p>
          <p className="meta">Over {bots.length.toLocaleString()} bots</p>
        </div>
        <div className="panel">
          <h3>Total PnL</h3>
          <p className={`metric ${kpis.todayPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
            ${kpis.todayPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="meta">Realized across all bots</p>
        </div>
      </div>
    </section>
  );
}
