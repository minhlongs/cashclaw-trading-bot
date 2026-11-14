'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import type { SaasTier } from '@/ee/tenancy/tenant-policy';
import { SAAS_TIER_ENTITLEMENTS } from '@/ee/billing/tier-entitlements';

export interface QuotaUsageProps {
  currentTier: SaasTier;
  runningBots: number;
  consumedCredits: number;
  totalCredits: number;
}

export function QuotaUsageCard({
  currentTier,
  runningBots,
  consumedCredits,
  totalCredits,
}: QuotaUsageProps) {
  const t = useTranslations('billing');
  const entitlement = SAAS_TIER_ENTITLEMENTS[currentTier];

  return (
    <div className="panel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="paper-simulation-badge"
            className="badge badge-warning text-xs font-mono"
          >
            {t('paperSimulationBadge')}
          </span>
          <span
            data-testid="non-custodial-saas-badge"
            className="text-xs px-2 py-0.5 rounded bg-surface-raised border border-neutral-200 dark:border-neutral-800 font-mono"
          >
            {t('nonCustodialBadge')}
          </span>
        </div>
        <span className="font-mono text-xs px-2 py-1 rounded bg-surface-raised border border-neutral-200 dark:border-neutral-800 uppercase font-semibold">
          {t('quota.planLabel', { tier: currentTier })}
        </span>
      </div>

      <div className="mb-4">
        <h3 className="text-base font-semibold">{t('quota.title')}</h3>
        <p className="meta text-xs">{t('quota.subtitle')}</p>
        <p className="meta text-xs mt-1">{t('separationNotice')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="meta">{t('quota.activePaperBots')}</span>
            <span className="mono font-semibold">
              {runningBots} / {entitlement.maxRunningPaperBots}
            </span>
          </div>
          <progress
            className="w-full h-2 rounded-full overflow-hidden accent-primary"
            value={runningBots}
            max={entitlement.maxRunningPaperBots}
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="meta">{t('quota.durableCronCadence')}</span>
            <span className="mono font-semibold">
              {t('quota.everyMinutes', { minutes: entitlement.minDurableCronIntervalMinutes })}
            </span>
          </div>
          <p className="meta text-xs mt-1">{t('quota.workersExecution')}</p>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="meta">{t('quota.llmCredits')}</span>
            <span className="mono font-semibold">
              {consumedCredits.toLocaleString()} / {totalCredits.toLocaleString()}
            </span>
          </div>
          <progress
            className="w-full h-2 rounded-full overflow-hidden accent-primary"
            value={consumedCredits}
            max={totalCredits}
          />
        </div>
      </div>
    </div>
  );
}
