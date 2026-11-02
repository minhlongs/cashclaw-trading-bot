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

export function NowpaymentsCheckoutModal({ isOpen, targetTier, workspaceId, onClose }: CheckoutModalProps) {
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!isOpen) return null;
  const ent = SAAS_TIER_ENTITLEMENTS[targetTier];

  const handleCreateOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ee/billing/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetTier, workspaceId }),
      });
      const result = await response.json() as { ok?: boolean; order?: { orderId?: string }; error?: string };
      if (!response.ok || !result.ok || !result.order?.orderId) {
        setError(result.error ?? 'Unable to create a billing order.');
        return;
      }
      setOrderId(result.order.orderId);
    } catch {
      setError('Billing service unavailable. No payment was initiated.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Upgrade to {targetTier}</h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-lg leading-none">✕</button>
        </div>

        <div className="bg-surface-raised p-4 rounded-lg mb-4 text-sm">
          <div className="flex justify-between mb-1"><span className="meta">Workspace:</span><span className="mono font-semibold">{workspaceId}</span></div>
          <div className="flex justify-between mb-1"><span className="meta">Plan Amount:</span><span className="mono font-bold text-profit">${ent.priceUsdMonthly} / month</span></div>
          <div className="flex justify-between"><span className="meta">Max Bots:</span><span className="mono">{ent.maxRunningPaperBots} Bots (24/7 Cloud)</span></div>
        </div>

        {!orderId ? (
          <>
            <p className="text-xs meta mb-4">Payment provider checkout is not configured. Creating an order will not create an invoice or charge you.</p>
            {error && <p role="alert" className="text-xs text-loss mb-3">{error}</p>}
            <button type="button" disabled={loading || targetTier === 'BASIC'} onClick={handleCreateOrder}
              className="w-full py-2.5 px-4 rounded bg-profit text-white font-medium text-sm hover:bg-profit/90 transition disabled:opacity-50">
              {loading ? 'Creating Order...' : `Create ${targetTier} Order`}
            </button>
          </>
        ) : (
          <div className="text-center py-2">
            <h4 className="font-bold mb-2">Pending order recorded</h4>
            <p className="text-xs meta mb-2">No invoice was created and no payment was initiated. Your tier remains unchanged until a verified, order-bound provider callback is processed.</p>
            <p className="text-xs mono break-all mb-4">Order ID: {orderId}</p>
            <button type="button" onClick={onClose} className="py-2 px-6 rounded bg-neutral-100 dark:bg-neutral-800 text-xs font-medium">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
