// CCXT Exchange Client Transformer
// Converts CCXT responses to CashClaw internal types
// In production: CCXT is bundled with the Workers build

// CCXT is a global injected by the Workers bundler (nodejs_compat)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const ccxt: any;

export interface CCXTConfig {
  exchange: string;
  apiKey?: string;
  apiSecret?: string;
  password?: string; // OKX passphrase
  sandbox?: boolean;
}

export class CCXTTransformer {
  private config: CCXTConfig;

  constructor(config: CCXTConfig) {
    this.config = config;
  }

  private getExchange(): any {
    const name = this.config.exchange.charAt(0).toUpperCase() + this.config.exchange.slice(1);
    const ExchangeClass = ccxt[name];
    if (!ExchangeClass) {
      throw new Error(`Unsupported exchange: ${this.config.exchange}`);
    }

    return new ExchangeClass({
      apiKey: this.config.apiKey || '',
      secret: this.config.apiSecret || '',
      password: this.config.password,
      sandbox: this.config.sandbox,
      enableRateLimit: true,
    });
  }

  async fetchTicker(_exchange: string, symbol: string): Promise<{ symbol: string; last: number; bid: number; ask: number; high24h: number; low24h: number; volume24h: number; timestamp: number }> {
    const ex = this.getExchange();
    const ticker = await ex.fetchTicker(symbol);
    return {
      symbol,
      last: ticker.last ?? 0,
      bid: ticker.bid ?? 0,
      ask: ticker.ask ?? 0,
      high24h: ticker.high ?? 0,
      low24h: ticker.low ?? 0,
      volume24h: ticker.baseVolume ?? 0,
      timestamp: ticker.timestamp ?? Date.now(),
    };
  }

  async fetchOrderBook(_exchange: string, symbol: string, _depth = 20): Promise<{ symbol: string; bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[]; timestamp: number }> {
    const ex = this.getExchange();
    const book = await ex.fetchOrderBook(symbol, _depth);
    return {
      symbol,
      bids: (book.bids ?? []).map(([price, qty]: [number, number]) => ({ price, quantity: qty })),
      asks: (book.asks ?? []).map(([price, qty]: [number, number]) => ({ price, quantity: qty })),
      timestamp: book.timestamp ?? Date.now(),
    };
  }

  async fetchBalances(_exchange: string): Promise<{ currency: string; free: number; used: number; total: number }[]> {
    const ex = this.getExchange();
    const raw = await ex.fetchBalance();
    const balances: { currency: string; free: number; used: number; total: number }[] = [];
    for (const [currency, info] of Object.entries(raw.total ?? {})) {
      const total = Number(info) || 0;
      if (total <= 0) continue;
      const freeVal = Number((raw.free as Record<string, number> | undefined)?.[currency] ?? 0);
      const usedVal = Number((raw.used as Record<string, number> | undefined)?.[currency] ?? 0);
      balances.push({ currency, free: freeVal, used: usedVal, total });
    }
    return balances;
  }

  async placeOrder(exchange: string, request: { symbol: string; side: string; type: string; quantity: number; price?: number }): Promise<{ id: string; exchangeId: string; symbol: string; side: string; type: string; price: number; quantity: number; filled: number; status: string; fee?: number; feeCurrency?: string; timestamp: number; pnl?: number }> {
    const ex = this.getExchange();
    const raw = await ex.createOrder(
      request.symbol,
      request.type,
      request.side,
      request.quantity,
      request.price,
    );

    const statusMap: Record<string, string> = {
      open: 'open',
      closed: 'filled',
      canceled: 'cancelled',
      cancelled: 'cancelled',
      rejected: 'rejected',
      expired: 'expired',
    };

    return {
      id: String(raw.id),
      exchangeId: exchange,
      symbol: raw.symbol ?? request.symbol,
      side: request.side,
      type: request.type,
      price: Number(raw.price ?? request.price ?? 0),
      quantity: request.quantity,
      filled: Number(raw.filled ?? 0),
      status: statusMap[raw.status ?? ''] ?? 'open',
      fee: raw.fee ? Number(raw.fee.cost ?? 0) : undefined,
      feeCurrency: raw.fee ? (raw.fee.currency as string) : undefined,
      timestamp: raw.timestamp ?? Date.now(),
      pnl: 0,
    };
  }

  async cancelOrder(_exchange: string, orderId: string, _symbol: string): Promise<boolean> {
    const ex = this.getExchange();
    try {
      await ex.cancelOrder(orderId, _symbol);
      return true;
    } catch {
      return false;
    }
  }

  async fetchOpenOrders(_exchange: string, _symbol?: string): Promise<{ id: string; exchangeId: string; symbol: string; side: string; type: string; price: number; quantity: number; filled: number; status: string; fee?: number; feeCurrency?: string; timestamp: number; pnl?: number }[]> {
  const ex = this.getExchange();
  const raw = await ex.fetchOpenOrders(_symbol);
  return raw.map((o: any) => ({ id: o.id, exchangeId: _exchange, symbol: o.symbol, side: o.side as 'buy' | 'sell', type: o.type as 'market' | 'limit', price: o.price ?? 0, quantity: o.amount, filled: o.filled ?? 0, status: o.status as 'open' | 'filled' | 'cancelled' | 'rejected', fee: o.fee ? o.fee.cost : undefined, feeCurrency: o.fee ? o.fee.currency : undefined, timestamp: o.timestamp ?? Date.now(), pnl: 0 }));
}

async fetchOrder(_exchange: string, orderId: string, _symbol: string): Promise<{ id: string; exchangeId: string; symbol: string; side: string; type: string; price: number; quantity: number; filled: number; status: string; fee?: number; feeCurrency?: string; timestamp: number; pnl?: number }> {
    const ex = this.getExchange();
    const raw = await ex.fetchOrder(orderId, _symbol);
    if (!raw) throw new Error(`Order not found: ${orderId}`);

    const statusMap: Record<string, string> = {
      open: 'open',
      closed: 'filled',
      partially_filled: 'partially_filled',
      canceled: 'cancelled',
      cancelled: 'cancelled',
      rejected: 'rejected',
      expired: 'expired',
    };

    return {
      id: String(raw.id),
      exchangeId: _exchange,
      symbol: raw.symbol ?? _symbol,
      side: raw.side,
      type: raw.type,
      price: Number(raw.price ?? 0),
      quantity: Number(raw.amount ?? 0),
      filled: Number(raw.filled ?? 0),
      status: statusMap[raw.status ?? ''] ?? 'open',
      fee: raw.fee ? Number(raw.fee.cost ?? 0) : undefined,
      feeCurrency: raw.fee ? (raw.fee.currency as string) : undefined,
      timestamp: raw.timestamp ?? Date.now(),
      pnl: 0,
    };
  }
}

export function createCCXTClient(exchange: string, _config?: { apiKey?: string; apiSecret?: string; sandbox?: boolean }) {
  return new CCXTTransformer({
    exchange,
    apiKey: _config?.apiKey,
    apiSecret: _config?.apiSecret,
    sandbox: _config?.sandbox,
  });
}
