// Direct REST Engine Types for CashClaw v2-Foundation

export interface DirectRestConfig {
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  recvWindow?: number;
  fetchFn?: typeof fetch;
}

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

// OKX Types
export interface OkxRestConfig extends DirectRestConfig {
  passphrase?: string;
  simulated?: boolean;
}

export interface OkxResponse<T> {
  code: string;
  msg: string;
  data: T[];
}

export interface OkxServerTime {
  ts: string;
}

export interface OkxTicker {
  instType?: string;
  instId: string;
  last: string;
  lastSz?: string;
  askPx: string;
  askSz?: string;
  bidPx: string;
  bidSz?: string;
  open24h?: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
  vol24h: string;
  ts: string;
}

export interface OkxSystemStatus {
  state: string;
  serviceType?: string;
  system?: string;
  scheDesc?: string;
  begin?: string;
  end?: string;
  maintType?: string;
}

// Bybit Types
export type BybitCategory = 'spot' | 'linear' | 'inverse';

export interface BybitRestConfig extends DirectRestConfig {
  category?: BybitCategory;
}

export interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  retExtInfo?: Record<string, unknown>;
  time?: number | string;
}

export interface BybitServerTimeResult {
  timeSecond?: string;
  timeNano?: string;
}

export interface BybitTicker {
  symbol: string;
  lastPrice: string;
  indexPrice?: string;
  markPrice?: string;
  prevPrice24h?: string;
  price24hPcnt?: string;
  highPrice24h: string;
  lowPrice24h: string;
  volume24h: string;
  turnover24h: string;
  bid1Price: string;
  bid1Size?: string;
  ask1Price: string;
  ask1Size?: string;
}

export interface BybitTickerResult {
  category?: string;
  list: BybitTicker[];
}

export type BybitQueryParams = Record<string, string | number | boolean | undefined>;
