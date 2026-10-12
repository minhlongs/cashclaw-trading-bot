import type { CCXTConfig, CCXTTickerResult, CCXTOrderBookResult, CCXTBalanceResult, CCXTOrderResult, CCXTOrderRequest } from './client-types';
import { createExchangeInstance } from './client-factory';
import { fetchCCXTTicker, fetchCCXTOrderBook, fetchCCXTBalances } from './client-market-ops';
import { placeCCXTOrder, cancelCCXTOrder, fetchCCXTOpenOrders, fetchCCXTOrder } from './client-order-ops';

export type { CCXTConfig };

export class CCXTTransformer {
  private config: CCXTConfig;
  constructor(config: CCXTConfig) { this.config = config; }
  private getExchange() { return createExchangeInstance(this.config); }
  async fetchTicker(_ex: string, symbol: string): Promise<CCXTTickerResult> { return fetchCCXTTicker(this.getExchange(), symbol); }
  async fetchOrderBook(_ex: string, symbol: string, depth = 20): Promise<CCXTOrderBookResult> { return fetchCCXTOrderBook(this.getExchange(), symbol, depth); }
  async fetchBalances(_ex: string): Promise<CCXTBalanceResult[]> { return fetchCCXTBalances(this.getExchange()); }
  async placeOrder(exchange: string, request: CCXTOrderRequest): Promise<CCXTOrderResult> { return placeCCXTOrder(this.getExchange(), exchange, request); }
  async cancelOrder(_ex: string, orderId: string, symbol: string): Promise<boolean> { return cancelCCXTOrder(this.getExchange(), orderId, symbol); }
  async fetchOpenOrders(exchange: string, symbol?: string): Promise<CCXTOrderResult[]> { return fetchCCXTOpenOrders(this.getExchange(), exchange, symbol); }
  async fetchOrder(exchange: string, orderId: string, symbol: string): Promise<CCXTOrderResult> { return fetchCCXTOrder(this.getExchange(), exchange, orderId, symbol); }
}

export function createCCXTClient(exchange: string, config?: { apiKey?: string; apiSecret?: string; sandbox?: boolean }): CCXTTransformer {
  return new CCXTTransformer({ exchange, apiKey: config?.apiKey, apiSecret: config?.apiSecret, sandbox: config?.sandbox });
}
