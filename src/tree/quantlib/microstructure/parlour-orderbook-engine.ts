import type { ParlourOrderBookParams, ParlourOrderBookResult } from './parlour-orderbook-types';

export function computeParlourOrderBook(p: ParlourOrderBookParams): ParlourOrderBookResult {
  const q = Math.max(0, p.queueDepthAhead), lambda = Math.max(1e-4, p.arrivalIntensity);
  const delta = Math.max(1e-5, p.cancellationRate), t = Math.max(1e-4, p.executionHorizonSec);
  const spread = Math.max(1e-5, p.tickSpread), effectiveRate = lambda + delta;

  const expectedWait = (q + 1) / effectiveRate;
  const pFill = Math.min(1, Math.max(0, (1 - Math.exp(-effectiveRate * t)) * (lambda / effectiveRate)));
  const pCancel = Math.min(1, Math.max(0, 1 - pFill));

  const waitPenalty = Math.min(spread, delta * expectedWait);
  const marketOrderIncentiveBps = Math.max(0, ((spread - waitPenalty) / spread) * 10000);
  const recommendedOrderType: 'LIMIT' | 'MARKET' = pFill >= 0.5 ? 'LIMIT' : 'MARKET';

  return { queueFillProbability: pFill, expectedQueueWaitSec: expectedWait, cancellationProbability: pCancel, marketOrderIncentiveBps, recommendedOrderType };
}
