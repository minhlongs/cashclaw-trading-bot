'use client';

import { useTranslations } from 'next-intl';

export interface EquityCurvePoint {
  timestamp: number;
  equity: number;
  drawdownPct: number;
}

export function EquityCurveChart({ data }: { data: EquityCurvePoint[] }) {
  const t = useTranslations('backtests');
  if (data.length < 2) return null;

  const width = 600;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };

  const equities = data.map(d => d.equity);
  const minVal = Math.min(...equities);
  const maxVal = Math.max(...equities);
  const range = maxVal - minVal || 1;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.equity - minVal) / range) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const linePath = points;
  const areaPath = `${padding.left},${padding.top + chartHeight} ${points} ${width - padding.right},${padding.top + chartHeight}`;

  const isProfit = equities[equities.length - 1] >= equities[0];

  const yTicks = [minVal, minVal + range * 0.25, minVal + range * 0.5, minVal + range * 0.75, maxVal];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg">
      {/* Grid lines */}
      {yTicks.map((tick, i) => {
        const y = padding.top + chartHeight - ((tick - minVal) / range) * chartHeight;
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4,4" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="var(--text-secondary)" fontSize="10">
              ${Math.round(tick).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <polygon points={areaPath} fill={isProfit ? 'rgba(0, 212, 170, 0.1)' : 'rgba(255, 71, 87, 0.1)'} />

      {/* Line */}
      <polyline points={linePath} fill="none" stroke={isProfit ? 'var(--color-profit)' : 'var(--color-loss)'} strokeWidth="2" strokeLinejoin="round" />

      {/* Start line */}
      <line x1={padding.left} y1={padding.top + chartHeight - ((data[0].equity - minVal) / range) * chartHeight} x2={width - padding.right} y2={padding.top + chartHeight - ((data[0].equity - minVal) / range) * chartHeight} stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="2,2" />

      {/* Labels */}
      <text x={padding.left} y={height - 5} fill="var(--text-secondary)" fontSize="10">{t('chartStart')}</text>
      <text x={width - padding.right} y={height - 5} fill="var(--text-secondary)" fontSize="10" textAnchor="end">{t('chartEnd')}</text>
    </svg>
  );
}
