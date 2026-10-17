'use client';

import { useState, useMemo } from 'react';
import { Zap, ShieldCheck } from 'lucide-react';
import {
  computeRoughVolatilityTelemetry,
  type RoughVolMode,
} from '@/forest/dashboard/quant-telemetry-service';

export function RoughVolatilityHurstDetector() {
  const [mode, setMode] = useState<RoughVolMode>('ROUGH_BURST');

  const telemetry = useMemo(() => computeRoughVolatilityTelemetry(mode), [mode]);

  return (
    <section
      aria-label="Gatheral Rough Volatility Hurst Exponent and Bipower Jump Detector"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <Zap size={20} className="text-[var(--color-ai)]" />
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              Gatheral Rough Volatility Hurst &amp; Bipower Jump Detector
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Wired to GatheralRoughVolatilityEngine &amp; runBipowerJumpEstimation (src/tree/quantlib/volatility)
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
            Fractional Log-Volatility Path Regime Selector
          </h2>
          <div className="flex gap-2" role="group" aria-label="Rough volatility regime selector">
            {(['ROUGH_BURST', 'SMOOTH_DIFFUSION'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${
                  mode === m
                    ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Hurst Exponent (H)</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-ai)]">
              H = {telemetry.hurstExponent.toFixed(4)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Surface Regime Verdict</span>
            <div
              className={`mt-1 font-mono text-base font-bold ${
                telemetry.isRoughRegime ? 'text-[var(--color-warning)]' : 'text-[var(--color-profit)]'
              }`}
            >
              {telemetry.isRoughRegime ? 'ROUGH_FRACTIONAL (H<0.45)' : 'SMOOTH_BROWNIAN'}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">BNS Jump Z-Score</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-loss)]">
              Z = {telemetry.jumpZScore.toFixed(2)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Bipower Jump Verdict</span>
            <div className="mt-1 font-mono text-sm font-bold text-[var(--text-primary)]">
              {telemetry.hasSignificantJump ? 'JUMP_DISCONTINUITY_DETECTED' : 'CONTINUOUS_DIFFUSION'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
