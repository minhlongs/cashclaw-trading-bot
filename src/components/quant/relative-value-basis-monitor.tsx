'use client';

import { useState, useMemo } from 'react';
import { Scale } from 'lucide-react';
import { QuantScreenHeader } from './quant-screen-header';

type BasisRegime = 'CARRY_LONG' | 'MEAN_REVERT';

const BASIS_UNIVERSE = [
  { pair: 'BTC-PERP / SPOT', fundingRate8hBps: 1.45, perpBasisBps: 18.2, spreadZScore: 2.34, regime: 'CARRY_LONG' as const },
  { pair: 'ETH-PERP / SPOT', fundingRate8hBps: 0.92, perpBasisBps: 11.4, spreadZScore: 1.62, regime: 'CARRY_LONG' as const },
  { pair: 'SOL-PERP / ETH-PERP', fundingRate8hBps: -0.64, perpBasisBps: -9.8, spreadZScore: -2.41, regime: 'MEAN_REVERT' as const },
] as const;

export function RelativeValueBasisMonitor() {
  const [regimeFilter, setRegimeFilter] = useState<'ALL' | BasisRegime>('ALL');

  const rows = useMemo(() => {
    const filtered = regimeFilter === 'ALL'
      ? BASIS_UNIVERSE
      : BASIS_UNIVERSE.filter((b) => b.regime === regimeFilter);
    return filtered.map((b) => {
      const annualizedCarryPct = Number(((b.fundingRate8hBps * 3 * 365) / 100).toFixed(2));
      return { ...b, annualizedCarryPct };
    });
  }, [regimeFilter]);

  return (
    <section aria-label="Cross-Exchange Relative-Value and Perpetual-Spot Funding Basis Monitor" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<Scale size={20} className="text-[var(--color-accent)]" />}
        title="Relative-Value & Perpetual-Spot Funding Basis Monitor"
        subtitle="Phase 5 relative-value engine • Annualized carry yield & OLS spread z-score telemetry"
      />

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Funding Carry & Cross-Pair Z-Score Table</h2>
          <div className="flex gap-2" role="group" aria-label="Basis regime filter">
            {(['ALL', 'CARRY_LONG', 'MEAN_REVERT'] as const).map((r) => (
              <button key={r} type="button" onClick={() => setRegimeFilter(r)} aria-pressed={regimeFilter === r} className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${regimeFilter === r ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono" aria-label="Relative value basis table">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="pb-2">Basis Instrument</th><th className="pb-2">8h Funding (bps)</th><th className="pb-2">Perp Basis (bps)</th><th className="pb-2">Spread Z-Score</th><th className="pb-2">Annualized Carry</th><th className="pb-2 text-right">Strategy Regime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {rows.map((row) => (
                <tr key={row.pair} className="hover:bg-[var(--bg-hover)]">
                  <td className="py-3 font-semibold text-[var(--text-primary)]">{row.pair}</td>
                  <td className="py-3 text-[var(--text-primary)]">{row.fundingRate8hBps.toFixed(2)}</td>
                  <td className="py-3 text-[var(--color-ai)]">{row.perpBasisBps.toFixed(1)}</td>
                  <td className="py-3 text-[var(--color-warning)]">{row.spreadZScore.toFixed(2)}σ</td>
                  <td className={`py-3 font-bold ${row.annualizedCarryPct >= 0 ? 'text-[var(--color-profit)]' : 'text-[var(--color-loss)]'}`}>
                    {row.annualizedCarryPct >= 0 ? `+${row.annualizedCarryPct}%` : `${row.annualizedCarryPct}%`}
                  </td>
                  <td className="py-3 text-right">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[rgba(0,212,170,0.15)] text-[var(--color-accent)]">{row.regime}</span>
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
