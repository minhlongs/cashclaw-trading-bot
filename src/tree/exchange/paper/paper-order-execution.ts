import type {
  ExchangeId,
  OrderRequest,
  OrderResult,
} from '../types';
import type { PaperTrade } from './paper-types';
import { createPaperTrade, mapTradeToOrderResult } from './paper-order-helpers';

export interface OrderExecutionState {
  orders: Map<string, PaperTrade>;
  orderCounter: number;
  balances: Map<string, { free: number; used: number }>;
}

export function placeOrder(
  state: OrderExecutionState,
  exchangeId: ExchangeId,
  request: OrderRequest,
): OrderResult {
  // Note: rateLimiter.acquire is called by the class method before this
  const trade = createPaperTrade(++state.orderCounter, exchangeId, request);
  state.orders.set(trade.orderId, trade);
  return mapTradeToOrderResult(trade);
}

export function cancelOrder(
  state: OrderExecutionState,
  orderId: string,
): boolean {
  const trade = state.orders.get(orderId);
  if (!trade || trade.status !== 'open') return false;
  trade.status = 'cancelled';
  state.orders.set(orderId, trade);

  const quoteCurrency = trade.symbol.includes('/') ? trade.symbol.split('/')[1] : 'USDT';
  const bal = state.balances.get(quoteCurrency);
  if (bal) {
    bal.used -= trade.quantity;
    bal.free += trade.quantity;
  }
  return true;
}

export function fetchOrder(
  state: OrderExecutionState,
  orderId: string,
): OrderResult {
  const trade = state.orders.get(orderId);
  if (!trade) throw new Error(`Order not found: ${orderId}`);
  return mapTradeToOrderResult(trade);
}

export function fetchOpenOrders(
  state: OrderExecutionState,
): OrderResult[] {
  return Array.from(state.orders.values())
    .filter((t) => t.status === 'open')
    .map((t) => mapTradeToOrderResult(t));
}

export function fillOrder(
  state: OrderExecutionState,
  orderId: string,
  fillPrice: number,
  fillQty: number,
): boolean {
  const trade = state.orders.get(orderId);
  if (!trade || trade.status !== 'open') return false;
  trade.filled += fillQty;
  trade.price = fillPrice;
  trade.status = trade.filled >= trade.quantity ? 'filled' : 'partially_filled';
  state.orders.set(orderId, trade);
  return true;
}
