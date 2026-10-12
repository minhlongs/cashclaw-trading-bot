import type { RfqQuoteRequest, RfqMeshBatchResult } from './rfq-darkmesh-types';
import { RfqAllocationEngine } from './rfq-allocation-engine';
import { RfqFillMatcher } from './rfq-fill-matcher';

export class RfqDarkMeshRouter {
  private readonly takerFeeRate: number;
  constructor(takerFeeRate = 0.0005) {
    if (takerFeeRate < 0) throw new Error('Taker fee rate must be non-negative.');
    this.takerFeeRate = takerFeeRate;
  }
  matchBatch(symbol: string, requests: readonly RfqQuoteRequest[], midPrice: number, now = Date.now()): RfqMeshBatchResult {
    if (midPrice <= 0 || !Number.isFinite(midPrice)) throw new Error('Mid price must be positive and finite.');
    const eligibleBuys = requests.filter(r => r.side === 'BUY' && RfqAllocationEngine.isEligible(r, symbol, midPrice));
    const eligibleSells = requests.filter(r => r.side === 'SELL' && RfqAllocationEngine.isEligible(r, symbol, midPrice));
    const ineligibles = requests.filter(r => !RfqAllocationEngine.isEligible(r, symbol, midPrice));
    const totalBuy = eligibleBuys.reduce((s, r) => s + r.requestedQuantity, 0);
    const totalSell = eligibleSells.reduce((s, r) => s + r.requestedQuantity, 0);
    const matchable = Math.min(totalBuy, totalSell);
    const buyAlloc = RfqAllocationEngine.computeAllocations(eligibleBuys, matchable, totalBuy);
    const sellAlloc = RfqAllocationEngine.computeAllocations(eligibleSells, matchable, totalSell);
    const buyTargets = eligibleBuys.map((r, i) => ({ rfq: r, targetFill: buyAlloc[i] }));
    const sellTargets = eligibleSells.map((r, i) => ({ rfq: r, targetFill: sellAlloc[i] }));
    const fills = RfqFillMatcher.pairFills(buyTargets, sellTargets, symbol, midPrice, now, this.takerFeeRate);
    const matchedQty = fills.reduce((s, f) => s + f.matchedQuantity, 0);
    const unfilled: RfqQuoteRequest[] = [
      ...eligibleBuys.map((r, i) => ({ ...r, requestedQuantity: r.requestedQuantity - buyAlloc[i] })).filter(r => r.requestedQuantity > 1e-9),
      ...eligibleSells.map((r, i) => ({ ...r, requestedQuantity: r.requestedQuantity - sellAlloc[i] })).filter(r => r.requestedQuantity > 1e-9),
      ...ineligibles,
    ];
    return {
      symbol, settlementPrice: midPrice, totalRequestedBuyQuantity: totalBuy, totalRequestedSellQuantity: totalSell,
      totalMatchedQuantity: matchedQty, totalMatchedNotional: matchedQty * midPrice,
      totalFeeSavedUsd: matchedQty * midPrice * (this.takerFeeRate * 2), fills, unfilledRequests: unfilled,
    };
  }
}
