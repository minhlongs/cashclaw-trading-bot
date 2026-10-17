'use client';

import { useState, useMemo } from 'react';
import { Database, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import {
  computeDataQualityTelemetry,
  type DataFaultMode,
} from '@/forest/dashboard/quant-telemetry-service';

export function DataQualityGateInspector() {
  const [faultMode, setFaultMode] = useState<DataFaultMode>('NONE');

  const qualityReport = useMemo(() => computeDataQualityTelemetry(faultMode), [faultMode]);

  return (
    <section
      aria-label="OHLCV Data Quality Gate Inspector and Fail-Closed Signal Fence"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <Database size={20} className="text-[var(--color-accent)]" />
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              OHLCV Data Quality Gate Inspector & 9-Validator Signal Fence
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Wired to validateCandleSeries (src/tree/alpha/data-quality) • Bad data produces DATA_INVALID
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Master Validator Status</span>
          <div
            className={`mt-1 font-mono text-xl font-bold ${
              qualityReport.valid ? 'text-[var(--color-profit)]' : 'text-[var(--color-loss)]'
            }`}
          >
            {qualityReport.status}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Fail-Closed Signal Guard</span>
          <div
            className={`mt-1 font-mono text-xl font-bold ${
              qualityReport.valid ? 'text-[var(--color-profit)]' : 'text-[var(--color-warning)]'
            }`}
          >
            {qualityReport.signalFence}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Detected Violations</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--text-primary)]">
            {qualityReport.violationCount} ({qualityReport.totalCandles} bars)
          </div>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            9-Dimension OHLCV Validator Matrix
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Fault injection test selector">
            {(['NONE', 'MONOTONICITY', 'ZERO_VOLUME', 'IMPOSSIBLE_OHLC'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFaultMode(mode)}
                aria-pressed={faultMode === mode}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all ${
                  faultMode === mode
                    ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono" aria-label="9 validator checks table">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                <th className="pb-2">Validator Dimension</th>
                <th className="pb-2">Violations</th>
                <th className="pb-2 text-right">Gate Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {qualityReport.checkResults.map((check) => (
                <tr key={check.dimension} className="hover:bg-[var(--bg-hover)]">
                  <td className="py-2.5 font-semibold text-[var(--text-primary)]">{check.dimension}</td>
                  <td className="py-2.5 text-[var(--text-secondary)]">{check.violations.length}</td>
                  <td className="py-2.5 text-right">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                        check.passed
                          ? 'bg-[rgba(0,212,170,0.15)] text-[var(--color-profit)]'
                          : 'bg-[rgba(255,71,87,0.15)] text-[var(--color-loss)]'
                      }`}
                    >
                      {check.passed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      <span>{check.passed ? 'PASS' : 'FAIL'}</span>
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
