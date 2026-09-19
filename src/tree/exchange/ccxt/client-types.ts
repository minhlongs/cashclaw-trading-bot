// CCXT Exchange Client Type Definitions
// Shared interfaces and types for the CCXT transformer layer.

import type { Exchange as CCXTExchange } from 'ccxt';

/**
 * Configuration for initializing a CCXT exchange connection.
 */
export interface CCXTConfig {
  exchange: string;
  apiKey?: string;
  apiSecret?: string;
  password?: string;
  sandbox?: boolean;
}

/**
 * ccxt namespace contains exchange constructors keyed by capitalized name (e.g. "Binance").
 */
export type ExchangeConstructors = Record<
  string,
  new (config?: Record<string, unknown>) => CCXTExchange
>;

/**
 * Normalized ticker result returned by the CCXT transformer.
 */
export interface CCXTTickerResult {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

/**
 * A single price-level entry in an order book.
 */
export interface CCXTOrderBookLevel {
  price: number;
  quantity: number;
}

/**
 * Normalized order book result returned by the CCXT transformer.
 */
export interface CCXTOrderBookResult {
  symbol: string;
  bids: CCXTOrderBookLevel[];
  asks: CCXTOrderBookLevel[];
  timestamp: number;
}

/**
 * A single balance entry for a currency.
 */
export interface CCXTBalanceResult {
  currency: string;
  free: number;
  used: number;
  total: number;
}

/**
 * Request payload for placing an order via CCXT.
 */
export interface CCXTOrderRequest {
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price?: number;
}

/**
 * Normalized order result returned by the CCXT transformer.
 */
export interface CCXTOrderResult {
  id: string;
  exchangeId: string;
  symbol: string;
  side: string;
  type: string;
  price: number;
  quantity: number;
  filled: number;
  status: string;
  fee?: number;
  feeCurrency?: string;
  timestamp: number;
  pnl?: number;
}
