/**
 * @file slr-types.ts
 * @description Types for Smart Limit Router & Passive Fill Optimizer (SLR Desk).
 */

export interface OrderBookImbalance {
  readonly bidPrice: number;
  readonly bidSize: number;
  readonly askPrice: number;
  readonly askSize: number;
  readonly imbalanceRatio: number; // Q_bid / (Q_bid + Q_ask)
}

export interface MicroPriceEstimate {
  readonly microPrice: number;
  readonly midPrice: number;
  readonly driftBps: number;
}

export interface QueuePlacementEstimate {
  readonly assumedQueuePosition: number;
  readonly estimatedFillProbability: number;
  readonly expectedWaitTimeMs: number;
}

export interface LimitOrderPlacement {
  readonly intendedPrice: number;
  readonly orderSide: 'buy' | 'sell';
  readonly postOnly: boolean;
  readonly cancelOnToxicity: boolean;
  readonly toxicityDriftLimitBps: number;
}

export interface PassiveExecutionResult {
  readonly orderPlaced: boolean;
  readonly placement: LimitOrderPlacement | null;
  readonly queue: QueuePlacementEstimate | null;
  readonly cancelTriggered: boolean;
  readonly reason: string;
}
