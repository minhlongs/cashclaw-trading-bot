// In-memory paper exchange adapter factory

import type {
  ExchangeAdapter,
  ExchangeId,
  OrderRequest,
  OrderResult,
  Ticker,
  OrderBook,
  Balance,
} from '../exchange/types';

export function createPaperAdapter(capital: number): ExchangeAdapter {
  const balances = new Map<string, { free: number; used: number }>();
  const orders = new Map<string, OrderResult>();
  let orderCounter = 0;

  balances.set('USDT', { free: capital, used: 0 });

  return {
    id: 'paper' as ExchangeId,
    name: 'Paper Trading',

    async fetchTicker(symbol: string): Promise<Ticker> {
      return { symbol, last: 0, bid: 0, ask: 0, high24h: 0, low24h: 0, volume24h: 0, timestamp: Date.now() };
    },

    async fetchOrderBook(symbol: string): Promise<OrderBook> {
      return { symbol, bids: [], asks: [], timestamp: Date.now() };
    },

    async fetchBalances(): Promise<Balance[]> {
      return Array.from(balances.entries()).map(([currency, { free, used }]) => ({
        currency, free, used, total: free + used,
      }));
    },

    async placeOrder(request: OrderRequest): Promise<OrderResult> {
      const orderId = `paper_${++orderCounter}_${Date.now()}`;
      const trade: OrderResult = {
        id: orderId,
        exchangeId: 'paper',
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        price: request.price ?? 0,
        quantity: request.quantity,
        filled: request.type === 'market' ? request.quantity : 0,
        status: request.type === 'market' ? 'filled' : 'open',
        fee: request.quantity * 0.001,
        timestamp: Date.now(),
        pnl: 0,
      };
      orders.set(orderId, trade);
      return trade;
    },

    async cancelOrder(orderId: string, _symbol?: string): Promise<boolean> {
      const trade = orders.get(orderId);
      if (!trade || trade.status !== 'open') return false;
      trade.status = 'cancelled';
      orders.set(orderId, trade);
      return true;
    },

    async fetchOrder(orderId: string, _symbol?: string): Promise<OrderResult> {
      const trade = orders.get(orderId);
      if (!trade) throw new Error(`Order not found: ${orderId}`);
      return trade;
    },

    async fetchOpenOrders(_symbol?: string): Promise<OrderResult[]> {
      return Array.from(orders.values()).filter((t) => t.status === 'open');
    },

    async ping(): Promise<boolean> {
      return true;
    },

    async getServerTime(): Promise<number> {
      return Date.now();
    },
  };
}
