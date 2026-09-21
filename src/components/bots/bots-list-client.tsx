'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { BotCardData } from '@/forest/dashboard/actions';
import { BotsTable } from './bots-table';

export default function BotsListClient() {
  const t = useTranslations();
  const locale = useLocale();
  const [bots, setBots] = useState<BotCardData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    const fetchBots = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/bots');
        const raw = (await res.json()) as { ok?: boolean; data?: BotCardData[] };
        if (!cancelled) {
          if (raw.ok && Array.isArray(raw.data)) setBots(raw.data);
          else setError('Failed to fetch bots');
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

  const handleStatusChange = (botId: string, newStatus: string) => {
    setBots((prev) => prev.map((b) => (b.id === botId ? { ...b, botStatus: newStatus } : b)));
    setActionError(null);
  };

  const filtered = bots.filter((bot) => {
    const matchesStatus = statusFilter === 'all' || bot.botStatus === statusFilter;
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q || bot.name.toLowerCase().includes(q) ||
      bot.pair.toLowerCase().includes(q) || bot.exchange.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center"><h1 className="page-title">{t('bots.listTitle')}</h1></div>
        <div className="card flex items-center justify-center p-8 gap-3" aria-live="polite" aria-busy="true">
          <Loader2 size={24} className="animate-spin text-profit" />
          <span className="text-secondary">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center"><h1 className="page-title">{t('bots.listTitle')}</h1></div>
        <div className="card error-state" role="alert">
          <p>{error}</p>
          <button className="btn btn-ghost mt-4" onClick={() => window.location.reload()}>Thử lại / Try again</button>
        </div>
      </div>
    );
  }

  const activeCount = bots.filter((b) => b.botStatus === 'live_running').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-title">{t('bots.listTitle')}</h1>
          <p className="page-subtitle">
            {bots.length} {t('bots.columns.name').toLowerCase()} &middot; {activeCount} {t('dashboard.activeBots').toLowerCase()}
          </p>
        </div>
        <Link href={`/${locale}/bots/new`} className="btn btn-primary">
          <Plus size={16} />{t('bots.createNew')}
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder={t('common.search')}
            aria-label={t('common.search')}
            className="form-input search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <select
          className="form-input select-auto"
          aria-label="Filter bots by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Tất cả / All</option>
          <option value="paper_test">Paper Test</option>
          <option value="paused">Tạm dừng / Paused</option>
          <option value="draft">Bản nháp / Draft</option>
          <option value="error">Lỗi / Error</option>
        </select>
        <button className="btn btn-ghost btn-icon" aria-label="Filter"><Filter size={14} /></button>
      </div>

      {actionError && (
        <div className="badge badge-error flex items-center justify-between gap-2 p-3 text-sm" role="alert">
          <span>{actionError}</span>
          <button type="button" className="text-secondary hover:text-primary ml-2 text-xs" onClick={() => setActionError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      <BotsTable bots={filtered} locale={locale} onStatusChange={handleStatusChange} onError={setActionError} />
    </div>
  );
}
