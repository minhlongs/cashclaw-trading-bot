'use client';

import type { TradeRow } from '@/forest/dashboard/actions';
import { SortableTable } from './sortable-table';

export interface BotDetailTradesProps {
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
            <span className={`side-badge ${val === 'buy' ? 'text-profit' : 'text-loss'}`}>
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
            if (v === null) return <span className="text-tertiary">—</span>;
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
            <span className="time-cell">
              {new Date(val as number).toLocaleString('vi-VN')}
            </span>
          ),
        },
      ]}
    />
  );
}
