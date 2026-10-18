'use client';

import { useState, useMemo } from 'react';
import { Activity, Sliders, TrendingUp, RefreshCw } from 'lucide-react';
import { QuantScreenHeader } from './quant-screen-header';
import { COST_TIERS, computeRegimeAttributionTelemetry, type CostTierId, type RegimeId } from './regime-attribution-model';

export function RegimeAttributionSimulator() {
  const [costTier, setCostTier] = useState<CostTierId>('BASE');
  const [selectedRegime, setSelectedRegime] = useState<'ALL' | RegimeId>('ALL');
  const [recomputeCount, setRecomputeCount] = useState<number>(1);

  const tierSpec = COST_TIERS[costTier];
  const engineTelemetry = useMemo(() => computeRegimeAttributionTelemetry(costTier, selectedRegime), [costTier, selectedRegime]);

  return (
    <section aria-label="Regime-Conditional Alpha Attribution Simulator" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<Activity size={20} className="text-[var(--color-accent)]" />}
        title="Regime-Conditional Alpha Attribution & Stress Simulator"
        subtitle="Causal regime slicing across 730 daily bars • QuantLib volatilityDca & cost-stress wired"
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 flex flex-col gap-4 p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Sliders size={16} className="text-[var(--color-accent)]" /><span>Stress Execution Tier & Regime Filter</span>
          </h2>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Cost & Slippage Tier</span>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Cost tier selector">
              {(['BASE', 'ELEVATED', 'EXTREME'] as const).map((tier) => (
                <button key={tier} type="button" onClick={() => setCostTier(tier)} aria-pressed={costTier === tier} className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-mono font-semibold border transition-all ${costTier === tier ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)] hover:bg-[var(--bg-hover)]'}`}>
                  {COST_TIERS[tier].label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="regime-filter-select" className="text-xs font-medium text-[var(--text-secondary)]">Volatility Regime Filter</label>
            <select id="regime-filter-select" value={selectedRegime} onChange={(e) => setSelectedRegime(e.target.value as 'ALL' | RegimeId)} className="min-h-[44px] px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--color-accent)]">
              <option value="ALL">ALL_REGIMES (730 bars)</option>
              <option value="LOW_VOL_TREND">Filter: LOW_VOL_TREND</option><option value="HIGH_VOL_BREAKOUT">Filter: HIGH_VOL_BREAKOUT</option>
              <option value="HIGH_VOL_CHOP">Filter: HIGH_VOL_CHOP</option><option value="LIQUIDITY_CRISIS">Filter: LIQUIDITY_CRISIS</option>
            </select>
          </div>
          <button type="button" onClick={() => setRecomputeCount((c) => c + 1)} className="min-h-[44px] px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs font-mono font-semibold text-[var(--color-accent)] flex items-center justify-center gap-2">
            <RefreshCw size={14} /><span>Re-Compute Engine Telemetry (#{recomputeCount})</span>
          </button>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Active Friction Tier</span>
              <div className="mt-1 font-mono text-xl font-bold text-[var(--color-warning)]">{tierSpec.bps} bps</div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Mean Net Sharpe</span>
              <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)] flex items-center gap-1">
                <TrendingUp size={18} /><span>{engineTelemetry.meanNetSharpe.toFixed(2)}</span>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Worst Stressed MaxDD</span>
              <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)]">-{engineTelemetry.worstDdPct.toFixed(1)}%</div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-x-auto">
            <table className="w-full text-left text-xs font-mono" aria-label="Regime attribution breakdown">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="pb-2">Regime</th><th className="pb-2">Bars</th><th className="pb-2">Gross SR</th><th className="pb-2">Net SR ({tierSpec.bps} bps)</th><th className="pb-2">DCA Signal</th><th className="pb-2">Stressed MaxDD</th><th className="pb-2 text-right">Gate Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {engineTelemetry.rows.map((r) => (
                  <tr key={r.regime} className="hover:bg-[var(--bg-hover)]">
                    <td className="py-3 font-semibold text-[var(--text-primary)]">{r.regime}</td>
                    <td className="py-3 text-[var(--text-secondary)]">{r.bars}</td>
                    <td className="py-3 text-[var(--text-primary)]">{r.grossSharpe.toFixed(2)}</td>
                    <td className={`py-3 font-bold ${r.netSharpe >= 0 ? 'text-[var(--color-profit)]' : 'text-[var(--color-loss)]'}`}>{r.netSharpe.toFixed(2)}</td>
                    <td className="py-3 text-[var(--color-accent)]">{r.dcaSignal}</td>
                    <td className="py-3 text-[var(--color-loss)]">-{r.stressedDdPct.toFixed(1)}%</td>
                    <td className="py-3 text-right"><span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[rgba(167,139,250,0.15)] text-[var(--color-ai)]">{r.verdict}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
