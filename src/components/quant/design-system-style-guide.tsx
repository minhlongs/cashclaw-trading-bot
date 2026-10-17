'use client';

import { useState, useMemo } from 'react';
import { Palette, ShieldCheck, Type } from 'lucide-react';
import {
  TOKEN_GROUP_FILTERS,
  filterColorSwatches,
  type TokenGroup,
} from './design-system-style-guide-model';

export function DesignSystemStyleGuide() {
  const [activeGroup, setActiveGroup] = useState<'ALL' | TokenGroup>('ALL');
  const visibleSwatches = useMemo(() => filterColorSwatches(activeGroup), [activeGroup]);

  return (
    <section aria-label="CashClaw OS Design System Style Guide" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <Palette size={20} className="text-[var(--color-accent)]" />
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">
              CashClaw Quant OS — Design System & Accessibility Style Guide
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Synced with DESIGN.md • Geist Sans + JetBrains Mono • 12px Card / 8px Control / 44px Touch Target
            </p>
          </div>
        </div>
        <span role="status" aria-label="Safety mode PAPER_ONLY ADR-001" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[rgba(255,176,32,0.15)] text-[var(--color-warning)] border border-[rgba(255,176,32,0.35)]">
          <ShieldCheck size={14} /><span>PAPER_ONLY • ADR-001</span>
        </span>
      </header>

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Semantic Color Token Matrix ({visibleSwatches.length} Tokens)
          </h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Color token group filter">
            {TOKEN_GROUP_FILTERS.map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => setActiveGroup(group)}
                aria-pressed={activeGroup === group}
                className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all ${
                  activeGroup === group ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
                }`}
              >
                {group}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleSwatches.map((swatch) => (
            <div key={swatch.token} className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg border border-[var(--border-default)] shrink-0" style={{ backgroundColor: swatch.hex }} aria-hidden="true" />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[var(--text-primary)]">{swatch.token}</span>
                  <span className="font-mono text-[11px] text-[var(--color-accent)]">{swatch.hex}</span>
                </div>
                <span className="text-xs text-[var(--text-secondary)] truncate">{swatch.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Type size={16} className="text-[var(--color-ai)]" /><span>Typography Scale (Geist & JetBrains Mono)</span>
          </h2>
          <div className="flex flex-col gap-2 text-xs">
            <div className="p-3 rounded-lg bg-[var(--bg-elevated)] flex justify-between items-center">
              <span className="font-semibold text-base text-[var(--text-primary)]">Geist Sans UI Heading</span>
              <span className="font-mono text-[var(--text-secondary)]">--font-sans (600)</span>
            </div>
            <div className="p-3 rounded-lg bg-[var(--bg-elevated)] flex justify-between items-center">
              <span className="font-mono text-sm text-[var(--color-profit)]">SR: +1.92 • IC: +0.042 • sha256:9a4f82e1</span>
              <span className="font-mono text-[var(--text-secondary)]">--font-mono</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Interactive Geometry & A11y Primitives (44px Floor)</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="min-h-[44px] px-4 py-2 rounded-lg bg-[var(--color-accent)] text-[var(--bg-primary)] font-semibold text-xs">
              Primary CTA (8px Radius • 44px Height)
            </button>
            <button type="button" className="min-h-[44px] px-4 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] font-semibold text-xs">
              Secondary Action
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
