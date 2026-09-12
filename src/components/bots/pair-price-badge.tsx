'use client';

import { useTranslations } from 'next-intl';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useMarketTicker } from '@/lib/hooks/use-market-ticker';

export interface PairPriceBadgeProps {
  exchange: string;
  pair: string;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  const decimals = value < 1 ? 4 : 2;
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function PairPriceBadge({ exchange, pair }: PairPriceBadgeProps) {
  const t = useTranslations('botWizard.priceDiscovery');
  const isEnabled = Boolean(exchange && pair);

  const {
    ticker,
    provenance,
    loading,
    error,
    isRateLimited,
    isCircuitOpen,
  } = useMarketTicker({
    exchange,
    symbol: pair,
    enabled: isEnabled,
    intervalMs: 15_000,
  });

  if (!isEnabled) {
    return null;
  }

  if (loading && !ticker) {
    return (
      <div className="flex items-center gap-2 text-secondary text-sm mt-1" data-testid="pair-price-loading">
        <Loader2 size={14} className="animate-spin" />
        <span>{t('fetchingPrice')}</span>
      </div>
    );
  }

  if (error && !ticker) {
    return (
      <div className="flex items-center gap-2 mt-1" data-testid="pair-price-error">
        <span className="badge badge-neutral mono text-xs">{t('unavailable')}</span>
        {isCircuitOpen && (
          <span className="badge badge-warning text-xs flex items-center gap-1">
            <AlertTriangle size={12} />
            {t('circuitActive')}
          </span>
        )}
      </div>
    );
  }

  if (!ticker) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1" data-testid="pair-price-badge">
      <span className="badge badge-profit mono font-semibold">
        {formatPrice(ticker.last)}
      </span>
      {provenance && (
        <span className="text-secondary mono text-xs">
          {provenance.latencyMs}ms
        </span>
      )}
      {isCircuitOpen && (
        <span className="badge badge-warning text-xs flex items-center gap-1">
          <AlertTriangle size={12} />
          {t('circuitActive')}
        </span>
      )}
      {isRateLimited && (
        <span className="badge badge-neutral text-xs">
          {t('rateLimited')}
        </span>
      )}
    </div>
  );
}
