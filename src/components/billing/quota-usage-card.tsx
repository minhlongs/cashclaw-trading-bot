'use client';

import React from 'react';
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
  const entitlement = SAAS_TIER_ENTITLEMENTS[currentTier];

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Tier Quota Usage</h3>
          <p className="meta text-xs">Real-time resource allocation for current billing cycle</p>
        </div>
        <span className="font-mono text-xs px-2 py-1 rounded bg-surface-raised border border-neutral-200 dark:border-neutral-800 uppercase font-semibold">
          {currentTier} Plan
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="meta">Active Paper Bots</span>
            <span className="mono font-semibold">{runningBots} / {entitlement.maxRunningPaperBots}</span>
          </div>
          <progress
            className="w-full h-2 rounded-full overflow-hidden accent-primary"
            value={runningBots}
            max={entitlement.maxRunningPaperBots}
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="meta">Durable Cron Cadence</span>
            <span className="mono font-semibold">Every {entitlement.minDurableCronIntervalMinutes} min</span>
          </div>
          <p className="meta text-xs mt-1">Cloudflare Workers isolate execution</p>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="meta">LLM Deliberation Credits</span>
            <span className="mono font-semibold">{consumedCredits.toLocaleString()} / {totalCredits.toLocaleString()}</span>
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
