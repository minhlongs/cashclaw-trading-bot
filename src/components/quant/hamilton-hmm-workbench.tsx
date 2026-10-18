'use client';

import { useState, useMemo } from 'react';
import { Activity } from 'lucide-react';
import { computeHamiltonHmmTelemetry, type HamiltonScenarioId } from '@/forest/dashboard/quant-telemetry-service';
import { QuantScreenHeader } from './quant-screen-header';
import { QuantUxProMaxBar } from './quant-ux-pro-max-bar';

const SCENARIOS: readonly HamiltonScenarioId[] = ['CRISIS_SHOCK', 'CALM_EXPANSION', 'REGIME_TRANSITION'];

export function HamiltonHmmWorkbench() {
  const [scenario, setScenario] = useState<HamiltonScenarioId>('CRISIS_SHOCK');
  const hmm = useMemo(() => computeHamiltonHmmTelemetry(scenario), [scenario]);

  return (
    <section
      id="quant-main-content"
      aria-label="Hamilton Markov-Switching Regime Filter and Causal State Surface"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto quant-tabular"
    >
      <QuantScreenHeader
        icon={<Activity size={20} className="text-[var(--color-accent)]" />}
        title="Hamilton (1989) Causal Markov-Switching Regime Filter"
        subtitle="Zero-Lookahead Filtered State Probabilities ξ_{t|t} vs Non-Causal Kim Smoother ξ_{t|T}"
      />
      <QuantUxProMaxBar screenId="regime-switching-hamilton-hmm" telemetryPayload={hmm} />

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Regime Return Trajectory &amp; Persistence Selector (p11={hmm.p11}, p22={hmm.p22})
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Hamilton regime scenario selector">
            {SCENARIOS.map((item) => (
              <button
                key={item} type="button" onClick={() => setScenario(item)} aria-pressed={scenario === item}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${
                  scenario === item
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
            <span className="text-xs text-[var(--text-secondary)]">Filtered Crisis Prob ξ_t|t^(2)</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)]">{hmm.latestCrisisProb.toFixed(4)} ({hmm.latestState})</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Ergodic Weights (π1 / π2)</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-ai)]">{hmm.ergodicLowVolPi1.toFixed(3)} / {hmm.ergodicCrisisPi2.toFixed(3)}</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">LR Statistic 2Δℓ &amp; Paper Sizing</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">+{hmm.likelihoodRatio2DeltaL.toFixed(2)} • m_t={hmm.latestSizingMultiplier.toFixed(2)}x</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="py-2 pr-3">Bar t</th>
                <th className="py-2 pr-3">Return r_t</th>
                <th className="py-2 pr-3">Causal ξ_t|t (Online)</th>
                <th className="py-2 pr-3">Kim Smoother ξ_t|T (Lookahead)</th>
                <th className="py-2">Paper Sizing m_t</th>
              </tr>
            </thead>
            <tbody>
              {hmm.comparisonRows.map((row) => (
                <tr key={row.stepIndex} className="border-b border-[var(--border-subtle)] text-[var(--text-primary)]">
                  <td className="py-2 pr-3">t={row.stepIndex}</td>
                  <td className="py-2 pr-3">{(row.returnVal * 100).toFixed(2)}%</td>
                  <td className="py-2 pr-3 text-[var(--color-accent)]">{row.filteredCrisisProb.toFixed(4)}</td>
                  <td className="py-2 pr-3 text-[var(--color-warning)]">{row.kimSmoothedCrisisProb.toFixed(4)}</td>
                  <td className="py-2">{row.sizingMultiplier.toFixed(2)}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
