'use client';

import { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, GitBranch } from 'lucide-react';
import {
  SURVIVAL_CHECKS,
  type GatePillar,
} from './survival-gate-monitor-model';
import { QuantScreenHeader } from './quant-screen-header';

export function SurvivalGateMonitor() {
  const [pillarFilter, setPillarFilter] = useState<'ALL' | GatePillar>('ALL');

  const visibleChecks = useMemo(() => {
    if (pillarFilter === 'ALL') return SURVIVAL_CHECKS;
    return SURVIVAL_CHECKS.filter((c) => c.pillar === pillarFilter);
  }, [pillarFilter]);

  const passedCount = visibleChecks.filter((c) => c.passed).length;

  return (
    <section aria-label="Survival Gate and Promotion Lifecycle Monitor" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<GitBranch size={20} className="text-[var(--color-accent)]" />}
        title="Survival Gate & Promotion State Lifecycle Monitor"
        subtitle="Multi-pair composition sweep pin • 4 Structural PASS / 4 Economic FAIL → RESEARCH to KILLED"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Structural Integrity Gates</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">4 / 4 PASS</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Economic Robustness Gates</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)]">0 / 4 PASS</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Promotion Lifecycle State</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)]">RESEARCH → KILLED</div>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Gate Evaluation Checklist ({passedCount} / {visibleChecks.length} Passed)</h2>
          <div className="flex gap-2" role="group" aria-label="Gate pillar filter">
            {(['ALL', 'STRUCTURAL', 'ECONOMIC'] as const).map((pillar) => (
              <button key={pillar} type="button" onClick={() => setPillarFilter(pillar)} aria-pressed={pillarFilter === pillar} className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${pillarFilter === pillar ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}>
                {pillar}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono" aria-label="Survival gate criteria table">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="pb-2">Gate ID</th><th className="pb-2">Pillar</th><th className="pb-2">Criterion</th><th className="pb-2">Required Floor</th><th className="pb-2">Observed Metric</th><th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {visibleChecks.map((item) => (
                <tr key={item.gateId} className="hover:bg-[var(--bg-hover)]">
                  <td className="py-3 font-semibold text-[var(--text-primary)]">{item.gateId}</td>
                  <td className="py-3 text-[var(--color-ai)]">{item.pillar}</td>
                  <td className="py-3 text-[var(--text-primary)]">{item.criterion}</td>
                  <td className="py-3 text-[var(--text-secondary)]">{item.threshold}</td>
                  <td className="py-3 text-[var(--text-primary)]">{item.observed}</td>
                  <td className="py-3 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${item.passed ? 'bg-[rgba(0,212,170,0.15)] text-[var(--color-profit)]' : 'bg-[rgba(255,71,87,0.15)] text-[var(--color-loss)]'}`}>
                      {item.passed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}<span>{item.passed ? 'PASS' : 'FAIL'}</span>
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
