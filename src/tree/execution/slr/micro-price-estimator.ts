/**
 * @file micro-price-estimator.ts
 * @description Calculates volume-weighted micro-price based on Order Book Imbalance (OBI).
 */

import type { OrderBookImbalance, MicroPriceEstimate } from './slr-types';

export function calculateOrderBookImbalance(
  bidPrice: number,
  bidSize: number,
  askPrice: number,
  askSize: number,
): OrderBookImbalance {
  if (bidSize <= 0 || askSize <= 0 || bidPrice >= askPrice) {
    return { bidPrice, bidSize, askPrice, askSize, imbalanceRatio: 0.5 };
  }
  const imbalanceRatio = bidSize / (bidSize + askSize);
  return { bidPrice, bidSize, askPrice, askSize, imbalanceRatio };
}

export function estimateMicroPrice(obi: OrderBookImbalance): MicroPriceEstimate {
  const midPrice = (obi.bidPrice + obi.askPrice) / 2.0;

  if (obi.bidSize <= 0 || obi.askSize <= 0 || obi.bidPrice >= obi.askPrice) {
    return { microPrice: midPrice, midPrice, driftBps: 0 };
  }

  // Micro-price = P_bid * (Q_ask / (Q_bid + Q_ask)) + P_ask * (Q_bid / (Q_bid + Q_ask))
  // Which is equivalent to P_bid * (1 - I) + P_ask * I  where I is imbalanceRatio
  const microPrice = obi.bidPrice * (1.0 - obi.imbalanceRatio) + obi.askPrice * obi.imbalanceRatio;
  
  const driftBps = ((microPrice - midPrice) / midPrice) * 10_000;

  return {
    microPrice: Math.round(microPrice * 1e8) / 1e8,
    midPrice: Math.round(midPrice * 1e8) / 1e8,
    driftBps: Math.round(driftBps * 1e4) / 1e4,
  };
}
