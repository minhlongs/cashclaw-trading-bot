import type { RosuOrderBookParams, RosuOrderBookResult } from './rosu-orderbook-types';

export function computeRosuOrderBook(p: RosuOrderBookParams): RosuOrderBookResult {
  const lambda = Math.max(1e-4, p.arrivalIntensity);
  const r = Math.max(1e-6, p.impatienceDiscountRate);
  const delta = Math.max(1e-6, p.tickSize);
  const q = Math.max(0.01, p.orderSize);
  const sigma = Math.max(0, p.volatility);
  const levels = Math.max(1, p.depthLevels ?? 5);

  const rawSpread = (2 * r) / lambda + delta + sigma * Math.sqrt(2 / lambda);
  const equilibriumSpread = Math.max(delta, rawSpread);
  const probLimitFillBeforeCancel = Math.min(1.0, Math.max(0.01, lambda / (lambda + r)));
  const expectedWaitingTimeSec = 1 / (lambda * probLimitFillBeforeCancel);
  const immediacyPremiumBps = Math.max(0, (r / lambda) * 10000);

  const depthProfile: number[] = [];
  for (let k = 1; k <= levels; k++) {
    depthProfile.push(q * Math.pow(1 + r / lambda, k - 1));
  }

  return { equilibriumSpread, probLimitFillBeforeCancel, expectedWaitingTimeSec, immediacyPremiumBps, depthProfile };
}
