import type {
  InboundOrder,
  OmsWaterfallConfig,
  OmsWaterfallResult,
  ExecutionSlice,
} from './execution-oms-types';
import { RfqDarkMeshRouter } from '../darkmesh/rfq-darkmesh-router';
import type { RfqQuoteRequest } from '../darkmesh/rfq-darkmesh-types';
import { evaluateExecutionUrgency } from '../smart/microstructure-urgency-guard';
import { routeOrderSlices } from '../smart/sor-router';
import { calculateTwapSlices } from '../smart/twap-slicer';
import type { VenueLiquidityProfile } from '../smart/smart-execution-types';

export class ExecutionOmsWaterfall {
  private readonly config: Required<OmsWaterfallConfig>;
  private readonly darkMesh: RfqDarkMeshRouter;

  constructor(config: OmsWaterfallConfig = {}) {
    this.config = {
      enableDarkMesh: config.enableDarkMesh ?? true,
      enableUrgencyGuard: config.enableUrgencyGuard ?? true,
      enableSlicing: config.enableSlicing ?? true,
      maxAdverseToxicity: config.maxAdverseToxicity ?? 0.7,
      slicingThresholdQty: config.slicingThresholdQty ?? 5.0,
      maxSlices: config.maxSlices ?? 5,
    };
    this.darkMesh = new RfqDarkMeshRouter();
  }

  processOrder(
    order: InboundOrder,
    midPrice: number,
    inventoryQuotes: readonly RfqQuoteRequest[] = [],
    marketToxicity = 0.2,
    venues?: readonly VenueLiquidityProfile[]
  ): OmsWaterfallResult {
    if (order.quantity <= 0 || !Number.isFinite(order.quantity)) {
      return this.rejectOrder(order, 'Order quantity must be positive and finite.');
    }
    if (midPrice <= 0 || !Number.isFinite(midPrice)) {
      return this.rejectOrder(order, 'Mid price must be positive and finite.');
    }

    let remainingQty = order.quantity;
    let darkMeshMatched = 0;
    let feeSavedUsd = 0;

    if (this.config.enableDarkMesh && inventoryQuotes.length > 0) {
      const rfqRequest: RfqQuoteRequest = {
        rfqId: order.orderId,
        botId: order.strategyId,
        symbol: order.symbol,
        side: order.side,
        requestedQuantity: remainingQty,
        limitPrice: order.limitPrice,
      };

      const matchRes = this.darkMesh.matchBatch(order.symbol, [rfqRequest, ...inventoryQuotes], midPrice);
      const myFills = matchRes.fills.filter((f) => f.buyRfqId === order.orderId || f.sellRfqId === order.orderId);
      for (const fill of myFills) {
        darkMeshMatched += fill.matchedQuantity;
      }
      if (darkMeshMatched > 0) {
        remainingQty -= darkMeshMatched;
        feeSavedUsd = darkMeshMatched * midPrice * 0.001;
      }
    }

    if (remainingQty <= 1e-9) {
      return {
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side,
        requestedQuantity: order.quantity,
        darkMeshMatchedQuantity: order.quantity,
        routedQuantity: 0,
        unfilledQuantity: 0,
        state: 'FILLED',
        darkMeshFeeSavedUsd: feeSavedUsd,
        slices: [],
      };
    }

    if (this.config.enableUrgencyGuard) {
      const urgency = evaluateExecutionUrgency(
        {
          vpinToxicity: marketToxicity,
          ofiSignal: 0,
          intendedSide: order.side === 'BUY' ? 'buy' : 'sell',
        },
        this.config.maxAdverseToxicity
      );

      if (urgency.mode === 'PAUSED_COOLDOWN') {
        return {
          orderId: order.orderId,
          symbol: order.symbol,
          side: order.side,
          requestedQuantity: order.quantity,
          darkMeshMatchedQuantity: darkMeshMatched,
          routedQuantity: 0,
          unfilledQuantity: remainingQty,
          state: 'REJECTED',
          darkMeshFeeSavedUsd: feeSavedUsd,
          slices: [],
          rejectionReason: urgency.reason,
        };
      }
    }

    const defaultVenues: VenueLiquidityProfile[] = venues ? [...venues] : [
      { exchange: 'binance', topAskPrice: midPrice * 1.0001, topBidPrice: midPrice * 0.9999, depthSize: remainingQty * 0.6, takerFeeBps: 4, makerFeeBps: 1 },
      { exchange: 'bybit', topAskPrice: midPrice * 1.0002, topBidPrice: midPrice * 0.9998, depthSize: remainingQty * 0.8, takerFeeBps: 5, makerFeeBps: 2 },
    ];

    const slices: ExecutionSlice[] = [];
    if (this.config.enableSlicing && remainingQty >= this.config.slicingThresholdQty) {
      const chunks = calculateTwapSlices({
        totalQuantity: remainingQty,
        durationMinutes: 5,
        sliceCount: this.config.maxSlices,
      });

      chunks.forEach((chunk) => {
        const sorAllocs = routeOrderSlices(chunk.targetQuantity, order.side === 'BUY' ? 'buy' : 'sell', defaultVenues);
        const bestAlloc = sorAllocs[0];
        slices.push({
          sliceIndex: chunk.chunkIndex,
          quantity: chunk.targetQuantity,
          targetVenue: bestAlloc ? bestAlloc.exchange : 'binance',
          expectedPrice: bestAlloc ? bestAlloc.expectedEffectivePrice : midPrice,
        });
      });
    } else {
      const sorAllocs = routeOrderSlices(remainingQty, order.side === 'BUY' ? 'buy' : 'sell', defaultVenues);
      const bestAlloc = sorAllocs[0];
      slices.push({
        sliceIndex: 0,
        quantity: remainingQty,
        targetVenue: bestAlloc ? bestAlloc.exchange : 'binance',
        expectedPrice: bestAlloc ? bestAlloc.expectedEffectivePrice : midPrice,
      });
    }

    const routedQuantity = slices.reduce((sum, s) => sum + s.quantity, 0);

    return {
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      requestedQuantity: order.quantity,
      darkMeshMatchedQuantity: darkMeshMatched,
      routedQuantity,
      unfilledQuantity: Math.max(0, remainingQty - routedQuantity),
      state: 'ROUTING',
      darkMeshFeeSavedUsd: feeSavedUsd,
      slices,
    };
  }

  private rejectOrder(order: InboundOrder, reason: string): OmsWaterfallResult {
    return {
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      requestedQuantity: order.quantity,
      darkMeshMatchedQuantity: 0,
      routedQuantity: 0,
      unfilledQuantity: order.quantity,
      state: 'REJECTED',
      darkMeshFeeSavedUsd: 0,
      slices: [],
      rejectionReason: reason,
    };
  }
}
