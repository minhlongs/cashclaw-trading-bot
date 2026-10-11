import type { InternalOrder, CrossingBatchResult } from './internal-crossing-types';
import { filterEligibleOrders, findIneligibleOrders } from './crossing-filter';
import { executePairMatching } from './crossing-matcher';

export class InternalCrossingNetwork {
  private readonly takerFeeRate: number;
  constructor(takerFeeRate = 0.0005) {
    if (takerFeeRate < 0) throw new Error('Taker fee rate must be non-negative.');
    this.takerFeeRate = takerFeeRate;
  }

  matchBatch(symbol: string, orders: readonly InternalOrder[], midPrice: number, nowTimestamp = Date.now()): CrossingBatchResult {
    if (midPrice <= 0 || !Number.isFinite(midPrice)) throw new Error('Mid price must be positive and finite.');
    const { buys, sells } = filterEligibleOrders(orders, symbol, midPrice);
    const fills = executePairMatching(buys, sells, symbol, midPrice, this.takerFeeRate, nowTimestamp);
    const unmatchedOrders: InternalOrder[] = [
      ...buys.filter((b) => b.quantity > 1e-9),
      ...sells.filter((s) => s.quantity > 1e-9),
      ...findIneligibleOrders(orders, symbol, midPrice),
    ];
    return {
      symbol, executionPrice: midPrice,
      totalCrossedQuantity: fills.reduce((sum, f) => sum + f.matchedQuantity, 0),
      totalCrossedNotional: fills.reduce((sum, f) => sum + f.notionalValue, 0),
      totalFeeSavingsUsd: fills.reduce((sum, f) => sum + f.feeSavedUsd, 0),
      fills, unmatchedOrders,
    };
  }
}
