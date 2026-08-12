// Shared exchange types

export type ExchangeId = 'binance' | 'bybit' | 'okx';

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected' | 'expired';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export interface Ticker {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Balance {
  currency: string;
  free: number;
  used: number;
  total: number;
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: number;
  price?: number; // required for limit orders
  timeInForce?: TimeInForce;
  exchange?: string; // for strategy callbacks context
}

export interface OrderResult {
  id: string;
  exchangeId: string;
  symbol: string;
  side: Side;
  type: OrderType;
  price: number;
  quantity: number;
  filled: number;
  status: OrderStatus;
  fee?: number;
  feeCurrency?: string;
  timestamp: number;
  pnl?: number; // Realized P&L (positive = profit, negative = loss)
}

export interface Position {
  symbol: string;
  side: Side;
  entryPrice: number;
  quantity: number;
  unrealizedPnl: number;
  liquidationPrice?: number;
}

export interface ExchangeAdapter {
  id: ExchangeId;
  name: string;

  // Market data
  fetchTicker(symbol: string): Promise<Ticker>;
  fetchOrderBook(symbol: string, depth?: number): Promise<OrderBook>;
  fetchBalances(): Promise<Balance[]>;

  // Trading
  placeOrder(request: OrderRequest): Promise<OrderResult>;
  cancelOrder(orderId: string, symbol: string): Promise<boolean>;
  fetchOrder(orderId: string, symbol: string): Promise<OrderResult>;
  fetchOpenOrders(symbol?: string): Promise<OrderResult[]>;

  // Health
  ping(): Promise<boolean>;
  getServerTime(): Promise<number>;
}

export interface ExchangeConfig {
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // OKX
  testnet: boolean;
  sandbox: boolean;
  rateLimitMs: number;
}

export const EXCHANGE_BASE_URLS: Record<ExchangeId, { main: string; testnet: string }> = {
  binance: {
    main: 'https://api.binance.com',
    testnet: 'https://testnet.binance.vision',
  },
  bybit: {
    main: 'https://api.bybit.com',
    testnet: 'https://api-testnet.bybit.com',
  },
  okx: {
    main: 'https://www.okx.com',
    testnet: 'https://www.okx.com',
  },
};
