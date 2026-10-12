import type { Exchange as CCXTExchange } from 'ccxt';
import type { CCXTTickerResult, CCXTOrderBookResult, CCXTBalanceResult } from './client-types';
import { mapCCXTTicker, mapCCXTOrderBook, mapCCXTBalances } from './client-mappers';

export async function fetchCCXTTicker(ex: CCXTExchange, symbol: string): Promise<CCXTTickerResult> {
  const ticker = await ex.fetchTicker(symbol);
  return mapCCXTTicker(ticker, symbol);
}

export async function fetchCCXTOrderBook(ex: CCXTExchange, symbol: string, depth = 20): Promise<CCXTOrderBookResult> {
  const book = await ex.fetchOrderBook(symbol, depth);
  return mapCCXTOrderBook(book, symbol);
}

export async function fetchCCXTBalances(ex: CCXTExchange): Promise<CCXTBalanceResult[]> {
  const raw = await ex.fetchBalance();
  return mapCCXTBalances(raw);
}
