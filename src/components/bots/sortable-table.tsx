'use client';

import { useState, useMemo } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc' | null;

export interface SortableColumn<T> {
  key: keyof T;
  label: string;
  width?: string;
  render?: (val: T[keyof T], row: T) => React.ReactNode;
  sortable?: boolean;
}

export function SortableTable<T>({
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
            <th className="th-col-width-60">ID</th>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={col.sortable !== false ? 'th-sortable' : ''}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
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
              <td colSpan={columns.length + 1} className="table-empty">
                {emptyMsg}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr key={getRowId(row)}>
                <td className="mono time-cell">
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
