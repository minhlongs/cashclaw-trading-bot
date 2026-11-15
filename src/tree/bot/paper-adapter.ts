// In-memory paper exchange adapter factory

import type { ExchangeAdapter, ExchangeId, OrderRequest, OrderResult, Ticker, OrderBook, Balance } from '../exchange/types';

export interface PaperAdapterOptions {
  tickerFetcher?: (symbol: string) => Promise<Ticker>;
  autoFillLimitOrders?: boolean;
}

const PAPER_FEE_RATE = 0.001;

export function createPaperAdapter(capital: number, options?: PaperAdapterOptions): ExchangeAdapter {
  const balances = new Map<string, { free: number; used: number }>();
  const orders = new Map<string, OrderResult>();
  let orderCounter = 0;

  balances.set('USDT', { free: capital, used: 0 });

  return {
    id: 'paper' as ExchangeId,
    name: 'Paper Trading',

    async fetchTicker(symbol: string): Promise<Ticker> {
      if (options?.tickerFetcher) {
        try {
          const ticker = await options.tickerFetcher(symbol);
          if (ticker) return ticker;
        } catch {
          // Graceful fallback to simulated zero ticker
        }
      }
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
      let effectivePrice = request.price ?? 0;
      if (effectivePrice <= 0 && options?.tickerFetcher) {
        try {
          const ticker = await options.tickerFetcher(request.symbol);
          if (ticker && Number.isFinite(ticker.last) && ticker.last > 0) effectivePrice = ticker.last;
        } catch {
          // Fallback to 0 when tickerFetcher fails
        }
      }
      const isFilled =
        request.type === 'market' ||
        Boolean(options?.autoFillLimitOrders && effectivePrice > 0);
      const filledQty = isFilled ? request.quantity : 0;
      const trade: OrderResult = {
        id: orderId,
        exchangeId: 'paper',
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        price: effectivePrice,
        quantity: request.quantity,
        filled: filledQty,
        status: isFilled ? 'filled' : 'open',
        fee: isFilled ? effectivePrice * filledQty * PAPER_FEE_RATE : 0,
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
