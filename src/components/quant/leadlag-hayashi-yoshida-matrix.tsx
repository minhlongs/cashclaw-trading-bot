'use client';

import { useState, useMemo } from 'react';
import { GitBranch } from 'lucide-react';
import {
  computeLeadLagTelemetry,
  type LeadLagPairId,
} from '@/forest/dashboard/quant-telemetry-service';
import { QuantScreenHeader } from './quant-screen-header';

export function LeadlagHayashiYoshidaMatrix() {
  const [pairId, setPairId] = useState<LeadLagPairId>('BTC_PERP->ETH_SPOT');

  const telemetry = useMemo(() => computeLeadLagTelemetry(pairId), [pairId]);

  return (
    <section
      aria-label="Hayashi-Yoshida Asynchronous Lead-Lag Cross-Asset Matrix"
      className="flex flex-col gap-6 w-full max-w-7xl mx-auto"
    >
      <QuantScreenHeader
        icon={<GitBranch size={20} className="text-[var(--color-accent)]" />}
        title="Hayashi-Yoshida Asynchronous Lead-Lag Cross-Asset Matrix"
        subtitle="Wired to HayashiYoshidaEngine (src/tree/quantlib/leadlag) • Overlap-weighted tick covariance"
      />

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Leader-Follower Tick Pair Selector
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Lead-lag pair selector">
            {(['BTC_PERP->ETH_SPOT', 'ETH_PERP->SOL_SPOT', 'SOL_PERP->AVAX_SPOT'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setPairId(id)}
                aria-pressed={pairId === id}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${
                  pairId === id
                    ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                }`}
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Optimal Lead-Lag τ*</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)]">
              +{telemetry.optimalLagMs} ms
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">PeakHY Cross-Correlation</span>
            <div className="mt-1 font-mono text-xl font-bold text-[var(--color-profit)]">
              ρ = {telemetry.peakCorrelation.toFixed(4)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
            <span className="text-xs text-[var(--text-secondary)]">Information Share Verdict</span>
            <div className="mt-1 font-mono text-base font-bold text-[var(--color-ai)]">
              {telemetry.isLeader ? 'LEADER_CONFIRMED' : 'SYNCHRONOUS_NO_LAG'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
