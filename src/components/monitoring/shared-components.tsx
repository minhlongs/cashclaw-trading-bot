'use client';

import type { LucideIcon } from 'lucide-react';

export function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: ok ? 'var(--color-profit)' : 'var(--color-loss)',
        boxShadow: ok
          ? '0 0 6px rgba(0,212,170,0.5)'
          : '0 0 6px rgba(255,71,87,0.5)',
      }}
    />
  );
}

interface MetricRowProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color?: string;
}

export function MetricRow({ icon: Icon, label, value, color }: MetricRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
        <Icon size={14} />
        {label}
      </span>
      <span className="mono" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: color ?? 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}
