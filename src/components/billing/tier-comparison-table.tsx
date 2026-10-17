'use client';

import React from 'react';
import { SAAS_TIER_ENTITLEMENTS } from '@/ee/billing/tier-entitlements';
import type { SaasTier } from '@/ee/tenancy/tenant-policy';

export interface TierComparisonTableProps {
  currentTier?: SaasTier;
  onSelectTier?: (tier: SaasTier) => void;
}

const TIERS: readonly SaasTier[] = ['BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER'] as const;

export function TierComparisonTable({ currentTier = 'BASIC', onSelectTier }: TierComparisonTableProps) {
  return (
    <div className="panel overflow-x-auto">
      <div className="mb-4">
        <h3 className="text-lg font-bold">CashClaw SaaS Tiers & Entitlements</h3>
        <p className="meta">Choose the right plan to scale your 24/7 cloud paper trading operations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {TIERS.map((tier) => {
          const ent = SAAS_TIER_ENTITLEMENTS[tier];
          const isCurrent = currentTier === tier;

          return (
            <div
              key={tier}
              className={`border rounded-lg p-5 flex flex-col justify-between ${
                isCurrent ? 'border-primary shadow-sm bg-surface-raised' : 'border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm tracking-wide uppercase font-semibold">{tier}</span>
                  {isCurrent && (
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">Current</span>
                  )}
                </div>

                <div className="mt-3 mb-4">
                  <span className="text-3xl font-extrabold mono">${ent.priceUsdMonthly}</span>
                  <span className="text-xs meta"> / month</span>
                </div>

                <ul className="text-sm space-y-2 mb-6">
                  <li className="flex items-center gap-2">
                    <span className="text-profit">✓</span>
                    <span>Max Bots: <strong>{ent.maxRunningPaperBots}</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-profit">✓</span>
                    <span>Cron: <strong>{ent.minDurableCronIntervalMinutes}m</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={ent.cloudAlphaFeedAccess ? 'text-profit' : 'text-neutral-400'}>
                      {ent.cloudAlphaFeedAccess ? '✓' : '✗'}
                    </span>
                    <span>Cloud Alpha Feed</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={ent.deliberationManagedKeys ? 'text-profit' : 'text-neutral-400'}>
                      {ent.deliberationManagedKeys ? '✓' : '✗'}
                    </span>
                    <span>Managed LLM Keys</span>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                disabled={isCurrent}
                onClick={() => onSelectTier?.(tier)}
                className={`w-full py-2 px-3 rounded text-sm font-medium transition ${
                  isCurrent
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-default'
                    : 'bg-primary text-white hover:bg-primary/90'
                }`}
              >
                {isCurrent ? 'Active Plan' : ent.priceUsdMonthly === 0 ? 'Downgrade' : 'Upgrade Plan'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
