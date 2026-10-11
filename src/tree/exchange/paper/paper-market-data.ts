import type { ExchangeId, Ticker, OrderBook, Balance } from '../types';
import { rateLimiter } from '../rate-limiter';
import type { MarketDataFetcher } from './paper-types';

export async function fetchPaperTicker(exchangeId: ExchangeId, symbol: string, fetcher?: MarketDataFetcher): Promise<Ticker> {
  await rateLimiter.acquire(exchangeId, 'api');
  if (fetcher) {
    try { return await fetcher(exchangeId, symbol); } catch { /* fall back to simulated ticker */ }
  }
  return { symbol, last: 0, bid: 0, ask: 0, high24h: 0, low24h: 0, volume24h: 0, timestamp: Date.now() };
}

export async function fetchPaperOrderBook(exchangeId: ExchangeId, symbol: string, _depth = 20): Promise<OrderBook> {
  await rateLimiter.acquire(exchangeId, 'api');
  return { symbol, bids: [], asks: [], timestamp: Date.now() };
}

export async function fetchPaperBalances(exchangeId: ExchangeId, balances: Map<string, { free: number; used: number }>): Promise<Balance[]> {
  await rateLimiter.acquire(exchangeId, 'api');
  return Array.from(balances.entries()).map(([currency, { free, used }]) => ({ currency, free, used, total: free + used }));
}
