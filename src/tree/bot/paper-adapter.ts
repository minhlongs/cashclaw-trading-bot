// In-memory paper exchange adapter factory

import type { ExchangeAdapter, ExchangeId, OrderRequest, OrderResult, Ticker, OrderBook, Balance } from '../exchange/types';

export interface PaperAdapterOptions {
  tickerFetcher?: (symbol: string) => Promise<Ticker>;
  autoFillLimitOrders?: boolean;
}

const PAPER_FEE_RATE = 0.001;

async function resolveExecutionPrice(request: OrderRequest, tickerFetcher?: PaperAdapterOptions['tickerFetcher']): Promise<number> {
  let price = request.price ?? 0;
  if ((!Number.isFinite(price) || price <= 0) && tickerFetcher) {
    try {
      const ticker = await tickerFetcher(request.symbol);
      if (ticker && Number.isFinite(ticker.last) && ticker.last > 0) price = ticker.last;
    } catch {
      // The caller turns an unavailable price into a rejected order.
    }
  }
  return price;
}

function rejectedMarketOrder(orderId: string, request: OrderRequest): OrderResult {
  return {
    id: orderId, exchangeId: 'paper', symbol: request.symbol, side: request.side,
    type: request.type, price: 0, quantity: request.quantity, filled: 0,
    status: 'rejected', fee: 0, timestamp: Date.now(), pnl: 0,
  };
}

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
      const effectivePrice = await resolveExecutionPrice(request, options?.tickerFetcher);
      const hasValidExecutionPrice = Number.isFinite(effectivePrice) && effectivePrice > 0;
      const isFilled = hasValidExecutionPrice && (
        request.type === 'market' ||
        Boolean(options?.autoFillLimitOrders)
      );
      const filledQty = isFilled ? request.quantity : 0;
      if (request.type === 'market' && !hasValidExecutionPrice) {
        return rejectedMarketOrder(orderId, request);
      }
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
