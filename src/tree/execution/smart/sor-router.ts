// Smart Order Router (SOR) — multi-venue depth & fee-weighted allocation
import type { VenueLiquidityProfile, SorAllocation } from './smart-execution-types';

export function routeOrderSlices(
  targetQuantity: number,
  side: 'buy' | 'sell',
  venues: readonly VenueLiquidityProfile[],
): readonly SorAllocation[] {
  if (targetQuantity <= 0 || venues.length === 0) {
    return [];
  }

  // Calculate effective price including taker fees for each venue
  const scoredVenues = venues.map((v) => {
    const rawPrice = side === 'buy' ? v.topAskPrice : v.topBidPrice;
    const feeMultiplier = side === 'buy' ? 1 + v.takerFeeBps / 10000 : 1 - v.takerFeeBps / 10000;
    const effectivePrice = rawPrice * feeMultiplier;
    return { ...v, rawPrice, effectivePrice };
  });

  // Sort: For buy, lowest effective price first; For sell, highest effective price first
  scoredVenues.sort((a, b) =>
    side === 'buy' ? a.effectivePrice - b.effectivePrice : b.effectivePrice - a.effectivePrice,
  );

  let remaining = targetQuantity;
  const allocations: SorAllocation[] = [];

  for (const v of scoredVenues) {
    if (remaining <= 0) break;
    const allocQty = Math.min(remaining, Math.max(0, v.depthSize));
    if (allocQty > 0) {
      allocations.push({
        exchange: v.exchange,
        allocatedQuantity: Number(allocQty.toFixed(8)),
        expectedEffectivePrice: Number(v.effectivePrice.toFixed(4)),
        expectedFeeUsd: Number(((allocQty * v.rawPrice * v.takerFeeBps) / 10000).toFixed(4)),
      });
      remaining -= allocQty;
    }
  }

  // If liquidity was insufficient across venues, allocate remainder to best venue
  if (remaining > 0 && scoredVenues.length > 0) {
    const bestVenue = scoredVenues[0];
    const existingIndex = allocations.findIndex((a) => a.exchange === bestVenue.exchange);
    if (existingIndex >= 0) {
      const prev = allocations[existingIndex];
      const newQty = prev.allocatedQuantity + remaining;
      allocations[existingIndex] = {
        ...prev,
        allocatedQuantity: Number(newQty.toFixed(8)),
        expectedFeeUsd: Number(((newQty * bestVenue.rawPrice * bestVenue.takerFeeBps) / 10000).toFixed(4)),
      };
    } else {
      allocations.push({
        exchange: bestVenue.exchange,
        allocatedQuantity: Number(remaining.toFixed(8)),
        expectedEffectivePrice: Number(bestVenue.effectivePrice.toFixed(4)),
        expectedFeeUsd: Number(((remaining * bestVenue.rawPrice * bestVenue.takerFeeBps) / 10000).toFixed(4)),
      });
    }
  }

  return allocations;
}
