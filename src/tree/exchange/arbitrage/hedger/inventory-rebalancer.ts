import type { DeltaExposure, DualLegPortfolio, RebalanceAction } from './hedger-types';

export const MIN_REBALANCE_NOTIONAL_USD = 10;

export function generateRebalanceOrders(
  exposure: DeltaExposure,
  portfolio: DualLegPortfolio,
  minNotionalUsd = MIN_REBALANCE_NOTIONAL_USD,
): RebalanceAction {
  if (!exposure.isDriftExceeded || Math.abs(exposure.netDeltaNotional) < minNotionalUsd) {
    return {
      requiresRebalance: false,
      targetLegIndex: null,
      side: null,
      adjustmentQuantity: 0,
      estimatedNotional: 0,
      reason: 'Delta exposure within acceptable drift threshold',
    };
  }

  // Adjust leg B to match leg A notional
  const targetNotional = Math.abs(exposure.legANotional);
  const currentBNotional = Math.abs(exposure.legBNotional);
  const diffNotional = targetNotional - currentBNotional;

  const markPriceB = portfolio.legB.markPrice > 0 ? portfolio.legB.markPrice : 1;
  const quantityToAdjust = Math.abs(diffNotional) / markPriceB;

  let side: 'buy' | 'sell';
  if (portfolio.legB.side === 'short') {
    side = diffNotional > 0 ? 'sell' : 'buy'; // If short needs more notional, sell more
  } else {
    side = diffNotional > 0 ? 'buy' : 'sell';
  }

  return {
    requiresRebalance: true,
    targetLegIndex: 'B',
    side,
    adjustmentQuantity: quantityToAdjust,
    estimatedNotional: Math.abs(diffNotional),
    reason: `Delta drift ${(exposure.deltaDriftRatio * 100).toFixed(2)}% exceeded threshold. Rebalancing Leg B.`,
  };
}
