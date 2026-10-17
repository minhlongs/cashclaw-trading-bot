'use client';

import { useState, useMemo } from 'react';
import { Sliders } from 'lucide-react';
import {
  computeAlmgrenChrissTelemetry,
  type ExecutionUrgencyPreset,
} from '@/forest/dashboard/quant-telemetry-service';
import { QuantScreenHeader } from './quant-screen-header';

export function OptimalExecutionAlmgrenChrissCockpit() {
  const [preset, setPreset] = useState<ExecutionUrgencyPreset>('BALANCED_AC');

  const ac = useMemo(() => computeAlmgrenChrissTelemetry(preset), [preset]);

  return (
    <section
      aria-label="Almgren-Chriss Optimal Execution Trajectory and Shortfall Cockpit"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto"
    >
      <QuantScreenHeader
        icon={<Sliders size={20} className="text-[var(--color-accent)]" />}
        title="Almgren-Chriss Optimal Execution Trajectory & Shortfall Cockpit"
        subtitle="Wired to almgren-chriss-trajectory.ts • Hyperbolic sinh(κ(T-t)) liquidation schedule"
      />

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Risk Aversion (λ) &amp; Urgency Frontier Selector
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Execution urgency selector">
            {(['PASSIVE_TWAP', 'BALANCED_AC', 'URGENT_LIQUIDATION'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                aria-pressed={preset === p}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${
                  preset === p
                    ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Urgency Parameter κ</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)]">
              κ = {ac.urgencyKappa.toFixed(4)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Expected Shortfall E[x]</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-warning)]">
              ${ac.expectedShortfallCost.toFixed(2)} (First Slice: {(ac.firstSliceRatio * 100).toFixed(1)}%)
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Trajectory Classification</span>
            <div className="mt-1 font-mono text-base font-bold text-[var(--color-ai)]">
              {ac.strategyClass}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
