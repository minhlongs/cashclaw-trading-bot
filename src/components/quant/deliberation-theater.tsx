'use client';

import { useState, useMemo } from 'react';
import { MessageSquare, Hash, ShieldAlert } from 'lucide-react';
import { DEBATE_LOG, type DebateStage } from './deliberation-theater-model';
import { QuantScreenHeader } from './quant-screen-header';

export function DeliberationTheater() {
  const [stageFilter, setStageFilter] = useState<'ALL' | DebateStage>('ALL');
  const [riskVetoActive, setRiskVetoActive] = useState<boolean>(false);

  const visibleTurns = useMemo(() => {
    if (stageFilter === 'ALL') return DEBATE_LOG;
    return DEBATE_LOG.filter((t) => t.stage === stageFilter);
  }, [stageFilter]);

  const consensusStatus = riskVetoActive ? 'KILLED_BY_RISK_VETO' : 'PROMOTED_TO_PAPER_SHADOW';

  return (
    <section aria-label="Multi-Agent Deliberation Theater" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <QuantScreenHeader
        icon={<MessageSquare size={20} className="text-[var(--color-ai)]" />}
        title="Multi-Agent Deliberation Theater (TradingAgents Adapter)"
        subtitle="Bull vs Bear dialectical falsification • Hash-chained decision audit ledger • Zero order surface"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Consensus Confidence</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-ai)]">84.3% (Brier: 0.09)</div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Terminal Decision Verdict</span>
          <div className={`mt-1 font-mono text-base font-bold ${riskVetoActive ? 'text-[var(--color-loss)]' : 'text-[var(--color-profit)]'}`}>
            {consensusStatus}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--text-secondary)]">Risk Manager Veto Gate</span>
            <div className="mt-1 font-mono text-xs text-[var(--text-primary)]">{riskVetoActive ? 'VETO_ENFORCED' : 'ADVISORY_PASS'}</div>
          </div>
          <button
            type="button"
            onClick={() => setRiskVetoActive((v) => !v)}
            aria-pressed={riskVetoActive}
            className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-mono font-semibold border transition-all flex items-center gap-1.5 ${riskVetoActive ? 'bg-[var(--color-loss)] text-[var(--text-primary)] border-[var(--color-loss)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}
          >
            <ShieldAlert size={14} /><span>{riskVetoActive ? 'Clear Veto' : 'Trigger Veto'}</span>
          </button>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Hash-Chained Dialectical Transcript</h2>
          <div className="flex gap-2" role="group" aria-label="Debate stage filter">
            {(['ALL', 'BULL_VS_BEAR', 'RISK_AUDIT'] as const).map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => setStageFilter(stage)}
                aria-pressed={stageFilter === stage}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all ${stageFilter === stage ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}
              >
                {stage}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {visibleTurns.map((turn) => (
            <article key={turn.turnId} className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[rgba(167,139,250,0.15)] text-[var(--color-ai)]">
                    {turn.agent}
                  </span>
                  <span className="text-xs font-mono text-[var(--text-secondary)]">{turn.modelTier}</span>
                </div>
                <span className="text-xs font-mono text-[var(--color-profit)]">Conf: {(turn.confidence * 100).toFixed(0)}%</span>
              </div>
              <p className="text-sm text-[var(--text-primary)]">{turn.claim}</p>
              <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
                <Hash size={12} />
                <span>prev: {turn.prevHash}</span>
                <span>→</span>
                <span className="text-[var(--text-secondary)]">sha256: {turn.entryHash}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
