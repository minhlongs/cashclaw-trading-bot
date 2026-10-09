import type { BiaisHillionSpattParams, BiaisHillionSpattResult } from './biais-hillion-spatt-types';

export function computeBiaisHillionSpattMicrostructure(p: BiaisHillionSpattParams): BiaisHillionSpattResult {
  const s = Math.max(1, p.spreadTicks);
  const totalDepth = Math.max(1, p.bidDepth + p.askDepth);
  const lambda0 = Math.max(0.01, p.baseArrivalRate);
  const alphaS = Math.max(0.01, p.spreadSensitivity);
  const betaD = Math.max(0.01, p.depthSensitivity);

  const rawLimit = alphaS * (s - 1) + 1.0;
  const rawMarket = 1.0 / (1.0 + 0.5 * (s - 1)) + betaD * Math.log(1 + totalDepth);
  const rawCancel = 0.5 + 1.0 / (1.0 + betaD * totalDepth);
  const sumRaw = rawLimit + rawMarket + rawCancel;

  const probLimitOrderAtTouch = rawLimit / sumRaw;
  const probMarketOrder = rawMarket / sumRaw;
  const probCancellation = rawCancel / sumRaw;

  const liquidityReplenishmentRate = lambda0 * probLimitOrderAtTouch;
  const spreadWideningRisk = Math.min(1, Math.max(0, (probMarketOrder + probCancellation) * (1 / Math.sqrt(totalDepth))));
  const resiliencyHalfLife = liquidityReplenishmentRate > 0 ? Math.LN2 / liquidityReplenishmentRate : 999;

  return { probLimitOrderAtTouch, probMarketOrder, probCancellation, liquidityReplenishmentRate, spreadWideningRisk, resiliencyHalfLife };
}
