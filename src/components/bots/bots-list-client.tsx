'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Play, Pause } from 'lucide-react';
import Link from 'next/link';
import type { BotCardData } from '@/forest/dashboard/actions';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'badge-neutral',
    paper_test: 'badge-neutral',
    live_running: 'badge-running',
    paused: 'badge-paused',
    error: 'badge-error',
    stopped: 'badge-neutral',
    running: 'badge-running',
  };
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
}

function PnlValue({ value }: { value: number }) {
  const cls = value >= 0 ? 'text-profit' : 'text-loss';
  const prefix = value >= 0 ? '+' : '';
  return (
    <span className={`mono ${cls}`}>
      {prefix}{value.toFixed(2)}
    </span>
  );
}

export default function BotsListClient() {
  const t = useTranslations();
  const locale = useLocale();
  const [bots, setBots] = useState<BotCardData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    const fetchBots = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/bots');
        const raw = await response.json();

        const data = raw as { ok?: boolean; data?: BotCardData[] };

        if (!cancelled) {
          if (data.ok && Array.isArray(data.data)) {
            setBots(data.data);
          } else {
            setError('Failed to fetch bots');
          }
        }
      } catch {
        if (!cancelled) setError('Failed to fetch bots');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchBots();
    return () => { cancelled = true; };
  }, []);

  const filtered = bots.filter((bot) => {
    const matchesStatus = statusFilter === 'all' || bot.botStatus === statusFilter;
    const matchesSearch = searchTerm === '' ||
      bot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bot.pair.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bot.exchange.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>
              {t('bots.listTitle')}
            </h1>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)' }}>
          {t('common.loading')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>
              {t('bots.listTitle')}
            </h1>
          </div>
        </div>
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--error)' }}>
          <p>{error}</p>
          <button
            className="btn btn-ghost"
            style={{ marginTop: '16px' }}
            onClick={() => window.location.reload()}
          >
            Thử lại / Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>
            {t('bots.listTitle')}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
            {bots.length} {t('bots.columns.name').toLowerCase()} &middot; {bots.filter((b) => b.botStatus === 'live_running').length} {t('dashboard.activeBots').toLowerCase()}
          </p>
        </div>
        <Link href={`/${locale}/bots/new`} className="btn btn-primary">
          <Plus size={16} />
          {t('bots.createNew')}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div
          style={{
            flex: 1,
            maxWidth: '400px',
            position: 'relative',
          }}
        >
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            placeholder={t('common.search')}
            className="form-input"
            style={{ paddingLeft: '36px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="form-input"
          style={{ width: 'auto' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Tất cả / All</option>
          <option value="paper_test">Paper Test</option>
          <option value="paused">Tạm dừng / Paused</option>
          <option value="draft">Bản nháp / Draft</option>
          <option value="error">Lỗi / Error</option>
        </select>
        <button className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={14} />
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>{t('bots.columns.name')}</th>
                <th>{t('bots.columns.strategy')}</th>
                <th>{t('bots.columns.pair')}</th>
                <th>Exchange</th>
                <th>{t('bots.columns.status')}</th>
                <th className="text-right">{t('bots.columns.pnl')}</th>
                <th className="text-right">Win Rate</th>
                <th className="text-right">Capital</th>
                <th style={{ textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bot) => {
                const total = bot.winCount + bot.lossCount;
                const wr = total > 0 ? ((bot.winCount / total) * 100).toFixed(0) : '—';
                return (
                  <tr key={bot.id}>
                    <td>
                      <Link
                        href={`/${locale}/bots/${bot.id}`}
                        className="font-semibold"
                        style={{ color: 'var(--color-accent)', textDecoration: 'none' }}
                      >
                        {bot.name}
                      </Link>
                    </td>
                    <td>{t(`bots.strategy.${bot.strategy}`)}</td>
                    <td className="mono">{bot.pair}</td>
                    <td className="mono" style={{ textTransform: 'uppercase', fontSize: 'var(--text-xs)' }}>{bot.exchange}</td>
                    <td><StatusBadge status={bot.botStatus} /></td>
                    <td className="text-right"><PnlValue value={bot.totalPnl} /></td>
                    <td className="text-right mono">{wr}%</td>
                    <td className="text-right mono" style={{ fontSize: 'var(--text-xs)' }}>
                      ${bot.capitalAllocated.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        {bot.botStatus === 'live_running' || bot.botStatus === 'paper_test' ? (
                          <button className="btn btn-ghost" style={{ padding: '4px 6px', fontSize: 'var(--text-xs)' }} title="Pause">
                            <Pause size={12} />
                          </button>
                        ) : (
                          <button className="btn btn-ghost" style={{ padding: '4px 6px', fontSize: 'var(--text-xs)' }} title="Start">
                            <Play size={12} />
                          </button>
                        )}
                        <Link href={`/${locale}/bots/${bot.id}`} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 'var(--text-xs)' }}>
                          {t('bots.columns.detail')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    Không tìm thấy bot / No bots found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
