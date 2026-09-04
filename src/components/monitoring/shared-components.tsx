'use client';

import type { LucideIcon } from 'lucide-react';

export function StatusDot({ ok }: { ok: boolean }) {
 return (
    <span className={`status-dot ${ok ? 'ok' : 'off'}`} />
  );
}

interface MetricRowProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color?: 'profit' | 'loss' | 'warning' | string;
}

const COLOR_CLASS: Record<string, string> = {
  profit: 'text-profit',
  loss: 'text-loss',
  warning: 'text-warning',
};

export function MetricRow({ icon: Icon, label, value, color }: MetricRowProps) {
  const colorClass = color ? (COLOR_CLASS[color] ?? color) : 'text-primary';
  return (
    <div className="metric-row">
      <span className="metric-row-label">
        <Icon size={14} />
        {label}
      </span>
      <span className={`mono metric-row-value ${colorClass}`}>
        {value}
      </span>
    </div>
  );
}
