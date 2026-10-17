'use client';

import { useState, useMemo } from 'react';
import { Cpu, Lock } from 'lucide-react';
import { ZOO_ENTRIES, type ZooStatus } from './alpha-zoo-evaluator-model';
import { QuantScreenHeader } from './quant-screen-header';

export function AlphaZooEvaluator() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | ZooStatus>('ALL');

  const filteredEntries = useMemo(() => {
    if (statusFilter === 'ALL') return ZOO_ENTRIES;
    return ZOO_ENTRIES.filter((entry) => entry.status === statusFilter);
  }, [statusFilter]);

  return (
    <section aria-label="Alpha Zoo Evaluator and Factor IC/IR Falsification Matrix" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<Cpu size={20} className="text-[var(--color-accent)]" />}
        title="Alpha Zoo Evaluator & Factor IC/IR Falsification Matrix"
        subtitle="17-op causal AST kernel • 3-symbol Binance 1d panel (730 bars) • Σ ≡ 12 invariant"
        extraBadge={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-semibold bg-[rgba(0,212,170,0.12)] text-[var(--color-profit)] border border-[rgba(0,212,170,0.3)]">
            <Lock size={13} />
            <span>ZERO_LOOKAHEAD • CAUSAL_AST</span>
          </span>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Total Seed Manifest (Σ≡N)</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--text-primary)]">12 / 12</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Promoted Alive</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">0</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">IC/IR Falsified</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)]">2</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Not-Evaluable / Skipped</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-warning)]">2 / 8</div>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Phase 3 Falsification Bridge Outcomes</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Alpha Zoo verdict filter">
            {(['ALL', 'FALSIFIED', 'NOT_EVALUABLE', 'IMPORT_SKIPPED'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                aria-pressed={statusFilter === filter}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all ${
                  statusFilter === filter
                    ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono" aria-label="Alpha Zoo IC/IR matrix">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="pb-2">Alpha ID</th><th className="pb-2">Normalized Formula AST</th><th className="pb-2">Spearman IC</th><th className="pb-2">IC_IR</th><th className="pb-2">95% Bootstrap CI</th><th className="pb-2">FNV-1a32</th><th className="pb-2 text-right">Terminal Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredEntries.map((item) => (
                <tr key={item.alphaId} className="hover:bg-[var(--bg-hover)]">
                  <td className="py-3 font-semibold text-[var(--text-primary)]">{item.alphaId}</td>
                  <td className="py-3 text-[var(--color-ai)]">{item.formula}</td>
                  <td className="py-3 text-[var(--text-primary)]">{item.spearmanIc.toFixed(3)}</td>
                  <td className="py-3 text-[var(--text-primary)]">{item.icIr.toFixed(2)}</td>
                  <td className="py-3 text-[var(--text-secondary)]">{item.bootstrapCi}</td>
                  <td className="py-3 text-[var(--text-tertiary)]">{item.fnvSeed}</td>
                  <td className="py-3 text-right">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[rgba(255,71,87,0.15)] text-[var(--color-loss)]">{item.status}</span>
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
