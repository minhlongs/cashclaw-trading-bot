import type { InboundOrder, ExecutionSlice, OmsWaterfallConfig, OmsWaterfallResult } from './execution-oms-types';
import { RfqDarkMeshRouter } from '../darkmesh/rfq-darkmesh-router';
import type { RfqQuoteRequest } from '../darkmesh/rfq-darkmesh-types';
import { evaluateExecutionUrgency } from '../smart/microstructure-urgency-guard';
import type { VenueLiquidityProfile } from '../smart/smart-execution-types';
import { buildDefaultVenues, generateSlicesAndRoute } from './execution-oms-stages';

export class ExecutionOmsWaterfall {
  private readonly config: Required<OmsWaterfallConfig>;
  private readonly darkMesh: RfqDarkMeshRouter;

  constructor(config: OmsWaterfallConfig = {}) {
    this.config = {
      enableDarkMesh: config.enableDarkMesh ?? true, enableUrgencyGuard: config.enableUrgencyGuard ?? true,
      enableSlicing: config.enableSlicing ?? true, maxAdverseToxicity: config.maxAdverseToxicity ?? 0.7,
      slicingThresholdQty: config.slicingThresholdQty ?? 5.0, maxSlices: config.maxSlices ?? 5,
    };
    this.darkMesh = new RfqDarkMeshRouter();
  }

  processOrder(
    order: InboundOrder, midPrice: number, inventoryQuotes: readonly RfqQuoteRequest[] = [],
    marketToxicity = 0.2, venues?: readonly VenueLiquidityProfile[]
  ): OmsWaterfallResult {
    if (order.quantity <= 0 || !Number.isFinite(order.quantity)) {
      return this.buildResult(order, 0, 0, order.quantity, 'REJECTED', 0, [], 'Order quantity must be positive and finite.');
    }
    if (midPrice <= 0 || !Number.isFinite(midPrice)) {
      return this.buildResult(order, 0, 0, order.quantity, 'REJECTED', 0, [], 'Mid price must be positive and finite.');
    }

    let remainingQty = order.quantity;
    let darkMeshMatched = 0;
    let feeSavedUsd = 0;

    if (this.config.enableDarkMesh && inventoryQuotes.length > 0) {
      const rfqRequest: RfqQuoteRequest = {
        rfqId: order.orderId, botId: order.strategyId, symbol: order.symbol,
        side: order.side, requestedQuantity: remainingQty, limitPrice: order.limitPrice,
      };
      const matchRes = this.darkMesh.matchBatch(order.symbol, [rfqRequest, ...inventoryQuotes], midPrice);
      const myFills = matchRes.fills.filter((f) => f.buyRfqId === order.orderId || f.sellRfqId === order.orderId);
      for (const fill of myFills) darkMeshMatched += fill.matchedQuantity;
      if (darkMeshMatched > 0) {
        remainingQty -= darkMeshMatched;
        feeSavedUsd = darkMeshMatched * midPrice * 0.001;
      }
    }

    if (remainingQty <= 1e-9) {
      return this.buildResult(order, order.quantity, 0, 0, 'FILLED', feeSavedUsd, []);
    }

    if (this.config.enableUrgencyGuard) {
      const urgency = evaluateExecutionUrgency(
        { vpinToxicity: marketToxicity, ofiSignal: 0, intendedSide: order.side === 'BUY' ? 'buy' : 'sell' },
        this.config.maxAdverseToxicity
      );

      if (urgency.mode === 'PAUSED_COOLDOWN') {
        return this.buildResult(order, darkMeshMatched, 0, remainingQty, 'REJECTED', feeSavedUsd, [], urgency.reason);
      }
    }

    const defaultVenues = buildDefaultVenues(midPrice, remainingQty, venues);
    const slices = generateSlicesAndRoute(
      order, remainingQty, midPrice, this.config.enableSlicing,
      this.config.slicingThresholdQty, this.config.maxSlices, defaultVenues
    );
    const routedQuantity = slices.reduce((sum, s) => sum + s.quantity, 0);

    return this.buildResult(
      order, darkMeshMatched, routedQuantity, Math.max(0, remainingQty - routedQuantity),
      'ROUTING', feeSavedUsd, slices
    );
  }

  private buildResult(
    order: InboundOrder, matchedQty: number, routedQty: number, unfilledQty: number,
    state: 'FILLED' | 'ROUTING' | 'REJECTED', feeSavedUsd: number,
    slices: ExecutionSlice[], rejectionReason?: string
  ): OmsWaterfallResult {
    return {
      orderId: order.orderId, symbol: order.symbol, side: order.side, requestedQuantity: order.quantity,
      darkMeshMatchedQuantity: matchedQty, routedQuantity: routedQty, unfilledQuantity: unfilledQty,
      state, darkMeshFeeSavedUsd: feeSavedUsd, slices,
      ...(rejectionReason ? { rejectionReason } : {}),
    };
  }
}
