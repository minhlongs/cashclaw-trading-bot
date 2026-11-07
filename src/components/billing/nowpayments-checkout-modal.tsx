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

type CheckoutPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'redirecting'; readonly invoiceUrl: string }
  | { readonly kind: 'provider-unavailable' }
  | { readonly kind: 'failed'; readonly message: string };

export function NowpaymentsCheckoutModal({
  isOpen, targetTier, workspaceId, onClose, onSuccess,
}: CheckoutModalProps) {
  const [currency, setCurrency] = useState<'usdt' | 'usdc' | 'btc'>('usdt');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<CheckoutPhase>({ kind: 'idle' });

  if (!isOpen) return null;
  const ent = SAAS_TIER_ENTITLEMENTS[targetTier];

  const handleCreatePayment = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ee/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTier, payCurrency: currency }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        invoiceUrl?: string;
        error?: string;
      };

      if (!res.ok || !body.ok || !body.invoiceUrl) {
        // 503 means the provider is not configured on this deployment. Showing a
        // fake success would take the customer's money without an invoice.
        setPhase(
          res.status === 503
            ? { kind: 'provider-unavailable' }
            : { kind: 'failed', message: body.error ?? 'Checkout failed' },
        );
        return;
      }

      setPhase({ kind: 'redirecting', invoiceUrl: body.invoiceUrl });
      onSuccess?.();
      // The hosted NOWPayments page owns payment from here; leaving this page
      // must not cancel the redirect, so the assignment is not awaited.
      window.location.href = body.invoiceUrl;
    } catch (cause) {
      setPhase({ kind: 'failed', message: (cause as Error).message });
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

        {phase.kind !== 'idle' ? (
          <div className="text-center py-4">
            {phase.kind === 'redirecting' ? (
              <>
                <div className="text-4xl text-profit mb-2">✓</div>
                <h4 className="font-bold mb-1">Invoice Created</h4>
                <p className="text-xs meta mb-4">
                  Redirecting you to NOWPayments to pay ${ent.priceUsdMonthly}. Your tier
                  upgrades automatically once the payment confirms.
                </p>
                <a
                  href={phase.invoiceUrl}
                  className="inline-block py-2 px-6 rounded bg-profit text-white text-xs font-medium"
                >
                  Open payment page
                </a>
              </>
            ) : null}

            {phase.kind === 'provider-unavailable' ? (
              <>
                <div className="text-4xl mb-2">⚠</div>
                <h4 className="font-bold mb-1">Card / crypto checkout unavailable</h4>
                <p className="text-xs meta mb-4">
                  Automatic invoicing is not configured on this deployment. Please contact
                  support to arrange payment for the {targetTier} plan (${ent.priceUsdMonthly}/month).
                </p>
              </>
            ) : null}

            {phase.kind === 'failed' ? (
              <>
                <div className="text-4xl text-loss mb-2">✕</div>
                <h4 className="font-bold mb-1">Checkout failed</h4>
                <p className="text-xs meta mb-4">{phase.message}</p>
                <button
                  type="button"
                  onClick={() => setPhase({ kind: 'idle' })}
                  className="py-2 px-6 rounded bg-neutral-100 dark:bg-neutral-800 text-xs font-medium"
                >
                  Try again
                </button>
              </>
            ) : null}

            {phase.kind === 'provider-unavailable' || phase.kind === 'redirecting' ? (
              <button
                type="button"
                onClick={onClose}
                className="mt-3 py-2 px-6 rounded bg-neutral-100 dark:bg-neutral-800 text-xs font-medium block mx-auto"
              >
                Close
              </button>
            ) : null}
          </div>
        ) : (
          <div>
            <div className="bg-surface-raised p-4 rounded-lg mb-4 text-sm">
              <div className="flex justify-between mb-1"><span className="meta">Workspace:</span><span className="mono font-semibold">{workspaceId}</span></div>
              <div className="flex justify-between mb-1"><span className="meta">Plan Amount:</span><span className="mono font-bold text-profit">${ent.priceUsdMonthly} / month</span></div>
              <div className="flex justify-between"><span className="meta">Max Bots:</span><span className="mono">{ent.maxRunningPaperBots} Bots (24/7 Cloud)</span></div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wide meta">Select Crypto Currency</label>
              <div className="grid grid-cols-3 gap-2">
                {(['usdt', 'usdc', 'btc'] as const).map((curr) => (
                  <button
                    key={curr}
                    type="button"
                    onClick={() => setCurrency(curr)}
                    className={`py-2 px-3 text-xs font-mono rounded border transition uppercase ${currency === curr ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-neutral-200 dark:border-neutral-800'}`}
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
              className="w-full py-2.5 px-4 rounded bg-profit text-white font-medium text-sm hover:bg-profit/90 transition disabled:opacity-60"
            >
              {loading ? 'Creating invoice...' : `Pay $${ent.priceUsdMonthly} with ${currency.toUpperCase()}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
