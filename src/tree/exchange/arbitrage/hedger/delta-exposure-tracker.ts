import type { DualLegPortfolio, DeltaExposure } from './hedger-types';

export const DEFAULT_DRIFT_TOLERANCE_RATIO = 0.03; // 3% delta drift limit

export function calculateDeltaExposure(
  portfolio: DualLegPortfolio,
  maxDriftToleranceRatio = DEFAULT_DRIFT_TOLERANCE_RATIO,
): DeltaExposure {
  const signA = portfolio.legA.side === 'long' ? 1 : -1;
  const signB = portfolio.legB.side === 'long' ? 1 : -1;

  const legANotional = signA * Math.abs(portfolio.legA.quantity * portfolio.legA.markPrice);
  const legBNotional = signB * Math.abs(portfolio.legB.quantity * portfolio.legB.markPrice);

  const netDeltaNotional = legANotional + legBNotional;
  const totalGrossNotional = Math.abs(legANotional) + Math.abs(legBNotional);

  const deltaDriftRatio =
    totalGrossNotional > 0 ? Math.abs(netDeltaNotional) / totalGrossNotional : 0;

  const isDriftExceeded = deltaDriftRatio > maxDriftToleranceRatio;

  return {
    legANotional,
    legBNotional,
    netDeltaNotional,
    totalGrossNotional,
    deltaDriftRatio,
    isDriftExceeded,
  };
}
