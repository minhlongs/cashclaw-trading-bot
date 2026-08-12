'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useState } from 'react';
import { Plus, Search, Filter, Play, Pause } from 'lucide-react';
import Link from 'next/link';
import type { BotCardData } from '@/forest/dashboard/actions';

interface Props {
  initialData: BotCardData[];
}

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

export default function BotsListClient({ initialData }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const [bots] = useState<BotCardData[]>(initialData);
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' ? bots : bots.filter((b) => b.botStatus === filter);

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
            placeholder={t('common.loading')}
            className="form-input"
            style={{ paddingLeft: '36px' }}
          />
        </div>
        <select
          className="form-input"
          style={{ width: 'auto' }}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Tất cả / All</option>
          <option value="live_running">Đang chạy / Live</option>
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
