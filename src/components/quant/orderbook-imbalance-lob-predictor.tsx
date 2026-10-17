'use client';

import { useState, useMemo } from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import { computeHawkesLobTelemetry } from '@/forest/dashboard/quant-telemetry-service';

export function OrderbookImbalanceLobPredictor() {
  const [excitationAlpha, setExcitationAlpha] = useState<number>(0.65);
  const [decayBeta, setDecayBeta] = useState<number>(1.2);

  const telemetry = useMemo(
    () => computeHawkesLobTelemetry(excitationAlpha, decayBeta),
    [excitationAlpha, decayBeta],
  );

  return (
    <section
      aria-label="L3 Orderbook Queue Imbalance and Hawkes Arrival Intensity Predictor"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-[var(--color-accent)]" />
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              L3 Orderbook Queue Imbalance &amp; Hawkes Arrival Predictor
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Wired to hawkes-arrival-kernel.ts • Self-exciting λ(t), branching ratio η = α/β &amp; OBI
            </p>
          </div>
        </div>
        <span
          role="status"
          aria-label="Safety mode PAPER_ONLY ADR-001"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[rgba(255,176,32,0.15)] text-[var(--color-warning)] border border-[rgba(255,176,32,0.35)]"
        >
          <ShieldCheck size={14} />
          <span>PAPER_ONLY • ADR-001</span>
        </span>
      </header>

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Hawkes Excitation (α) &amp; Decay (β) Presets
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Hawkes excitation regime selector">
            {[
              { label: 'CALM_BOOK (α=0.35)', alpha: 0.35, beta: 1.4 },
              { label: 'BURST_FLOW (α=0.65)', alpha: 0.65, beta: 1.2 },
              { label: 'SUPERCRITICAL (α=1.35)', alpha: 1.35, beta: 1.1 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setExcitationAlpha(preset.alpha);
                  setDecayBeta(preset.beta);
                }}
                aria-pressed={excitationAlpha === preset.alpha}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${
                  excitationAlpha === preset.alpha
                    ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Arrival Intensity λ(t)</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)]">
              {telemetry.intensityLambda.toFixed(2)} ev/s
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Branching Ratio η = α/β</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-ai)]">
              {telemetry.branchingRatioEta.toFixed(3)} ({telemetry.isStationary ? 'STABLE' : 'CRITICAL'})
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Multi-Level Queue OBI</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">
              +{telemetry.obi.toFixed(3)} ({telemetry.microPriceSkewBps} bps)
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Execution Routing Gate</span>
            <div className="mt-1 font-mono text-sm font-bold text-[var(--color-warning)]">
              {telemetry.routingVerdict}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
