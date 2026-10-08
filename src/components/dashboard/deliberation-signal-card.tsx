'use client';

import { useTranslations } from 'next-intl';
import { Cpu, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';

interface DeliberationSignalCardProps {
  activeDebatesCount?: number;
  consensusScorePct?: number;
  paperCandidatesCount?: number;
  killedCount?: number;
}

export function DeliberationSignalCard({
  activeDebatesCount = 2,
  consensusScorePct = 88,
  paperCandidatesCount = 1,
  killedCount = 3,
}: DeliberationSignalCardProps) {
  const t = useTranslations('dashboard.deliberation');

  return (
    <div className="card mb-6 border border-subtle bg-surface">
      <div className="card-header flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-ai" />
          <div>
            <h2 className="text-base font-medium">{t('title')}</h2>
            <p className="text-xs text-secondary">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-profit">
          <ShieldCheck className="h-4 w-4" />
          <span>{t('failClosedMode')}</span>
        </div>
      </div>

      <div className="card-body grid grid-cols-2 gap-4 pt-2 sm:grid-cols-4">
        <div className="metric-box rounded border border-subtle bg-surface-muted p-3">
          <span className="text-xs text-secondary">{t('activeDebates')}</span>
          <div className="mt-1 font-mono text-lg font-semibold">{activeDebatesCount}</div>
        </div>

        <div className="metric-box rounded border border-subtle bg-surface-muted p-3">
          <span className="text-xs text-secondary">{t('consensusRate')}</span>
          <div className="mt-1 font-mono text-lg font-semibold text-profit">{consensusScorePct}%</div>
        </div>

        <div className="metric-box rounded border border-subtle bg-surface-muted p-3">
          <div className="flex items-center gap-1 text-xs text-profit">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>{t('paperCandidates')}</span>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-profit">{paperCandidatesCount}</div>
        </div>

        <div className="metric-box rounded border border-subtle bg-surface-muted p-3">
          <div className="flex items-center gap-1 text-xs text-loss">
            <XCircle className="h-3.5 w-3.5" />
            <span>{t('killedCount')}</span>
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-loss">{killedCount}</div>
        </div>
      </div>
    </div>
  );
}
