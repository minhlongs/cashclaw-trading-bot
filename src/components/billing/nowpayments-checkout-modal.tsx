'use client';

import React, { useState } from 'react';
import type { SaasTier } from '@/ee/tenancy/tenant-policy';
import { SAAS_TIER_ENTITLEMENTS } from '@/ee/billing/tier-entitlements';

export interface CheckoutModalProps {
  isOpen: boolean;
  targetTier: SaasTier;
  workspaceId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function NowpaymentsCheckoutModal({
  isOpen,
  targetTier,
  workspaceId,
  onClose,
  onSuccess,
}: CheckoutModalProps) {
  const [currency, setCurrency] = useState<'USDT' | 'USDC' | 'BTC'>('USDT');
  const [loading, setLoading] = useState(false);
  const [invoiceCreated, setInvoiceCreated] = useState(false);

  if (!isOpen) return null;

  const ent = SAAS_TIER_ENTITLEMENTS[targetTier];

  const handleCreatePayment = () => {
    setLoading(true);
    // Simulate NOWPayments IPN checkout generation
    setTimeout(() => {
      setLoading(false);
      setInvoiceCreated(true);
      onSuccess?.();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Upgrade to {targetTier}</h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-lg leading-none">✕</button>
        </div>

        {!invoiceCreated ? (
          <div>
            <div className="bg-surface-raised p-4 rounded-lg mb-4 text-sm">
              <div className="flex justify-between mb-1"><span className="meta">Workspace:</span><span className="mono font-semibold">{workspaceId}</span></div>
              <div className="flex justify-between mb-1"><span className="meta">Plan Amount:</span><span className="mono font-bold text-profit">${ent.priceUsdMonthly} / month</span></div>
              <div className="flex justify-between"><span className="meta">Max Bots:</span><span className="mono">{ent.maxRunningPaperBots} Bots (24/7 Cloud)</span></div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wide meta">
                Select Crypto Currency
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['USDT', 'USDC', 'BTC'] as const).map((curr) => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setCurrency(curr)}
                    className={`py-2 px-3 text-xs font-mono rounded border transition ${
                      currency === curr
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-neutral-200 dark:border-neutral-800'
                    }`}
                  >
                    {curr}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleCreatePayment}
              className="w-full py-2.5 px-4 rounded bg-profit text-white font-medium text-sm hover:bg-profit/90 transition"
            >
              {loading ? 'Generating Invoice...' : `Pay $${ent.priceUsdMonthly} with ${currency}`}
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="text-4xl text-profit mb-2">✓</div>
            <h4 className="font-bold mb-1">Invoice Generated</h4>
            <p className="text-xs meta mb-4">
              Send exact payment via NOWPayments IPN. Tier activates automatically upon 1 confirmation.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-6 rounded bg-neutral-100 dark:bg-neutral-800 text-xs font-medium"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
