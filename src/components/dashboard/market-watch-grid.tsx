'use client';

import { useTranslations } from 'next-intl';
import { formatCurrency, formatVolume } from './market-watch-card.formatters';

interface MarketWatchGridProps {
  ticker: {
    last: number;
    high24h: number;
    low24h: number;
    bid: number;
    ask: number;
    volume24h: number;
  };
  exchange: string;
  pair: string;
  spread: number;
}

export function MarketWatchGrid({ ticker, exchange, pair, spread }: MarketWatchGridProps) {
  const t = useTranslations('dashboard.marketWatch');

  return (
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
  );
}
