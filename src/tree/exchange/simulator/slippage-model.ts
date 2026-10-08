// Order Book Depth Walking & Instantaneous Market Impact Slippage Model
// Pure function for realistic execution price estimation

import type { L2OrderBookLevel, ExecutionSlippageResult } from './l2-types';

export function calculateOrderBookExecution(
  side: 'buy' | 'sell',
  requestedSize: number,
  levels: readonly L2OrderBookLevel[],
  referencePrice: number,
): ExecutionSlippageResult {
  if (!Number.isFinite(requestedSize) || requestedSize <= 0) {
    throw new Error('Requested size must be positive finite number');
  }
  if (!levels || levels.length === 0) {
    throw new Error('Order book levels cannot be empty');
  }

  let remainingSize = requestedSize;
  let totalCost = 0;

  for (const level of levels) {
    if (remainingSize <= 0) break;
    const filledAtLevel = Math.min(remainingSize, level.size);
    totalCost += filledAtLevel * level.price;
    remainingSize -= filledAtLevel;
  }

  // If order book depth was exhausted before filling requested size
  if (remainingSize > 0) {
    const deepestPrice = levels[levels.length - 1].price;
    // Assume worst-case fill on remaining size with 1% adverse penalty
    const penaltyMultiplier = side === 'buy' ? 1.01 : 0.99;
    const penaltyPrice = deepestPrice * penaltyMultiplier;
    totalCost += remainingSize * penaltyPrice;
  }

  const executedPrice = totalCost / requestedSize;
  const priceDifference = Math.abs(executedPrice - referencePrice);
  const slippageBps = (priceDifference / referencePrice) * 10000;

  return {
    requestedPrice: referencePrice,
    executedPrice,
    slippageBps,
    totalCost,
  };
}
