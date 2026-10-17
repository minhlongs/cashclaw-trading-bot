'use client';

import { useState } from 'react';
import { Flame, AlertOctagon } from 'lucide-react';
import { QuantScreenHeader } from './quant-screen-header';

type ShockScenarioId = 'FLASH_CRASH_-25%' | 'CORRELATION_1.0_SPIKE' | 'EXCHANGE_OUTAGE';

const SHOCK_SCENARIOS: Record<
  ShockScenarioId,
  { cvar99Pct: number; marginBufferRemainPct: number; cascadeStatus: string }
> = {
  'FLASH_CRASH_-25%': { cvar99Pct: 14.2, marginBufferRemainPct: 68.5, cascadeStatus: 'DELEVERAGE_TRIGGERED' },
  'CORRELATION_1.0_SPIKE': { cvar99Pct: 11.8, marginBufferRemainPct: 76.0, cascadeStatus: 'SAFE_BUFFER' },
  EXCHANGE_OUTAGE: { cvar99Pct: 18.6, marginBufferRemainPct: 54.0, cascadeStatus: 'HALT_CIRCUIT_OPEN' },
};

export function PortfolioCvarStressSimulator() {
  const [scenario, setScenario] = useState<ShockScenarioId>('FLASH_CRASH_-25%');

  const spec = SHOCK_SCENARIOS[scenario];

  return (
    <section aria-label="Cross-Margin CVaR 99% Tail-Risk and Liquidation Cascade Simulator" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<Flame size={20} className="text-[var(--color-loss)]" />}
        title="Cross-Margin CVaR 99% Tail-Risk & Liquidation Cascade Simulator"
        subtitle="Phase 6 portfolio risk engine • Expected Shortfall (CVaR 99%) & Half-Kelly margin buffer"
      />

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Tail-Risk Shock Scenario Selector</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Shock scenario selector">
            {(['FLASH_CRASH_-25%', 'CORRELATION_1.0_SPIKE', 'EXCHANGE_OUTAGE'] as const).map((s) => (
              <button key={s} type="button" onClick={() => setScenario(s)} aria-pressed={scenario === s} className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${scenario === s ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Stressed CVaR (99% 1d)</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)]">-{spec.cvar99Pct.toFixed(1)}%</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Remaining Margin Buffer</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">{spec.marginBufferRemainPct.toFixed(1)}%</div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Cascade Guard Verdict</span>
            <div className="mt-1 font-mono text-base font-bold text-[var(--color-warning)] flex items-center gap-1.5">
              <AlertOctagon size={16} /><span>{spec.cascadeStatus}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
