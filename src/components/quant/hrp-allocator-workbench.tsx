'use client';

import { useState, useMemo } from 'react';
import { Network } from 'lucide-react';
import { computeHrpAllocatorTelemetry, type HrpRegimePreset } from '@/forest/dashboard/quant-telemetry-service';
import { QuantScreenHeader } from './quant-screen-header';
import { QuantUxProMaxBar } from './quant-ux-pro-max-bar';

const PRESETS: readonly HrpRegimePreset[] = ['BASELINE_CORR', 'CRISIS_CONTAGION', 'DECORRELATED_ALPHA'];

export function HrpAllocatorWorkbench() {
  const [preset, setPreset] = useState<HrpRegimePreset>('BASELINE_CORR');
  const [sortDesc, setSortDesc] = useState(true);
  const hrp = useMemo(() => computeHrpAllocatorTelemetry(preset), [preset]);
  const sortedAllocations = useMemo(
    () => [...hrp.allocations].sort((a, b) => (sortDesc ? b.hrpWeight - a.hrpWeight : a.hrpWeight - b.hrpWeight)),
    [hrp.allocations, sortDesc],
  );

  return (
    <section
      id="quant-main-content"
      aria-label="Hierarchical Risk Parity Recursive Bisection Portfolio Allocator"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto quant-tabular"
    >
      <QuantScreenHeader
        icon={<Network size={20} className="text-[var(--color-accent)]" />}
        title="López de Prado (2016) Hierarchical Risk Parity (HRP) Allocator"
        subtitle="Tree-Clustering Distance d_ij = sqrt(0.5*(1-ρ_ij)) • Quasi-Diagonalization & Recursive Bisection"
      />
      <QuantUxProMaxBar screenId="hrp-allocator" telemetryPayload={hrp} />

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Correlation Structure &amp; Shrinkage Regime Selector
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="HRP correlation regime selector">
            {PRESETS.map((item) => (
              <button
                key={item} type="button" onClick={() => setPreset(item)} aria-pressed={preset === item}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${
                  preset === item
                    ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Portfolio Annualized Vol</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)]">{(hrp.portfolioVolatility * 100).toFixed(2)}%</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Diversification Ratio</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">{hrp.diversificationRatio.toFixed(3)}x</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Quasi-Diagonal Seriation</span>
            <div className="mt-1 font-mono text-xs font-bold text-[var(--color-ai)]">{hrp.seriatedSymbols.join(' → ')}</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="py-2 pr-3">Asset</th><th className="py-2 pr-3">Quasi-Diag Rank</th>
                <th className="py-2 pr-3" aria-sort={sortDesc ? 'descending' : 'ascending'}>
                  <button type="button" onClick={() => setSortDesc((v) => !v)} className="underline text-[var(--color-accent)]">
                    HRP Weight ({sortDesc ? '↓' : '↑'})
                  </button>
                </th>
                <th className="py-2 pr-3">Inverse-Vol Weight</th><th className="py-2">Equal Weight (1/N)</th>
              </tr>
            </thead>
            <tbody>
              {sortedAllocations.map((row) => (
                <tr key={row.symbol} className="border-b border-[var(--border-subtle)] text-[var(--text-primary)]">
                  <td className="py-2 pr-3 font-bold">{row.symbol}</td>
                  <td className="py-2 pr-3">#{row.quasiDiagRank}</td>
                  <td className="py-2 pr-3 text-[var(--color-accent)] font-bold">{(row.hrpWeight * 100).toFixed(2)}%</td>
                  <td className="py-2 pr-3">{(row.inverseVolWeight * 100).toFixed(2)}%</td>
                  <td className="py-2">{(row.equalWeight * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
