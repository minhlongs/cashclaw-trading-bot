'use client';

import { useState, useMemo } from 'react';
import { Filter, CheckCircle2, XCircle } from 'lucide-react';
import { computeFdrGateTelemetry, type GateMethod } from './fdr-multiple-testing-model';
import { QuantScreenHeader } from './quant-screen-header';

export function FdrMultipleTestingGate() {
  const [fdrAlpha, setFdrAlpha] = useState<number>(0.05);
  const [totalTrials, setTotalTrials] = useState<number>(12);
  const [method, setMethod] = useState<GateMethod>('BH_FDR');

  const fdrTelemetry = useMemo(() => computeFdrGateTelemetry(fdrAlpha, totalTrials, method), [fdrAlpha, totalTrials, method]);
  const { rows: evaluatedRows, survivedCount } = fdrTelemetry;

  return (
    <section aria-label="Multiple-Testing False Discovery Rate Gate" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<Filter size={20} className="text-[var(--color-ai)]" />}
        title="Multiple-Testing False Discovery Rate (BH-FDR & DSR) Gate"
        subtitle={`Data-snooping defense • Live computeDeflatedSharpe & E[max_N] = ${fdrTelemetry.expectedMaxSharpe}`}
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 flex flex-col gap-4 p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">FDR Control & Trial Registry Parameters</h2>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="fdr-alpha-slider" className="text-[var(--text-secondary)]">Target FDR Alpha (q)</label>
              <span className="font-mono font-bold text-[var(--color-accent)]">q = {fdrAlpha.toFixed(2)}</span>
            </div>
            <input id="fdr-alpha-slider" type="range" min={0.01} max={0.1} step={0.01} value={fdrAlpha} onChange={(e) => setFdrAlpha(Number(e.target.value))} className="min-h-[44px] accent-[var(--color-accent)] cursor-pointer" />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="trial-count-select" className="text-xs font-medium text-[var(--text-secondary)]">Cumulative Hypothesis Trials (m)</label>
            <select id="trial-count-select" value={totalTrials} onChange={(e) => setTotalTrials(Number(e.target.value))} className="min-h-[44px] px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--color-accent)]">
              <option value={12}>m = 12 (Phase 3 Seed Sweep)</option><option value={36}>m = 36 (Multi-Pair Universe)</option><option value={64}>m = 64 (Full Combinatorial Zoo)</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-[var(--text-secondary)]">Correction Procedure</span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Correction procedure selector">
              {(['BH_FDR', 'HOLM_BONFERRONI'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m} className={`min-h-[44px] px-2 py-2 rounded-lg text-xs font-mono font-semibold border transition-all ${method === m ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}>{m}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Survived Candidates</span>
              <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">{survivedCount} / {evaluatedRows.length}</div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Rejected by FDR Gate</span>
              <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)]">{evaluatedRows.length - survivedCount}</div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-secondary)]">Active Correction</span>
              <div className="mt-1 font-mono text-xl font-bold text-[var(--color-ai)]">{method}</div>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-x-auto">
            <table className="w-full text-left text-xs font-mono" aria-label="Multiple testing p-value gate table">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  <th className="pb-2">Rank (k)</th><th className="pb-2">Hypothesis</th><th className="pb-2">Raw p_k</th><th className="pb-2">Crit Threshold</th><th className="pb-2">Deflated SR</th><th className="pb-2 text-right">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {evaluatedRows.map((row) => (
                  <tr key={row.hypothesisId} className="hover:bg-[var(--bg-hover)]">
                    <td className="py-3 text-[var(--text-secondary)]">#{row.rank}</td>
                    <td className="py-3 font-semibold text-[var(--text-primary)]">{row.hypothesisId}</td>
                    <td className="py-3 text-[var(--text-primary)]">{row.rawPValue.toFixed(4)}</td>
                    <td className="py-3 text-[var(--color-ai)]">{row.criticalP.toFixed(4)}</td>
                    <td className="py-3 text-[var(--text-primary)]">{row.dsr.toFixed(2)}</td>
                    <td className="py-3 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${row.verdict === 'SURVIVED' ? 'bg-[rgba(0,212,170,0.15)] text-[var(--color-profit)]' : 'bg-[rgba(255,71,87,0.15)] text-[var(--color-loss)]'}`}>
                        {row.verdict === 'SURVIVED' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}<span>{row.verdict}</span>
                      </span>
                    </td>
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
