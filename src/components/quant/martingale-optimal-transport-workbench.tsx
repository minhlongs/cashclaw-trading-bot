'use client';

import { useState, useMemo } from 'react';
import { Compass } from 'lucide-react';
import {
  computeMartingaleOptimalTransportTelemetry,
  type MotSmilePreset,
} from '@/forest/dashboard/quant-telemetry-service';
import { QuantScreenHeader } from './quant-screen-header';
import { QuantUxProMaxBar } from './quant-ux-pro-max-bar';

const PRESETS: readonly MotSmilePreset[] = ['ARBITRAGE_FREE_SVI', 'STEEP_PUT_SKEW', 'BUTTERFLY_VIOLATION'];

export function MartingaleOptimalTransportWorkbench() {
  const [preset, setPreset] = useState<MotSmilePreset>('ARBITRAGE_FREE_SVI');
  const [sortDesc, setSortDesc] = useState(false);
  const mot = useMemo(() => computeMartingaleOptimalTransportTelemetry(preset), [preset]);
  const sortedNodes = useMemo(
    () => [...mot.nodes].sort((a, b) => (sortDesc ? b.dupireLocalVol - a.dupireLocalVol : a.logMoneyness - b.logMoneyness)),
    [mot.nodes, sortDesc],
  );

  return (
    <section
      aria-label="Dupire Local Volatility and Martingale Optimal Transport Surface Workbench"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto quant-tabular"
    >
      <QuantScreenHeader
        icon={<Compass size={20} className="text-[var(--color-accent)]" />}
        title="Dupire (1994) Local Volatility & Martingale Optimal Transport (MOT) Bounds"
        subtitle="Gatheral SVI Butterfly Density g(k) • Model-Free Sub/Super-Replication Corridor"
      />
      <QuantUxProMaxBar screenId="martingale-optimal-transport" telemetryPayload={mot} />
      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            SVI Smile &amp; Arbitrage Regime Selector (ρ={mot.sviRho}, σ={mot.sviSigma})
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="MOT smile preset selector">
            {PRESETS.map((item) => (
              <button
                key={item} type="button" onClick={() => setPreset(item)} aria-pressed={preset === item}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border ${
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
            <span className="text-xs text-[var(--text-secondary)]">ATM Dupire Local Vol σ_loc(0,T)</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)]">{(mot.atmLocalVol * 100).toFixed(2)}%</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Min Butterfly Density g(k)</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-ai)]">
              {mot.minButterflyG.toFixed(4)} ({mot.isSurfaceArbitrageFree ? 'ARB_FREE_VERIFIED' : 'BUTTERFLY_ARB_ALERT'})
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Mean MOT Corridor Width</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">{mot.meanMotCorridorBps.toFixed(2)} bps</div>
          </div>
        </div>
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
              <th className="py-2 pr-3">Log-Moneyness k</th>
              <th className="py-2 pr-3">Butterfly g(k)</th>
              <th className="py-2 pr-3" aria-sort={sortDesc ? 'descending' : 'ascending'}>
                <button type="button" onClick={() => setSortDesc((v) => !v)} className="underline text-[var(--color-accent)]">
                  Dupire Local Vol ({sortDesc ? '↓' : '↑'})
                </button>
              </th>
              <th className="py-2">MOT Bounds [Sub, Mid, Super]</th>
            </tr>
          </thead>
          <tbody>
            {sortedNodes.map((n) => (
              <tr key={n.logMoneyness} className="border-b border-[var(--border-subtle)] text-[var(--text-primary)]">
                <td className="py-2 pr-3 font-bold">{n.logMoneyness.toFixed(2)}</td>
                <td className="py-2 pr-3">{n.butterflyDensityG.toFixed(4)}</td>
                <td className="py-2 pr-3 text-[var(--color-accent)] font-bold">{(n.dupireLocalVol * 100).toFixed(2)}%</td>
                <td className="py-2">[{n.subBoundBps}, {n.midPriceBps}, {n.superBoundBps}] bps</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
