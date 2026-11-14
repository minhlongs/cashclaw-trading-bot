'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
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
  | { readonly kind: 'vn-blocked'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string };

interface CheckoutApiBody {
  readonly ok?: boolean;
  readonly invoiceUrl?: string;
  readonly code?: string;
  readonly error?: string;
}

function classifyCheckoutError(status: number, body: CheckoutApiBody, fallback: string): CheckoutPhase {
  if (status === 451 || body.code === 'CRYPTO_CHECKOUT_BLOCKED_VN_JURISDICTION') {
    return { kind: 'vn-blocked', message: body.error ?? fallback };
  }
  if (status === 503) return { kind: 'provider-unavailable' };
  return { kind: 'failed', message: body.error ?? fallback };
}

function CheckoutStatusView({
  phase,
  targetTier,
  priceUsdMonthly,
  onRetry,
  onClose,
}: {
  readonly phase: Exclude<CheckoutPhase, { kind: 'idle' }>;
  readonly targetTier: SaasTier;
  readonly priceUsdMonthly: number;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}) {
  const t = useTranslations('billing.checkout');

  return (
    <div className="text-center py-4">
      {phase.kind === 'redirecting' && (
        <>
          <div className="text-4xl text-profit mb-2">✓</div>
          <h4 className="font-bold mb-1">{t('invoiceCreated')}</h4>
          <p className="text-xs meta mb-4">{t('redirectingDesc', { price: priceUsdMonthly })}</p>
          <a href={phase.invoiceUrl} className="inline-block py-2 px-6 rounded bg-profit text-white text-xs font-medium">
            {t('openPaymentPage')}
          </a>
        </>
      )}
      {phase.kind === 'provider-unavailable' && (
        <>
          <div className="text-4xl mb-2">⚠</div>
          <h4 className="font-bold mb-1">{t('unavailableTitle')}</h4>
          <p className="text-xs meta mb-4">{t('unavailableDesc', { tier: targetTier, price: priceUsdMonthly })}</p>
        </>
      )}
      {phase.kind === 'vn-blocked' && (
        <div data-testid="vn-jurisdiction-notice">
          <div className="text-4xl text-loss mb-2">⚠</div>
          <h4 className="font-bold mb-1">{t('vnBlockedTitle')}</h4>
          <p className="text-xs meta mb-4">{t('vnBlockedDesc')}</p>
        </div>
      )}
      {phase.kind === 'failed' ? (
        <>
          <div className="text-4xl text-loss mb-2">✕</div>
          <h4 className="font-bold mb-1">{t('failedTitle')}</h4>
          <p className="text-xs meta mb-4">{phase.message}</p>
          <button type="button" onClick={onRetry} className="py-2 px-6 rounded bg-neutral-100 dark:bg-neutral-800 text-xs font-medium">
            {t('tryAgain')}
          </button>
        </>
      ) : (
        <button type="button" onClick={onClose} className="mt-3 py-2 px-6 rounded bg-neutral-100 dark:bg-neutral-800 text-xs font-medium block mx-auto">
          {t('close')}
        </button>
      )}
    </div>
  );
}

export function NowpaymentsCheckoutModal({
  isOpen, targetTier, workspaceId, onClose, onSuccess,
}: CheckoutModalProps) {
  const t = useTranslations('billing.checkout');
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
      const body = (await res.json()) as CheckoutApiBody;
      if (!res.ok || !body.ok || !body.invoiceUrl) {
        setPhase(classifyCheckoutError(res.status, body, t('failedTitle')));
        return;
      }
      setPhase({ kind: 'redirecting', invoiceUrl: body.invoiceUrl });
      onSuccess?.();
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
          <h3 className="text-lg font-bold">{t('upgradeTo', { tier: targetTier })}</h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-lg leading-none">✕</button>
        </div>

        {phase.kind !== 'idle' ? (
          <CheckoutStatusView
            phase={phase}
            targetTier={targetTier}
            priceUsdMonthly={ent.priceUsdMonthly}
            onRetry={() => setPhase({ kind: 'idle' })}
            onClose={onClose}
          />
        ) : (
          <div>
            <div className="bg-surface-raised p-4 rounded-lg mb-4 text-sm">
              <div className="flex justify-between mb-1"><span className="meta">{t('workspace')}</span><span className="mono font-semibold">{workspaceId}</span></div>
              <div className="flex justify-between mb-1"><span className="meta">{t('planAmount')}</span><span className="mono font-bold text-profit">{t('perMonthAmount', { price: ent.priceUsdMonthly })}</span></div>
              <div className="flex justify-between"><span className="meta">{t('maxBots')}</span><span className="mono">{t('botsCloud', { count: ent.maxRunningPaperBots })}</span></div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold mb-2 uppercase tracking-wide meta">{t('selectCurrency')}</label>
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
              {loading ? t('creatingInvoice') : t('payWith', { price: ent.priceUsdMonthly, currency: currency.toUpperCase() })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
