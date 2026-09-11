'use client';

export interface MetricCardProps {
  label: string;
  value: string;
  positive?: boolean;
}

export function MetricCard({ label, value, positive }: MetricCardProps) {
  const valueColorClass = positive === true ? 'text-profit' : positive === false ? 'text-loss' : 'text-primary';
  return (
    <div className="metric-card">
      <p className="text-xs text-secondary mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueColorClass}`}>
        {value}
      </p>
    </div>
  );
}
