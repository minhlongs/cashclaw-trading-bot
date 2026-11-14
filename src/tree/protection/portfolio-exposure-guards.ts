/**
 * Portfolio concentration (25% single-asset cap), net BTC-beta exposure cap,
 * and 1.5x gross leverage ceiling evaluators.
 */

import type { GuardCheckFailure } from './pretrade-numeric-and-staleness-guards';
import type {
  PositionExposure,
  PreTradeOrderCandidate,
  ProtectionEngineConfig,
} from './protection-types';

interface ProjectedExposureTotals {
  readonly currentGross: number;
  readonly projectedGross: number;
  readonly projectedAssetAbs: number;
  readonly currentNetBetaUsd: number;
  readonly projectedNetBetaUsd: number;
}

function projectSymbolNotionals(
  order: PreTradeOrderCandidate,
  positions: readonly PositionExposure[],
): ProjectedExposureTotals {
  const signedDelta = (order.side === 'BUY' ? 1 : -1) * order.price * order.quantity;
  const orderBeta = order.betaToBtc ?? (order.symbol.startsWith('BTC') ? 1.0 : 0.8);
  let currentGross = 0;
  let projectedGross = 0;
  let currentNetBetaUsd = 0;
  let projectedNetBetaUsd = 0;
  let matchedSymbol = false;
  let projectedAssetAbs = Math.abs(signedDelta);

  for (const pos of positions) {
    currentGross += Math.abs(pos.signedNotionalUsd);
    currentNetBetaUsd += pos.signedNotionalUsd * pos.betaToBtc;
    if (pos.symbol === order.symbol) {
      matchedSymbol = true;
      const nextSigned = pos.signedNotionalUsd + signedDelta;
      projectedAssetAbs = Math.abs(nextSigned);
      projectedGross += projectedAssetAbs;
      projectedNetBetaUsd += nextSigned * pos.betaToBtc;
    } else {
      projectedGross += Math.abs(pos.signedNotionalUsd);
      projectedNetBetaUsd += pos.signedNotionalUsd * pos.betaToBtc;
    }
  }

  if (!matchedSymbol) {
    projectedGross += Math.abs(signedDelta);
    projectedNetBetaUsd += signedDelta * orderBeta;
  }

  return { currentGross, projectedGross, projectedAssetAbs, currentNetBetaUsd, projectedNetBetaUsd };
}

export function evaluateConcentrationBetaAndLeverage(
  order: PreTradeOrderCandidate,
  positions: readonly PositionExposure[],
  equityUsd: number,
  config: ProtectionEngineConfig,
): GuardCheckFailure | null {
  const proj = projectSymbolNotionals(order, positions);
  if (order.reduceOnly && proj.projectedGross <= proj.currentGross) {
    return null;
  }

  const assetWeight = proj.projectedAssetAbs / equityUsd;
  if (assetWeight > config.maxSingleAssetWeightPct) {
    return {
      action: 'REJECT_PRETRADE',
      controlId: 3,
      reason: `Projected ${order.symbol} weight ${(assetWeight * 100).toFixed(2)}% exceeds ${(config.maxSingleAssetWeightPct * 100).toFixed(1)}% NAV concentration cap`,
      nonOverridable: false,
    };
  }

  const betaCap = config.marketNeutralMode ? config.maxNeutralBtcBeta : config.maxDirectionalBtcBeta;
  const projectedBeta = proj.projectedNetBetaUsd / equityUsd;
  const currentBeta = proj.currentNetBetaUsd / equityUsd;
  if (Math.abs(projectedBeta) > betaCap && Math.abs(projectedBeta) >= Math.abs(currentBeta)) {
    return {
      action: 'REJECT_PRETRADE',
      controlId: 3,
      reason: `Projected portfolio net BTC-beta ${projectedBeta.toFixed(3)} exceeds +/-${betaCap.toFixed(2)} cap`,
      nonOverridable: false,
    };
  }

  const projectedLeverage = proj.projectedGross / equityUsd;
  if (projectedLeverage > config.maxGrossLeverage) {
    return {
      action: 'REJECT_PRETRADE',
      controlId: 4,
      reason: `Projected gross leverage ${projectedLeverage.toFixed(3)}x exceeds ${config.maxGrossLeverage.toFixed(2)}x hard ceiling`,
      nonOverridable: false,
    };
  }

  return null;
}
