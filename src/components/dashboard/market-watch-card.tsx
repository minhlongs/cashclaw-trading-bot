'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, RotateCcw, AlertTriangle } from 'lucide-react';
import type { SupportedExchange } from '@/app/api/tickers/route';
import { useMarketTicker } from '@/lib/hooks/use-market-ticker';

const EXCHANGES: { id: SupportedExchange; label: string }[] = [
  { id: 'binance', label: 'Binance' },
  { id: 'okx', label: 'OKX' },
  { id: 'bybit', label: 'Bybit' },
];

const MONITORED_PAIRS: { pair: string; label: string }[] = [
  { pair: 'BTC/USDT', label: 'BTC / USDT' },
  { pair: 'ETH/USDT', label: 'ETH / USDT' },
  { pair: 'SOL/USDT', label: 'SOL / USDT' },
];

function formatCurrency(val: number): string {
  if (!Number.isFinite(val)) return '$0.00';
  const decimals = val < 1 ? 4 : 2;
  return `$${val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatVolume(val: number): string {
  if (!Number.isFinite(val)) return '0.00';
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

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

      <div className="flex flex-wrap justify-between items-center gap-3 mt-4">
        <div className="flex items-center gap-1" role="tablist" aria-label={t('exchange')}>
          {EXCHANGES.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className={`btn btn-xs ${exchange === ex.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setExchange(ex.id)}
            >
              {ex.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={t('pair')}>
          {MONITORED_PAIRS.map((item) => (
            <button
              key={item.pair}
              type="button"
              className={`btn btn-xs ${pair === item.pair ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPair(item.pair)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

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
        <div className="grid-auto-fit mt-4 gap-3">
          <div className="card">
            <span className="text-secondary text-xs">{t('lastPrice')}</span>
            <p className="mono font-semibold text-profit text-lg">
              {formatCurrency(ticker.last)}
            </p>
            <span className="meta mono text-xs">{exchange.toUpperCase()} · {pair}</span>
          </div>
          <div className="card">
            <span className="text-secondary text-xs">{t('high24h')} / {t('low24h')}</span>
            <p className="mono text-sm">
              <span className="text-profit">{formatCurrency(ticker.high24h)}</span>
              {' / '}
              <span className="text-loss">{formatCurrency(ticker.low24h)}</span>
            </p>
            <span className="meta text-xs">24h Range</span>
          </div>
          <div className="card">
            <span className="text-secondary text-xs">{t('bidAsk')}</span>
            <p className="mono text-sm">
              {formatCurrency(ticker.bid)} / {formatCurrency(ticker.ask)}
            </p>
            <span className="meta mono text-xs">{t('spread')}: {formatCurrency(spread)}</span>
          </div>
          <div className="card">
            <span className="text-secondary text-xs">{t('volume24h')}</span>
            <p className="mono font-semibold text-sm">
              {formatVolume(ticker.volume24h)}
            </p>
            <span className="meta text-xs">Base Volume</span>
          </div>
        </div>
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
