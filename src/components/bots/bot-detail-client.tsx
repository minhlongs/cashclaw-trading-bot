'use client';

import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useState, useMemo } from 'react';
import {
  ArrowLeft, Play, Pause, RotateCcw, Settings2,
  TrendingUp, TrendingDown, Activity, BarChart3,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import Link from 'next/link';
import type { BotDetailData, TradeRow } from '@/forest/dashboard/actions';

/* ---------- Sortable Table (no TanStack dependency) ---------- */

type SortDir = 'asc' | 'desc' | null;

interface SortableColumn<T> {
  key: keyof T;
  label: string;
  width?: string;
  render?: (val: T[keyof T], row: T) => React.ReactNode;
  sortable?: boolean;
}

function SortableTable<T>({
  data,
  columns,
  emptyMsg,
  getRowId,
}: {
  data: T[];
  columns: SortableColumn<T>[];
  emptyMsg: string;
  getRowId: (row: T) => string;
}) {
  const [sortKey, setSortKey] = useState<SortDir>(null);
  const [sortCol, setSortCol] = useState<keyof T | null>(null);

  const sorted = useMemo(() => {
    if (!sortCol || !sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortKey === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal ?? '');
      const bStr = String(bVal ?? '');
      const cmp = aStr.localeCompare(bStr);
      return sortKey === 'asc' ? cmp : -cmp;
    });
  }, [data, sortCol, sortKey]);

  const handleSort = (key: keyof T) => {
    if (sortCol === key) {
      const cycle: SortDir[] = ['asc', 'desc', null];
      const idx = cycle.indexOf(sortKey);
      setSortKey(cycle[idx + 1] ?? null);
      if (sortKey === 'desc') setSortCol(null);
    } else {
      setSortCol(key);
      setSortKey('asc');
    }
  };

  const SortIcon = ({ col }: { col: keyof T }) => {
    if (sortCol !== col || !sortKey) return null;
    return sortKey === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: '60px' }}>ID</th>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                style={{ width: col.width, cursor: col.sortable !== false ? 'pointer' : 'default' }}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {col.label}
                  {col.sortable !== false && <SortIcon col={col.key} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                {emptyMsg}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr key={getRowId(row)}>
                <td className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  {getRowId(row)}
                </td>
                {columns.map((col) => (
                  <td key={String(col.key)}>
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Bot Detail Client ---------- */

interface Props {
  initialData: BotDetailData;
  initialTrades: TradeRow[];
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

export default function BotDetailClient({ initialData, initialTrades }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'config'>('overview');
  const bot = initialData;
  const trades = initialTrades;

  const totalTrades = bot.winCount + bot.lossCount;
  const winRate = totalTrades > 0 ? ((bot.winCount / totalTrades) * 100).toFixed(1) : '0';

  const tabs = [
    { key: 'overview' as const, label: 'Tổng quan', icon: Activity },
    { key: 'trades' as const, label: 'Giao dịch', icon: BarChart3 },
    { key: 'config' as const, label: 'Cấu hình', icon: Settings2 },
  ];

  const configEntries = Object.entries(bot.config);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/bots`} className="btn btn-ghost" style={{ padding: '6px' }}>
          <ArrowLeft size={18} />
        </Link>
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-3">
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{bot.name}</h1>
            <StatusBadge status={bot.botStatus} />
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
            {bot.pair} · {bot.exchange} · {t(`bots.strategy.${bot.strategy}`)}
          </p>
        </div>
        <div className="flex gap-2">
          {bot.botStatus === 'live_running' || bot.botStatus === 'paper_test' ? (
            <button className="btn btn-ghost"><Pause size={16} /> {t('bots.actions.pause')}</button>
          ) : (
            <button className="btn btn-primary"><Play size={16} /> {t('bots.actions.start')}</button>
          )}
          <button className="btn btn-ghost"><RotateCcw size={16} /> {t('bots.actions.restart')}</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Tổng P&L / Total P&L</div>
          <div className={`kpi-value mono ${bot.totalPnl >= 0 ? 'profit' : 'loss'}`}>
            {bot.totalPnl >= 0 ? '+' : ''}{bot.totalPnl.toFixed(2)}
          </div>
          <div className={`kpi-change mono ${bot.totalPnl >= 0 ? 'profit' : 'loss'}`}>
            {bot.totalPnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            +{((bot.totalPnl / bot.capitalAllocated) * 100).toFixed(2)}%
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Tỷ lệ thắng / Win Rate</div>
          <div className="kpi-value mono" style={{ color: 'var(--color-profit)' }}>{winRate}%</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            {bot.winCount}W / {bot.lossCount}L
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Vốn đã dùng / Capital Used</div>
          <div className="kpi-value mono">
            ${bot.capitalUsed.toLocaleString()}
          </div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            / ${bot.capitalAllocated.toLocaleString()} ({((bot.capitalUsed / bot.capitalAllocated) * 100).toFixed(0)}%)
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Max Drawdown</div>
          <div className="kpi-value mono text-warning">-{bot.maxDrawdownPct}%</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>Giới hạn 20%</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', padding: '0 16px' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '14px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid var(--color-profit)' : '2px solid transparent',
                  color: activeTab === tab.key ? 'var(--color-profit)' : 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: '20px 16px' }}>
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Chiến lược / Strategy</div>
                  <div style={{ fontWeight: 600 }}>{t(`bots.strategy.${bot.strategy}`)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Cặp giao dịch / Pair</div>
                  <div className="mono" style={{ fontWeight: 600 }}>{bot.pair}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Sàn / Exchange</div>
                  <div style={{ fontWeight: 600 }}>{bot.exchange}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Trạng thái / Status</div>
                  <StatusBadge status={bot.botStatus} />
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Tổng giao dịch / Total Trades</div>
                  <div className="mono" style={{ fontWeight: 600 }}>{totalTrades}</div>
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Tạo lúc / Created</div>
                  <div style={{ fontWeight: 600 }}>{bot.startedAt ? new Date(bot.startedAt).toLocaleDateString('vi-VN') : '—'}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'trades' && (
            <SortableTable
              data={trades}
              getRowId={(t) => t.id}
              emptyMsg={t('bots.noTrades', { defaultValue: 'Chưa có giao dịch / No trades yet' })}
              columns={[
                {
                  key: 'side',
                  label: t('bots.table.side', { defaultValue: 'Side' }),
                  sortable: true,
                  render: (val) => (
                    <span className={val === 'buy' ? 'text-profit' : 'text-loss'} style={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      {String(val)}
                    </span>
                  ),
                },
                {
                  key: 'price',
                  label: t('bots.table.price', { defaultValue: 'Giá / Price' }),
                  sortable: true,
                  render: (val) => <span className="mono">${(val as number).toLocaleString()}</span>,
                },
                {
                  key: 'quantity',
                  label: t('bots.table.quantity', { defaultValue: 'Qty' }),
                  sortable: true,
                  render: (val) => <span className="mono">{String(val)}</span>,
                },
                {
                  key: 'pnl',
                  label: t('bots.table.pnl', { defaultValue: 'P&L' }),
                  sortable: true,
                  render: (val) => {
                    const v = val as number | null;
                    if (v === null) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
                    return <span className={v >= 0 ? 'text-profit' : 'text-loss'}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</span>;
                  },
                },
                {
                  key: 'status',
                  label: t('bots.table.status', { defaultValue: 'Status' }),
                  sortable: true,
                  render: (val) => {
                    const s = String(val);
                    return (
                      <span className={`badge ${s === 'filled' ? 'badge-profit' : s === 'cancelled' ? 'badge-neutral' : 'badge-warning'}`}>
                        {s}
                      </span>
                    );
                  },
                },
                {
                  key: 'openedAt',
                  label: t('bots.table.time', { defaultValue: 'Thời gian' }),
                  sortable: true,
                  render: (val) => (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      {new Date(val as number).toLocaleString('vi-VN')}
                    </span>
                  ),
                },
              ]}
            />
          )}

          {activeTab === 'config' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '600px' }}>
              {configEntries.map(([key, value]) => (
                <div key={key}>
                  <label className="form-label">{key}</label>
                  <input
                    type="number"
                    className="form-input"
                    defaultValue={value}
                    step="0.1"
                  />
                </div>
              ))}
              <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                <button className="btn btn-primary">Lưu cấu hình / Save Config</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
