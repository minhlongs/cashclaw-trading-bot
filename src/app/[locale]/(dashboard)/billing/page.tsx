'use client';

import React, { useState } from 'react';
import type { SaasTier } from '@/ee/tenancy/tenant-policy';
import { TierComparisonTable } from '@/components/billing/tier-comparison-table';
import { QuotaUsageCard } from '@/components/billing/quota-usage-card';
import { NowpaymentsCheckoutModal } from '@/components/billing/nowpayments-checkout-modal';
import { CliSyncBridgeCard } from '@/components/billing/cli-sync-bridge-card';

export default function BillingPage() {
  const [currentTier, setCurrentTier] = useState<SaasTier>('BASIC');
  const [selectedTier, setSelectedTier] = useState<SaasTier | null>(null);
  const workspaceId = 'ws_production_default';

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
        runningBots={1}
        consumedCredits={250}
        totalCredits={1000}
      />

      <TierComparisonTable
        currentTier={currentTier}
        onSelectTier={(tier) => setSelectedTier(tier)}
      />

      <CliSyncBridgeCard workspaceId={workspaceId} />

      {selectedTier && (
        <NowpaymentsCheckoutModal
          isOpen={Boolean(selectedTier)}
          targetTier={selectedTier}
          workspaceId={workspaceId}
          onClose={() => setSelectedTier(null)}
          onSuccess={() => {
            setCurrentTier(selectedTier);
          }}
        />
      )}
    </div>
  );
}
