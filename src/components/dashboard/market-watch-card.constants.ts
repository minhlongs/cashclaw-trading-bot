import type { SupportedExchange } from '@/app/api/tickers/route';

export const EXCHANGES: { id: SupportedExchange; label: string }[] = [
  { id: 'binance', label: 'Binance' },
  { id: 'okx', label: 'OKX' },
  { id: 'bybit', label: 'Bybit' },
];

export const MONITORED_PAIRS: { pair: string; label: string }[] = [
  { pair: 'BTC/USDT', label: 'BTC / USDT' },
  { pair: 'ETH/USDT', label: 'ETH / USDT' },
  { pair: 'SOL/USDT', label: 'SOL / USDT' },
];
