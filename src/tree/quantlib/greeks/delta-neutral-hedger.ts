import type { PortfolioGreeksSummary, SyntheticPosition } from './greeks-types';
import { calculateBlackGreeks } from './synthetic-greeks-engine';

export function evaluatePortfolioGreeks(
  positions: readonly SyntheticPosition[],
  deltaDriftThreshold = 0.05,
): PortfolioGreeksSummary {
  let netDelta = 0;
  let netGamma = 0;
  let netVega = 0;
  let netTheta = 0;

  for (const pos of positions) {
    if (pos.isPerpOrSpot) {
      // Linear asset: Delta = 1.0 per unit of notional
      netDelta += pos.notionalQuantity * 1.0;
    } else if (pos.strikePrice && pos.timeToExpiryYears && pos.optionType) {
      const greeks = calculateBlackGreeks(
        pos.spotPrice,
        pos.strikePrice,
        pos.timeToExpiryYears,
        pos.impliedVol,
        0.04,
        pos.optionType,
      );
      netDelta += pos.notionalQuantity * greeks.delta;
      netGamma += pos.notionalQuantity * greeks.gamma;
      netVega += pos.notionalQuantity * greeks.vega;
      netTheta += pos.notionalQuantity * greeks.theta;
    }
  }

  const roundedDelta = Math.round(netDelta * 1e4) / 1e4;
  const requiresHedging = Math.abs(roundedDelta) > deltaDriftThreshold;
  const suggestedHedgeQuantity = requiresHedging ? Math.round(-roundedDelta * 1e4) / 1e4 : 0;

  return {
    netDelta: roundedDelta,
    netGamma: Math.round(netGamma * 1e6) / 1e6,
    netVega: Math.round(netVega * 1e4) / 1e4,
    netTheta: Math.round(netTheta * 1e4) / 1e4,
    requiresHedging,
    suggestedHedgeQuantity,
  };
}
