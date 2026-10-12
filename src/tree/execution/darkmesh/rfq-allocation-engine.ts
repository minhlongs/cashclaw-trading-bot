import type { RfqQuoteRequest } from './rfq-darkmesh-types';

export class RfqAllocationEngine {
  public static isEligible(r: RfqQuoteRequest, symbol: string, midPrice: number): boolean {
    if (r.symbol !== symbol || r.requestedQuantity <= 0) return false;
    if (r.side === 'BUY' && r.limitPrice !== undefined && r.limitPrice < midPrice) return false;
    if (r.side === 'SELL' && r.limitPrice !== undefined && r.limitPrice > midPrice) return false;
    return true;
  }

  public static computeAllocations(requests: RfqQuoteRequest[], matchableQty: number, totalQty: number): number[] {
    return requests.map(r => (totalQty > 0 ? (r.requestedQuantity / totalQty) * matchableQty : 0));
  }
}
