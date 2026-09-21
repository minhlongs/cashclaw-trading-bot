'use client';

import { useTranslations } from 'next-intl';
import type { SupportedExchange } from '@/app/api/tickers/route';
import { EXCHANGES, MONITORED_PAIRS } from './market-watch-card.constants';

interface MarketWatchControlsProps {
  exchange: SupportedExchange;
  setExchange: (exchange: SupportedExchange) => void;
  pair: string;
  setPair: (pair: string) => void;
}

export function MarketWatchControls({ exchange, setExchange, pair, setPair }: MarketWatchControlsProps) {
  const t = useTranslations('dashboard.marketWatch');

  return (
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
  );
}
