// Direct REST Engine Types for CashClaw v2-Foundation

export interface SignedRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  queryString: string;
  signature: string;
}

// Binance Types
export type BinanceQueryParams = Record<string, string | number | boolean | undefined>;

export interface BinanceSignResult {
  sortedQueryString: string;
  signature: string;
  fullQueryString: string;
}

export interface BinanceServerTime {
  serverTime: number;
}

export interface Binance24hrTicker {
  symbol: string;
  priceChange?: string;
  priceChangePercent?: string;
  weightedAvgPrice?: string;
  prevClosePrice?: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  openPrice?: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime?: number;
  closeTime?: number;
  firstId?: number;
  lastId?: number;
  count?: number;
}

export type { DirectRestConfig } from './exchange-types';
export type {
  OkxRestConfig,
  OkxResponse,
  OkxServerTime,
  OkxTicker,
  OkxSystemStatus,
  BybitCategory,
  BybitRestConfig,
  BybitResponse,
  BybitServerTimeResult,
  BybitTicker,
  BybitTickerResult,
  BybitQueryParams,
} from './exchange-types';
