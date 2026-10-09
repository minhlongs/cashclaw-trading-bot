import type { ExchangeAdapter, Ticker, OrderBook, Balance } from '../types';

export async function fetchMarketTicker(adapter: ExchangeAdapter, symbol: string, getNow: () => number, onCost: (start: number) => void): Promise<Ticker> {
  const start = getNow();
  const res = await adapter.fetchTicker(symbol);
  onCost(start);
  return res;
}

export async function fetchMarketOrderBook(adapter: ExchangeAdapter, symbol: string, depth: number | undefined, getNow: () => number, onCost: (start: number) => void): Promise<OrderBook> {
  const start = getNow();
  const res = await adapter.fetchOrderBook(symbol, depth);
  onCost(start);
  return res;
}

export async function fetchMarketBalances(adapter: ExchangeAdapter, getNow: () => number, onCost: (start: number) => void): Promise<Balance[]> {
  const start = getNow();
  const res = await adapter.fetchBalances();
  onCost(start);
  return res;
}
