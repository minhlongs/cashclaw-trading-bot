// RFQ Dark Mesh & Fair-Share Liquidity Aggregator Router
// Matches internal multi-bot RFQs with pro-rata fair-share allocation at zero taker fee.

import type {
  RfqQuoteRequest,
  RfqMatchFill,
  RfqMeshBatchResult,
} from './rfq-darkmesh-types';

export class RfqDarkMeshRouter {
  private readonly takerFeeRate: number;

  constructor(takerFeeRate = 0.0005) {
    if (takerFeeRate < 0) throw new Error('Taker fee rate must be non-negative.');
    this.takerFeeRate = takerFeeRate;
  }

  private isEligible(r: RfqQuoteRequest, symbol: string, midPrice: number): boolean {
    if (r.symbol !== symbol || r.requestedQuantity <= 0) return false;
    if (r.side === 'BUY' && r.limitPrice !== undefined && r.limitPrice < midPrice) return false;
    if (r.side === 'SELL' && r.limitPrice !== undefined && r.limitPrice > midPrice) return false;
    return true;
  }

  private pairFills(
    buys: Array<{ rfq: RfqQuoteRequest; targetFill: number }>,
    sells: Array<{ rfq: RfqQuoteRequest; targetFill: number }>,
    symbol: string,
    midPrice: number,
    now: number,
  ): RfqMatchFill[] {
    const fills: RfqMatchFill[] = [];
    let b = 0;
    let s = 0;
    let counter = 1;

    while (b < buys.length && s < sells.length) {
      const matchQty = Math.min(buys[b].targetFill, sells[s].targetFill);
      if (matchQty > 1e-9) {
        const notional = matchQty * midPrice;
        fills.push({
          matchId: `rfq-match-${symbol}-${now}-${counter++}`,
          symbol,
          buyRfqId: buys[b].rfq.rfqId,
          sellRfqId: sells[s].rfq.rfqId,
          buyBotId: buys[b].rfq.botId,
          sellBotId: sells[s].rfq.botId,
          matchedQuantity: matchQty,
          settlementPrice: midPrice,
          notionalValue: notional,
          feeSavedUsd: notional * (this.takerFeeRate * 2),
          timestamp: now,
        });
        buys[b].targetFill -= matchQty;
        sells[s].targetFill -= matchQty;
      }
      if (buys[b].targetFill <= 1e-9) b++;
      if (sells[s].targetFill <= 1e-9) s++;
    }
    return fills;
  }

  matchBatch(
    symbol: string,
    requests: readonly RfqQuoteRequest[],
    midPrice: number,
    now = Date.now(),
  ): RfqMeshBatchResult {
    if (midPrice <= 0 || !Number.isFinite(midPrice)) {
      throw new Error('Mid price must be positive and finite.');
    }

    const eligibleBuys = requests.filter((r) => r.side === 'BUY' && this.isEligible(r, symbol, midPrice));
    const eligibleSells = requests.filter((r) => r.side === 'SELL' && this.isEligible(r, symbol, midPrice));
    const ineligibles = requests.filter((r) => !this.isEligible(r, symbol, midPrice));

    const totalBuyQty = eligibleBuys.reduce((sum, r) => sum + r.requestedQuantity, 0);
    const totalSellQty = eligibleSells.reduce((sum, r) => sum + r.requestedQuantity, 0);
    const matchableQty = Math.min(totalBuyQty, totalSellQty);

    const buyAllocations = eligibleBuys.map((r) =>
      totalBuyQty > 0 ? (r.requestedQuantity / totalBuyQty) * matchableQty : 0,
    );
    const sellAllocations = eligibleSells.map((r) =>
      totalSellQty > 0 ? (r.requestedQuantity / totalSellQty) * matchableQty : 0,
    );

    const buyTargets = eligibleBuys.map((r, i) => ({ rfq: r, targetFill: buyAllocations[i] }));
    const sellTargets = eligibleSells.map((r, i) => ({ rfq: r, targetFill: sellAllocations[i] }));

    const fills = this.pairFills(buyTargets, sellTargets, symbol, midPrice, now);
    const matchedQty = fills.reduce((sum, f) => sum + f.matchedQuantity, 0);

    const unfilledRequests: RfqQuoteRequest[] = [
      ...eligibleBuys
        .map((r, i) => ({ ...r, requestedQuantity: r.requestedQuantity - buyAllocations[i] }))
        .filter((r) => r.requestedQuantity > 1e-9),
      ...eligibleSells
        .map((r, i) => ({ ...r, requestedQuantity: r.requestedQuantity - sellAllocations[i] }))
        .filter((r) => r.requestedQuantity > 1e-9),
      ...ineligibles,
    ];

    return {
      symbol,
      settlementPrice: midPrice,
      totalRequestedBuyQuantity: totalBuyQty,
      totalRequestedSellQuantity: totalSellQty,
      totalMatchedQuantity: matchedQty,
      totalMatchedNotional: matchedQty * midPrice,
      totalFeeSavedUsd: matchedQty * midPrice * (this.takerFeeRate * 2),
      fills,
      unfilledRequests,
    };
  }
}
