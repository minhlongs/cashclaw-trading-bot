'use client';

import React, { useState } from 'react';
import type { SaasTier } from '@/ee/tenancy/tenant-policy';
import { TierComparisonTable } from '@/components/billing/tier-comparison-table';
import { QuotaUsageCard } from '@/components/billing/quota-usage-card';
import { NowpaymentsCheckoutModal } from '@/components/billing/nowpayments-checkout-modal';
import { CliSyncBridgeCard } from '@/components/billing/cli-sync-bridge-card';
import { useWorkspaceBilling } from '@/components/billing/use-workspace-billing';

export default function BillingPage() {
  const [selectedTier, setSelectedTier] = useState<SaasTier | null>(null);
  const {
    currentTier,
    runningBots,
    consumedCredits,
    totalCredits,
    refreshBilling,
    workspaceId,
  } = useWorkspaceBilling();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Billing & SaaS Entitlements</h1>
        <p className="meta text-sm">
          Manage your cloud paper trading subscriptions, quotas, and multi-tenant licenses.
        </p>
      </div>

      <QuotaUsageCard
        currentTier={currentTier}
        runningBots={runningBots}
        consumedCredits={consumedCredits}
        totalCredits={totalCredits}
      />

      <TierComparisonTable
        currentTier={currentTier}
        onSelectTier={(tier) => setSelectedTier(tier)}
      />

      <CliSyncBridgeCard workspaceId={workspaceId ?? 'personal'} />

      {selectedTier && (
        <NowpaymentsCheckoutModal
          isOpen={Boolean(selectedTier)}
          targetTier={selectedTier}
          workspaceId={workspaceId ?? 'personal'}
          onClose={() => setSelectedTier(null)}
          onSuccess={() => {
            void refreshBilling();
          }}
        />
      )}

      {selectedTier && !workspaceId && (
        <p className="meta text-sm">
          Sign in before paying: your workspace is provisioned on the first checkout.
        </p>
      )}
    </div>
  );
}
