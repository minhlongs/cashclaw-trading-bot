export interface ParlourOrderBookParams {
  readonly queueDepthAhead: number;
  readonly arrivalIntensity: number;
  readonly cancellationRate: number;
  readonly tickSpread: number;
  readonly executionHorizonSec: number;
  readonly orderSize?: number;
}

export interface ParlourOrderBookResult {
  readonly queueFillProbability: number;
  readonly expectedQueueWaitSec: number;
  readonly cancellationProbability: number;
  readonly marketOrderIncentiveBps: number;
  readonly recommendedOrderType: 'LIMIT' | 'MARKET';
}
