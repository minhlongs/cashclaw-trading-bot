// Internal Crossing Network
// Batch matching engine netting opposing fleet orders at mid-price to eliminate taker fees.

import type {
  InternalOrder,
  InternalFill,
  CrossingBatchResult,
} from './internal-crossing-types';

export class InternalCrossingNetwork {
  private readonly takerFeeRate: number;

  constructor(takerFeeRate = 0.0005) {
    if (takerFeeRate < 0) throw new Error('Taker fee rate must be non-negative.');
    this.takerFeeRate = takerFeeRate;
  }

  private filterEligible(orders: readonly InternalOrder[], symbol: string, midPrice: number) {
    const buys = orders
      .filter((o) => o.symbol === symbol && o.side === 'BUY' && (o.limitPrice === undefined || o.limitPrice >= midPrice))
      .map((o) => ({ ...o }));

    const sells = orders
      .filter((o) => o.symbol === symbol && o.side === 'SELL' && (o.limitPrice === undefined || o.limitPrice <= midPrice))
      .map((o) => ({ ...o }));

    return { buys, sells };
  }

  private findIneligible(orders: readonly InternalOrder[], symbol: string, midPrice: number): InternalOrder[] {
    return orders.filter((o) => {
      if (o.symbol !== symbol) return false;
      if (o.side === 'BUY' && o.limitPrice !== undefined) return o.limitPrice < midPrice;
      if (o.side === 'SELL' && o.limitPrice !== undefined) return o.limitPrice > midPrice;
      return false;
    });
  }

  private executePairMatching(
    buys: InternalOrder[],
    sells: InternalOrder[],
    symbol: string,
    midPrice: number,
    nowTimestamp: number,
  ): InternalFill[] {
    const fills: InternalFill[] = [];
    let buyIdx = 0;
    let sellIdx = 0;
    let matchCounter = 1;

    while (buyIdx < buys.length && sellIdx < sells.length) {
      const buy = buys[buyIdx];
      const sell = sells[sellIdx];
      const matchQty = Math.min(buy.quantity, sell.quantity);

      if (matchQty > 0) {
        const notional = matchQty * midPrice;
        fills.push({
          matchId: `cross-${symbol}-${nowTimestamp}-${matchCounter++}`,
          symbol,
          buyOrderId: buy.orderId,
          sellOrderId: sell.orderId,
          buyBotId: buy.botId,
          sellBotId: sell.botId,
          matchedQuantity: matchQty,
          executionPrice: midPrice,
          notionalValue: notional,
          feeSavedUsd: notional * (this.takerFeeRate * 2),
          timestamp: nowTimestamp,
        });

        buys[buyIdx] = { ...buy, quantity: buy.quantity - matchQty };
        sells[sellIdx] = { ...sell, quantity: sell.quantity - matchQty };
      }

      if (buys[buyIdx].quantity <= 1e-9) buyIdx++;
      if (sells[sellIdx].quantity <= 1e-9) sellIdx++;
    }

    return fills;
  }

  /**
   * Crosses a batch of fleet orders against the current reference mid-price.
   */
  matchBatch(
    symbol: string,
    orders: readonly InternalOrder[],
    midPrice: number,
    nowTimestamp = Date.now(),
  ): CrossingBatchResult {
    if (midPrice <= 0 || !Number.isFinite(midPrice)) {
      throw new Error('Mid price must be positive and finite.');
    }

    const { buys, sells } = this.filterEligible(orders, symbol, midPrice);
    const fills = this.executePairMatching(buys, sells, symbol, midPrice, nowTimestamp);

    const unmatchedOrders: InternalOrder[] = [
      ...buys.filter((b) => b.quantity > 1e-9),
      ...sells.filter((s) => s.quantity > 1e-9),
      ...this.findIneligible(orders, symbol, midPrice),
    ];

    const totalCrossedQuantity = fills.reduce((sum, f) => sum + f.matchedQuantity, 0);
    const totalCrossedNotional = fills.reduce((sum, f) => sum + f.notionalValue, 0);
    const totalFeeSavingsUsd = fills.reduce((sum, f) => sum + f.feeSavedUsd, 0);

    return {
      symbol,
      executionPrice: midPrice,
      totalCrossedQuantity,
      totalCrossedNotional,
      totalFeeSavingsUsd,
      fills,
      unmatchedOrders,
    };
  }
}
