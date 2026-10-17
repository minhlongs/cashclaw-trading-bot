'use client';

import { useState, useMemo } from 'react';
import { Grid, AlertCircle } from 'lucide-react';
import { computeCorrelationTelemetry } from '@/forest/dashboard/quant-telemetry-service';
import { QuantScreenHeader } from './quant-screen-header';

type LookbackWindow = 7 | 30 | 90;

export function CorrelationMatrixHeatmap() {
  const [windowDays, setWindowDays] = useState<LookbackWindow>(30);

  const telemetry = useMemo(() => computeCorrelationTelemetry(windowDays), [windowDays]);
  const highContagionCount = telemetry.pairs.filter((p) => p.clusterRisk === 'HIGH_CONTAGION').length;

  return (
    <section aria-label="Cross-Sectional Rolling Correlation Heatmap" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<Grid size={20} className="text-[var(--color-accent)]" />}
        title="Cross-Sectional Rolling Correlation Heatmap & Cluster Guard"
        subtitle="Causal Pearson correlation matrix via src/tree/alpha/correlation • Contagion fence active"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Rolling Lookback Window</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)]">{windowDays}D Window</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">High Contagion Pairs (&gt;= 0.85)</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)] flex items-center gap-1.5">
            <AlertCircle size={18} /><span>{highContagionCount} / {telemetry.pairs.length}</span>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">HRP Diversification Verdict</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-ai)]">
            {highContagionCount > 3 ? 'CLUSTER_CAP_ACTIVE' : 'BALANCED_CLUSTER'}
          </div>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Pairwise Rolling Correlation Matrix</h2>
          <div className="flex gap-2" role="group" aria-label="Lookback window switcher">
            {([7, 30, 90] as const).map((days) => (
              <button key={days} type="button" onClick={() => setWindowDays(days)} aria-pressed={windowDays === days} className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${windowDays === days ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}>
                {days}d
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono" aria-label="Pairwise correlation table">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="pb-2">Asset Pair</th><th className="pb-2">Pearson ρ ({windowDays}d)</th><th className="pb-2 text-right">Cluster Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {telemetry.pairs.map((row) => (
                <tr key={row.pair} className="hover:bg-[var(--bg-hover)]">
                  <td className="py-3 font-semibold text-[var(--text-primary)]">{row.pair}</td>
                  <td className="py-3 text-[var(--color-accent)]">{row.corr.toFixed(2)}</td>
                  <td className="py-3 text-right">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${row.clusterRisk === 'HIGH_CONTAGION' ? 'bg-[rgba(255,71,87,0.15)] text-[var(--color-loss)]' : 'bg-[rgba(0,212,170,0.15)] text-[var(--color-profit)]'}`}>
                      {row.clusterRisk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
