/**
 * @file queue-priority-tracker.ts
 * @description Estimates queue priority and Poisson arrival fill probability for limit orders.
 */

import type { QueuePlacementEstimate } from './slr-types';

export function estimateQueuePlacement(
  currentLevelSize: number,
  myOrderSize: number,
  historicalArrivalRatePerSec: number,
  targetWaitTimeSec = 5.0,
): QueuePlacementEstimate {
  const assumedPosition = currentLevelSize;
  
  if (historicalArrivalRatePerSec <= 0) {
    return {
      assumedQueuePosition: assumedPosition,
      estimatedFillProbability: 0.0,
      expectedWaitTimeMs: Number.POSITIVE_INFINITY,
    };
  }

  // Expected fills in target time window (lambda)
  const lambda = historicalArrivalRatePerSec * targetWaitTimeSec;
  
  // Need (assumedPosition + myOrderSize) quantity to be filled
  const requiredQuantity = assumedPosition + myOrderSize;
  
  // Approximate probability using exponential decay based on relative size vs expected volume
  let probability = 0;
  if (lambda >= requiredQuantity) {
    probability = 1.0 - Math.exp(-lambda / requiredQuantity);
  } else {
    probability = (lambda / requiredQuantity) * Math.exp(-1);
  }

  const expectedWaitTimeSec = requiredQuantity / historicalArrivalRatePerSec;

  return {
    assumedQueuePosition: assumedPosition,
    estimatedFillProbability: Math.round(Math.min(0.99, Math.max(0.01, probability)) * 1e4) / 1e4,
    expectedWaitTimeMs: Math.round(expectedWaitTimeSec * 1000),
  };
}
