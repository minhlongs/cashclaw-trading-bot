'use client';

import { useState, useMemo } from 'react';
import { Waypoints } from 'lucide-react';
import { computeRoughPathSignaturesTelemetry, type SignatureRegimePreset } from '@/forest/dashboard/quant-telemetry-service';
import { QuantScreenHeader } from './quant-screen-header';
import { QuantUxProMaxBar } from './quant-ux-pro-max-bar';

const PRESETS: readonly SignatureRegimePreset[] = ['BTC_LEADS_SOL', 'SOL_LEADS_BTC', 'SYNCHRONOUS_NOISE'];

export function RoughPathSignaturesWorkbench() {
  const [preset, setPreset] = useState<SignatureRegimePreset>('BTC_LEADS_SOL');
  const sig = useMemo(() => computeRoughPathSignaturesTelemetry(preset), [preset]);

  return (
    <section
      aria-label="Lyons Rough Path Signatures and Levy Area Lead-Lag Classifier Workbench"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto quant-tabular"
    >
      <QuantScreenHeader
        icon={<Waypoints size={20} className="text-[var(--color-accent)]" />}
        title="Lyons Rough Path Truncated Signature S^(2)(X) & Lévy Area Classifier"
        subtitle="Non-Commutative Iterated Integrals • Antisymmetric Lévy Area A^{1,2}_{0,T} = 0.5*(S^{1,2} - S^{2,1})"
      />
      <QuantUxProMaxBar screenId="rough-path-signatures" telemetryPayload={sig} />
      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Cross-Stream Path Pair &amp; Lead-Lag Phase Selector ({sig.pairLabel})
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Rough path signature preset selector">
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
            <span className="text-xs text-[var(--text-secondary)]">Antisymmetric Lévy Area A^(1,2)</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)]">
              {sig.levyArea12 >= 0 ? `+${sig.levyArea12.toFixed(6)}` : sig.levyArea12.toFixed(6)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Truncated Signature Norm ||S^(2)||_2</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-ai)]">
              {sig.signatureNorm.toFixed(5)} (S^12={sig.s2_12.toFixed(4)}, S^21={sig.s2_21.toFixed(4)})
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Rough-Path Lead-Lag Verdict</span>
            <div className="mt-1 font-mono text-base font-bold text-[var(--color-profit)]">{sig.verdict}</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)]">
                <th className="py-2 pr-3">Step t</th>
                <th className="py-2 pr-3">Channel 1 ΔX^(1)_t</th>
                <th className="py-2 pr-3">Channel 2 ΔX^(2)_t</th>
                <th className="py-2">Cumulative Lévy Area A^(1,2)(0,t)</th>
              </tr>
            </thead>
            <tbody>
              {sig.steps.map((step) => (
                <tr key={step.stepIndex} className="border-b border-[var(--border-subtle)] text-[var(--text-primary)]">
                  <td className="py-2 pr-3 font-bold">t={step.stepIndex}</td>
                  <td className="py-2 pr-3">{step.x1Normalized.toFixed(4)}</td>
                  <td className="py-2 pr-3">{step.x2Normalized.toFixed(4)}</td>
                  <td className="py-2 text-[var(--color-accent)] font-bold">{step.cumulativeLevyArea.toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
