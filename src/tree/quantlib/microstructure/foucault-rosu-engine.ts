import type { FoucaultRosuParams, FoucaultRosuResult } from './foucault-rosu-types';

export function computeFoucaultRosuMicrostructure(p: FoucaultRosuParams): FoucaultRosuResult {
  const lambdaF = Math.max(0, p.fastTraderArrivalRate);
  const muC = Math.max(1e-6, p.cancelRateSlowTraders);
  const sigma = Math.max(1e-4, p.fundamentalVolatility);
  const p0 = Math.max(1e-4, p.baseAssetPrice);
  const gamma = Math.max(0, p.inventoryHoldingCost);
  const snipingProbability = lambdaF / (lambdaF + muC);
  const adverseComponent = snipingProbability * sigma * 2;
  const spreadAbs = Math.max(p.tickSize, adverseComponent + gamma * sigma);
  const equilibriumSpreadBps = (spreadAbs / p0) * 10000;
  const adverseSelectionShare = spreadAbs > 0 ? Math.min(1, adverseComponent / spreadAbs) : 0;
  const fastTraderRentBps = (snipingProbability * sigma * 10000) / p0;
  const effectiveDepthFactor = 1 / (1 + snipingProbability);
  return { snipingProbability, equilibriumSpreadBps, adverseSelectionShare, fastTraderRentBps, effectiveDepthFactor };
}
