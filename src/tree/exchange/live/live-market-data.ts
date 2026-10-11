import { rateLimiter } from '../rate-limiter';
import type { ExchangeId, Ticker, OrderBook, Balance, OrderResult } from '../types';
import type { createCCXTClient } from '../ccxt/client';

type CCXTClient = ReturnType<typeof createCCXTClient>;

export async function fetchLiveTicker(id: ExchangeId, client: CCXTClient, symbol: string): Promise<Ticker> {
  await rateLimiter.acquire(id, 'api');
  return client.fetchTicker(id, symbol) as Promise<Ticker>;
}

export async function fetchLiveOrderBook(id: ExchangeId, client: CCXTClient, symbol: string, depth = 20): Promise<OrderBook> {
  await rateLimiter.acquire(id, 'api');
  return client.fetchOrderBook(id, symbol, depth) as Promise<OrderBook>;
}

export async function fetchLiveBalances(id: ExchangeId, client: CCXTClient): Promise<Balance[]> {
  await rateLimiter.acquire(id, 'api');
  return client.fetchBalances(id) as Promise<Balance[]>;
}

export async function fetchLiveOrder(id: ExchangeId, client: CCXTClient, orderId: string, symbol: string): Promise<OrderResult> {
  await rateLimiter.acquire(id, 'api');
  return client.fetchOrder(id, orderId, symbol) as Promise<OrderResult>;
}

export async function fetchLiveOpenOrders(id: ExchangeId, client: CCXTClient, symbol?: string): Promise<OrderResult[]> {
  await rateLimiter.acquire(id, 'api');
  return client.fetchOpenOrders(id, symbol) as Promise<OrderResult[]>;
}
