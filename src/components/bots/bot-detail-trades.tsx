'use client';

import { useState, useMemo } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { TradeRow } from '@/forest/dashboard/actions';

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

interface BotDetailTradesProps {
  trades: TradeRow[];
  emptyMsg: string;
}

export function BotDetailTrades({ trades, emptyMsg }: BotDetailTradesProps) {
  return (
    <SortableTable
      data={trades}
      getRowId={(t) => t.id}
      emptyMsg={emptyMsg}
      columns={[
        {
          key: 'side',
          label: 'Side',
          sortable: true,
          render: (val) => (
            <span className={val === 'buy' ? 'text-profit' : 'text-loss'} style={{ fontWeight: 600, textTransform: 'uppercase' }}>
              {String(val)}
            </span>
          ),
        },
        {
          key: 'price',
          label: 'Price',
          sortable: true,
          render: (val) => <span className="mono">${(val as number).toLocaleString()}</span>,
        },
        {
          key: 'quantity',
          label: 'Qty',
          sortable: true,
          render: (val) => <span className="mono">{String(val)}</span>,
        },
        {
          key: 'pnl',
          label: 'P&L',
          sortable: true,
          render: (val) => {
            const v = val as number | null;
            if (v === null) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>;
            return <span className={v >= 0 ? 'text-profit' : 'text-loss'}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</span>;
          },
        },
        {
          key: 'status',
          label: 'Status',
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
          label: 'Time',
          sortable: true,
          render: (val) => (
            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
              {new Date(val as number).toLocaleString('vi-VN')}
            </span>
          ),
        },
      ]}
    />
  );
}
