import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

interface QuantScreenHeaderProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly subtitle: string;
  readonly extraBadge?: ReactNode;
}

export function QuantScreenHeader({ icon, title, subtitle, extraBadge }: QuantScreenHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">{title}</h1>
          <p className="text-xs text-[var(--text-secondary)]">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extraBadge}
        <span
          role="status"
          aria-label="Safety mode PAPER_ONLY ADR-001"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[rgba(255,176,32,0.15)] text-[var(--color-warning)] border border-[rgba(255,176,32,0.35)]"
        >
          <ShieldCheck size={14} />
          <span>PAPER_ONLY • ADR-001</span>
        </span>
      </div>
    </header>
  );
}
