import type { InboundOrder, ExecutionSlice } from './execution-oms-types';
import { routeOrderSlices } from '../smart/sor-router';
import { calculateTwapSlices } from '../smart/twap-slicer';
import type { VenueLiquidityProfile } from '../smart/smart-execution-types';

export function buildDefaultVenues(
  midPrice: number,
  remainingQty: number,
  venues?: readonly VenueLiquidityProfile[]
): VenueLiquidityProfile[] {
  if (venues && venues.length > 0) return [...venues];
  return [
    {
      exchange: 'binance',
      topAskPrice: midPrice * 1.0001,
      topBidPrice: midPrice * 0.9999,
      depthSize: remainingQty * 0.6,
      takerFeeBps: 4,
      makerFeeBps: 1,
    },
    {
      exchange: 'bybit',
      topAskPrice: midPrice * 1.0002,
      topBidPrice: midPrice * 0.9998,
      depthSize: remainingQty * 0.8,
      takerFeeBps: 5,
      makerFeeBps: 2,
    },
  ];
}

export function generateSlicesAndRoute(
  order: InboundOrder,
  remainingQty: number,
  midPrice: number,
  enableSlicing: boolean,
  slicingThresholdQty: number,
  maxSlices: number,
  defaultVenues: readonly VenueLiquidityProfile[]
): ExecutionSlice[] {
  const slices: ExecutionSlice[] = [];
  const side = order.side === 'BUY' ? 'buy' : 'sell';

  if (enableSlicing && remainingQty >= slicingThresholdQty) {
    const chunks = calculateTwapSlices({
      totalQuantity: remainingQty,
      durationMinutes: 5,
      sliceCount: maxSlices,
    });

    for (const chunk of chunks) {
      const sorAllocs = routeOrderSlices(chunk.targetQuantity, side, defaultVenues);
      const bestAlloc = sorAllocs[0];
      slices.push({
        sliceIndex: chunk.chunkIndex,
        quantity: chunk.targetQuantity,
        targetVenue: bestAlloc ? bestAlloc.exchange : 'binance',
        expectedPrice: bestAlloc ? bestAlloc.expectedEffectivePrice : midPrice,
      });
    }
  } else {
    const sorAllocs = routeOrderSlices(remainingQty, side, defaultVenues);
    const bestAlloc = sorAllocs[0];
    slices.push({
      sliceIndex: 0,
      quantity: remainingQty,
      targetVenue: bestAlloc ? bestAlloc.exchange : 'binance',
      expectedPrice: bestAlloc ? bestAlloc.expectedEffectivePrice : midPrice,
    });
  }

  return slices;
}
