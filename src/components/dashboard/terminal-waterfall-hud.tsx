'use client';

import { useTranslations } from 'next-intl';
import { Layers, ShieldCheck, Activity, Gauge } from 'lucide-react';

interface TerminalWaterfallHudProps {
  darkMeshNettingPct?: number;
  urgencyState?: string;
  sliceCount?: number;
  routedVolumeUsd?: number;
  deltaExposure?: number;
  gammaExposure?: number;
  vegaExposure?: number;
}

export function TerminalWaterfallHud({
  darkMeshNettingPct = 42.5,
  urgencyState = 'NORMAL',
  sliceCount = 5,
  routedVolumeUsd = 125000,
  deltaExposure = 0.85,
  gammaExposure = 0.04,
  vegaExposure = 12.3,
}: TerminalWaterfallHudProps) {
  const t = useTranslations('dashboard.waterfallHud');

  return (
    <div className="card mb-6 border border-subtle bg-surface">
      <div className="card-header flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-ai" />
          <div>
            <h2 className="text-base font-medium">{t('title')}</h2>
            <p className="text-xs text-secondary">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-profit">
          <ShieldCheck className="h-4 w-4" />
          <span>Institutional OMS</span>
        </div>
      </div>

      <div className="card-body grid grid-cols-2 gap-4 pt-2 sm:grid-cols-4">
        <div className="metric-box rounded border border-subtle bg-surface-muted p-3">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>{t('darkMeshCrossing')}</span>
            <Activity className="h-3.5 w-3.5 text-ai" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold text-profit">
            {darkMeshNettingPct.toFixed(1)}%
          </div>
        </div>

        <div className="metric-box rounded border border-subtle bg-surface-muted p-3">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>{t('urgencyGuard')}</span>
            <ShieldCheck className="h-3.5 w-3.5 text-profit" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold">{urgencyState}</div>
        </div>

        <div className="metric-box rounded border border-subtle bg-surface-muted p-3">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>{t('twapSlices')}</span>
            <Gauge className="h-3.5 w-3.5 text-secondary" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold">{sliceCount} chunks</div>
        </div>

        <div className="metric-box rounded border border-subtle bg-surface-muted p-3">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span>{t('sorRouting')}</span>
            <Activity className="h-3.5 w-3.5 text-ai" />
          </div>
          <div className="mt-1 font-mono text-lg font-semibold">
            ${(routedVolumeUsd / 1000).toFixed(1)}k
          </div>
        </div>
      </div>

      <div className="border-t border-subtle px-4 py-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center justify-between rounded bg-surface-muted px-2.5 py-1.5">
            <span className="text-secondary">{t('deltaRisk')}</span>
            <span className="font-mono font-medium text-profit">Δ {deltaExposure.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between rounded bg-surface-muted px-2.5 py-1.5">
            <span className="text-secondary">{t('gammaRisk')}</span>
            <span className="font-mono font-medium text-ai">Γ {gammaExposure.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between rounded bg-surface-muted px-2.5 py-1.5">
            <span className="text-secondary">{t('vegaRisk')}</span>
            <span className="font-mono font-medium text-secondary">ν {vegaExposure.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
