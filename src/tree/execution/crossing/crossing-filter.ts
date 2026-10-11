import type { InternalOrder } from './internal-crossing-types';

export function filterEligibleOrders(orders: readonly InternalOrder[], symbol: string, midPrice: number) {
  const buys = orders
    .filter((o) => o.symbol === symbol && o.side === 'BUY' && (o.limitPrice === undefined || o.limitPrice >= midPrice))
    .map((o) => ({ ...o }));
  const sells = orders
    .filter((o) => o.symbol === symbol && o.side === 'SELL' && (o.limitPrice === undefined || o.limitPrice <= midPrice))
    .map((o) => ({ ...o }));
  return { buys, sells };
}

export function findIneligibleOrders(orders: readonly InternalOrder[], symbol: string, midPrice: number): InternalOrder[] {
  return orders.filter((o) => {
    if (o.symbol !== symbol) return false;
    if (o.side === 'BUY' && o.limitPrice !== undefined) return o.limitPrice < midPrice;
    if (o.side === 'SELL' && o.limitPrice !== undefined) return o.limitPrice > midPrice;
    return false;
  });
}
