'use client';

import Link from 'next/link';

export const QUANT_TERMINAL_ROUTES = [
  { slug: 'dashboard', label: 'Cockpit Overview' },
  { slug: 'alpha-zoo', label: 'Alpha Zoo' },
  { slug: 'deliberation', label: 'Deliberation Theater' },
  { slug: 'bots', label: 'Volatility-DCA Bots' },
  { slug: 'correlation-matrix', label: 'Correlation Matrix' },
  { slug: 'execution-ledger', label: 'Execution Ledger' },
  { slug: 'data-quality-gate', label: 'Data Quality Gate' },
  { slug: 'microstructure', label: 'Microstructure L2' },
  { slug: 'survival-gate', label: 'Survival Gate' },
  { slug: 'sovereign-enclave', label: 'Sovereign Enclave' },
  { slug: 'relative-value-basis', label: 'Relative-Value Basis' },
  { slug: 'settings', label: 'SaaS Billing & Quota' },
  { slug: 'regime-attribution', label: 'Regime Attribution' },
  { slug: 'fdr-gate', label: 'FDR Gate' },
  { slug: 'style-guide', label: 'Style Guide' },
  { slug: 'portfolio-cvar-stress', label: 'CVaR Stress' },
  { slug: 'orderbook-imbalance-lob', label: 'Hawkes LOB' },
  { slug: 'rough-volatility-hurst', label: 'Rough Volatility' },
  { slug: 'leadlag-hayashi-yoshida', label: 'Hayashi-Yoshida' },
  { slug: 'optimal-execution-almgren-chriss', label: 'Almgren-Chriss' },
  { slug: 'regime-switching-hamilton-hmm', label: 'Hamilton HMM' },
  { slug: 'hrp-allocator', label: 'HRP Allocator' },
] as const;

export interface QuantRouteNavProps {
  readonly locale?: string;
  readonly activeSlug?: string;
}

export function QuantRouteNav({ locale = 'en', activeSlug }: QuantRouteNavProps) {
  return (
    <nav
      aria-label="CashClaw 22-Screen Quantitative Terminal Quick Navigation"
      className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-mono font-semibold text-[var(--text-secondary)]">
          22/22 QUANT OS ROUTES
        </span>
        <a
          href="#quant-main-content"
          className="text-xs font-mono text-[var(--color-accent)] underline focus-visible:outline-2 focus-visible:outline-[#00D4AA]"
        >
          Skip to main content
        </a>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUANT_TERMINAL_ROUTES.map((route) => {
          const isActive = route.slug === activeSlug;
          return (
            <Link
              key={route.slug}
              href={`/${locale}/${route.slug}`}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[44px] inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition-colors focus-visible:outline-2 focus-visible:outline-[#00D4AA] ${
                isActive
                  ? 'bg-[var(--color-accent)] text-[var(--bg-primary)] border-[var(--color-accent)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'
              }`}
            >
              {route.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
