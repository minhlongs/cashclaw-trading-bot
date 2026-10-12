import type { Exchange as CCXTExchange, Order as CCXTOrder } from 'ccxt';
import { createLogger } from '@/lib/logger';
import type { CCXTOrderResult, CCXTOrderRequest } from './client-types';
import { mapCCXTOrder } from './client-mappers';

const log = createLogger('ccxt-client');

export async function placeCCXTOrder(ex: CCXTExchange, exchange: string, req: CCXTOrderRequest): Promise<CCXTOrderResult> {
  const raw = await ex.createOrder(req.symbol, req.type, req.side, req.quantity, req.price);
  return mapCCXTOrder(raw, exchange, req);
}

export async function cancelCCXTOrder(ex: CCXTExchange, orderId: string, symbol: string): Promise<boolean> {
  try {
    await ex.cancelOrder(orderId, symbol);
    return true;
  } catch (error) {
    log.warn('Order cancel failed', { action: 'cancelOrder', error: error instanceof Error ? error : new Error(String(error)) });
    return false;
  }
}

export async function fetchCCXTOpenOrders(ex: CCXTExchange, exchange: string, symbol?: string): Promise<CCXTOrderResult[]> {
  const raw = await ex.fetchOpenOrders(symbol);
  return raw.map((o: CCXTOrder) => mapCCXTOrder(o, exchange));
}

export async function fetchCCXTOrder(ex: CCXTExchange, exchange: string, orderId: string, symbol: string): Promise<CCXTOrderResult> {
  const raw = await ex.fetchOrder(orderId, symbol);
  if (!raw) throw new Error(`Order not found: ${orderId}`);
  return mapCCXTOrder(raw, exchange);
}
