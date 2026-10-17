'use client';

import { useState } from 'react';
import { Flame, ShieldCheck, AlertOctagon } from 'lucide-react';

type ShockScenarioId = 'FLASH_CRASH_-25%' | 'CORRELATION_1.0_SPIKE' | 'EXCHANGE_OUTAGE';

interface ShockScenarioSpec {
  id: ShockScenarioId;
  cvar99Pct: number;
  marginBufferRemainPct: number;
  kellyCap: string;
  cascadeStatus: 'SAFE_BUFFER' | 'DELEVERAGE_TRIGGERED' | 'HALT_CIRCUIT_OPEN';
}

const SHOCK_SCENARIOS: Record<ShockScenarioId, ShockScenarioSpec> = {
  'FLASH_CRASH_-25%': {
    id: 'FLASH_CRASH_-25%',
    cvar99Pct: 14.2,
    marginBufferRemainPct: 68.5,
    kellyCap: '0.25x Half-Kelly',
    cascadeStatus: 'DELEVERAGE_TRIGGERED',
  },
  'CORRELATION_1.0_SPIKE': {
    id: 'CORRELATION_1.0_SPIKE',
    cvar99Pct: 11.8,
    marginBufferRemainPct: 76.0,
    kellyCap: '0.35x HRP-Capped',
    cascadeStatus: 'SAFE_BUFFER',
  },
  EXCHANGE_OUTAGE: {
    id: 'EXCHANGE_OUTAGE',
    cvar99Pct: 18.6,
    marginBufferRemainPct: 54.0,
    kellyCap: '0.00x Fail-Closed',
    cascadeStatus: 'HALT_CIRCUIT_OPEN',
  },
};

export function PortfolioCvarStressSimulator() {
  const [scenario, setScenario] = useState<ShockScenarioId>('FLASH_CRASH_-25%');

  const spec = SHOCK_SCENARIOS[scenario];

  return (
    <section
      aria-label="Cross-Margin CVaR 99% Tail-Risk and Liquidation Cascade Simulator"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <Flame size={20} className="text-[var(--color-loss)]" />
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Cross-Margin CVaR 99% Tail-Risk & Liquidation Cascade Simulator
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Phase 6 portfolio risk engine • Expected Shortfall (CVaR 99%) & Half-Kelly margin buffer
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
            Tail-Risk Shock Scenario Selector
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Shock scenario selector">
            {(['FLASH_CRASH_-25%', 'CORRELATION_1.0_SPIKE', 'EXCHANGE_OUTAGE'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScenario(s)}
                aria-pressed={scenario === s}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all ${
                  scenario === s
                    ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Stressed CVaR (99% 1d)</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)]">
              -{spec.cvar99Pct.toFixed(1)}%
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Remaining Margin Buffer</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">
              {spec.marginBufferRemainPct.toFixed(1)}%
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Cascade Guard Verdict</span>
            <div className="mt-1 font-mono text-base font-bold text-[var(--color-warning)] flex items-center gap-1.5">
              <AlertOctagon size={16} />
              <span>{spec.cascadeStatus}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
