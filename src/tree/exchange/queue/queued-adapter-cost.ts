// Cost estimates per API call type for QueuedExchangeAdapter
// Standard = 1 unit, expensive = 2+ units, free = 0 units.

const COST: Record<string, number> = {
  fetchTicker: 1,
  fetchOrderBook: 1,
  fetchBalances: 1,
  placeOrder: 2,
  cancelOrder: 1,
  fetchOrder: 1,
  fetchOpenOrders: 1,
  ping: 0,
  getServerTime: 0,
};

/**
 * Returns estimated API cost units for a given exchange method name.
 * Defaults to 1 for unlisted methods.
 */
export function getCostForMethod(method: string): number {
  return COST[method] ?? 1;
}
