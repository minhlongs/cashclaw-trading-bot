// CCXT Exchange Client Transformer
// Converts CCXT responses to CashClaw internal types

import ccxt, { type Exchange as CCXTExchange, type Order as CCXTOrder } from 'ccxt';
import { createLogger } from '@/lib/logger';
import type {
  CCXTConfig,
  ExchangeConstructors,
  CCXTTickerResult,
  CCXTOrderBookResult,
  CCXTBalanceResult,
  CCXTOrderResult,
  CCXTOrderRequest,
} from './client-types';
import {
  mapCCXTTicker,
  mapCCXTOrderBook,
  mapCCXTBalances,
  mapCCXTOrder,
} from './client-mappers';

export type { CCXTConfig };

const log = createLogger('ccxt-client');

export class CCXTTransformer {
  private config: CCXTConfig;

  constructor(config: CCXTConfig) {
    this.config = config;
  }

  private getExchange(): CCXTExchange {
    const name = this.config.exchange.charAt(0).toUpperCase() + this.config.exchange.slice(1);
    const namespace = ccxt as unknown as ExchangeConstructors;
    const ExchangeClass = namespace[name];
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

  async fetchTicker(_exchange: string, symbol: string): Promise<CCXTTickerResult> {
    const ex = this.getExchange();
    const ticker = await ex.fetchTicker(symbol);
    return mapCCXTTicker(ticker, symbol);
  }

  async fetchOrderBook(_exchange: string, symbol: string, _depth = 20): Promise<CCXTOrderBookResult> {
    const ex = this.getExchange();
    const book = await ex.fetchOrderBook(symbol, _depth);
    return mapCCXTOrderBook(book, symbol);
  }

  async fetchBalances(_exchange: string): Promise<CCXTBalanceResult[]> {
    const ex = this.getExchange();
    const raw = await ex.fetchBalance();
    return mapCCXTBalances(raw);
  }

  async placeOrder(exchange: string, request: CCXTOrderRequest): Promise<CCXTOrderResult> {
    const ex = this.getExchange();
    const raw = await ex.createOrder(
      request.symbol,
      request.type,
      request.side,
      request.quantity,
      request.price,
    );
    return mapCCXTOrder(raw, exchange, request);
  }

  async cancelOrder(_exchange: string, orderId: string, _symbol: string): Promise<boolean> {
    const ex = this.getExchange();
    try {
      await ex.cancelOrder(orderId, _symbol);
      return true;
    } catch (error) {
      log.warn('Order cancel failed', { action: 'cancelOrder', error: error instanceof Error ? error : new Error(String(error)) });
      return false;
    }
  }

  async fetchOpenOrders(_exchange: string, _symbol?: string): Promise<CCXTOrderResult[]> {
    const ex = this.getExchange();
    const raw = await ex.fetchOpenOrders(_symbol);
    return raw.map((o: CCXTOrder) => mapCCXTOrder(o, _exchange));
  }

  async fetchOrder(_exchange: string, orderId: string, _symbol: string): Promise<CCXTOrderResult> {
    const ex = this.getExchange();
    const raw = await ex.fetchOrder(orderId, _symbol);
    if (!raw) throw new Error(`Order not found: ${orderId}`);
    return mapCCXTOrder(raw, _exchange);
  }
}

export function createCCXTClient(
  exchange: string,
  _config?: { apiKey?: string; apiSecret?: string; sandbox?: boolean },
): CCXTTransformer {
  return new CCXTTransformer({
    exchange,
    apiKey: _config?.apiKey,
    apiSecret: _config?.apiSecret,
    sandbox: _config?.sandbox,
  });
}
