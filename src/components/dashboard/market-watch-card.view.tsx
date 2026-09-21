'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, RotateCcw, AlertTriangle } from 'lucide-react';
import type { SupportedExchange } from '@/app/api/tickers/route';
import { useMarketTicker } from '@/lib/hooks/use-market-ticker';
import { MarketWatchControls } from './market-watch-controls';
import { MarketWatchGrid } from './market-watch-grid';

export function MarketWatchCard() {
  const t = useTranslations('dashboard.marketWatch');
  const [exchange, setExchange] = useState<SupportedExchange>('binance');
  const [pair, setPair] = useState<string>('BTC/USDT');

  const {
    ticker,
    provenance,
    loading,
    error,
    isRateLimited,
    isCircuitOpen,
    refetch,
  } = useMarketTicker({
    exchange,
    symbol: pair,
    intervalMs: 15_000,
  });

  const spread = ticker ? Math.max(0, ticker.ask - ticker.bid) : 0;

  return (
    <div className="panel mt-6" data-testid="market-watch-card">
      <header className="panel-header">
        <div>
          <div className="panel-title flex items-center gap-2">
            <Activity size={18} className="text-ai" />
            <span>{t('title')}</span>
          </div>
          <p className="meta">{t('subtitle')}</p>
        </div>
        <div className="panel-actions flex items-center gap-2">
          <span className={`badge ${isCircuitOpen ? 'badge-warning' : 'badge-success'}`}>
            {isCircuitOpen ? t('circuitOpen') : t('circuitClosed')}
          </span>
          {provenance && (
            <span className="badge badge-neutral mono text-xs">
              {provenance.latencyMs}ms
            </span>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => void refetch()}
            disabled={loading}
            title={t('refresh')}
            aria-label={t('refresh')}
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <MarketWatchControls
        exchange={exchange}
        setExchange={setExchange}
        pair={pair}
        setPair={setPair}
      />

      {isRateLimited && (
        <div className="badge badge-warning text-xs mt-3 flex items-center gap-1">
          <AlertTriangle size={12} />
          <span>{t('rateLimited')}</span>
        </div>
      )}

      {error && !ticker && (
        <div className="text-loss text-sm mt-3">{error}</div>
      )}

      {ticker ? (
        <MarketWatchGrid
          ticker={ticker}
          exchange={exchange}
          pair={pair}
          spread={spread}
        />
      ) : (
        loading && (
          <div className="empty-state mt-4">
            <p className="text-secondary">{t('refresh')}...</p>
          </div>
        )
      )}
    </div>
  );
}
