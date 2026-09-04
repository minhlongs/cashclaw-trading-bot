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
            <h1 className="page-title">{t('bots.listTitle')}</h1>
          </div>
        </div>
        <div className="empty-state">
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
            <h1 className="page-title">{t('bots.listTitle')}</h1>
          </div>
        </div>
        <div className="card error-state">
          <p>{error}</p>
          <button
            className="btn btn-ghost mt-4"
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
          <h1 className="page-title">{t('bots.listTitle')}</h1>
          <p className="page-subtitle">
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
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder={t('common.search')}
            className="form-input search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="form-input select-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Tất cả / All</option>
          <option value="paper_test">Paper Test</option>
          <option value="paused">Tạm dừng / Paused</option>
          <option value="draft">Bản nháp / Draft</option>
          <option value="error">Lỗi / Error</option>
        </select>
        <button className="btn btn-ghost btn-icon">
          <Filter size={14} />
        </button>
      </div>

      {/* Table */}
      <div className="card card-no-pad">
        <div className="table-container table-container-plain">
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
                <th className="table-actions"></th>
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
                        className="font-semibold link-accent"
                      >
                        {bot.name}
                      </Link>
                    </td>
                    <td>{t(`bots.strategy.${bot.strategy}`)}</td>
                    <td className="mono">{bot.pair}</td>
                    <td className="mono text-xs uppercase">{bot.exchange}</td>
                    <td><StatusBadge status={bot.botStatus} /></td>
                    <td className="text-right"><PnlValue value={bot.totalPnl} /></td>
                    <td className="text-right mono">{wr}%</td>
                    <td className="text-right mono text-xs">
                      ${bot.capitalAllocated.toLocaleString()}
                    </td>
                    <td className="table-actions">
                      <div className="table-actions-inner">
                        {bot.botStatus === 'live_running' || bot.botStatus === 'paper_test' ? (
                          <button className="btn btn-ghost btn-xs" title="Pause">
                            <Pause size={12} />
                          </button>
                        ) : (
                          <button className="btn btn-ghost btn-xs" title="Start">
                            <Play size={12} />
                          </button>
                        )}
                        <Link href={`/${locale}/bots/${bot.id}`} className="btn btn-ghost btn-xs-wide">
                          {t('bots.columns.detail')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-state">
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