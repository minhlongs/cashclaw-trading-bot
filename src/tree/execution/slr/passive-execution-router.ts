/**
 * @file passive-execution-router.ts
 * @description Places limit orders targeting maker rebate w/ cancel-on-toxicity micro-price drift protection.
 */

import type { OrderBookImbalance, PassiveExecutionResult } from './slr-types';
import { estimateMicroPrice } from './micro-price-estimator';
import { estimateQueuePlacement } from './queue-priority-tracker';

export function routePassiveLimitOrder(
  obi: OrderBookImbalance,
  side: 'buy' | 'sell',
  orderSize: number,
  historicalArrivalRatePerSec: number,
  toxicityDriftLimitBps = 2.0,
): PassiveExecutionResult {
  const micro = estimateMicroPrice(obi);
  
  // Buy order: If micro-price drifts downward beyond threshold, toxic sweep imminent -> cancel/hold
  if (side === 'buy' && micro.driftBps < -toxicityDriftLimitBps) {
    return {
      orderPlaced: false,
      placement: null,
      queue: null,
      cancelTriggered: true,
      reason: `Adverse micro-price drift (${micro.driftBps} bps). Toxic sell sweep expected.`,
    };
  }

  // Sell order: If micro-price drifts upward beyond threshold, toxic sweep imminent -> cancel/hold
  if (side === 'sell' && micro.driftBps > toxicityDriftLimitBps) {
    return {
      orderPlaced: false,
      placement: null,
      queue: null,
      cancelTriggered: true,
      reason: `Adverse micro-price drift (${micro.driftBps} bps). Toxic buy sweep expected.`,
    };
  }

  const levelSize = side === 'buy' ? obi.bidSize : obi.askSize;
  const placementPrice = side === 'buy' ? obi.bidPrice : obi.askPrice;
  const queue = estimateQueuePlacement(levelSize, orderSize, historicalArrivalRatePerSec);

  return {
    orderPlaced: true,
    cancelTriggered: false,
    reason: 'Favorable micro-price structure. Routing passive limit.',
    placement: {
      intendedPrice: placementPrice,
      orderSide: side,
      postOnly: true,
      cancelOnToxicity: true,
      toxicityDriftLimitBps,
    },
    queue,
  };
}
