import type { EasleyOharaParams, EasleyOharaResult } from './easley-ohara-types';

export function computeEasleyOharaAsymmetry(p: EasleyOharaParams): EasleyOharaResult {
  const alpha = Math.min(1, Math.max(0, p.eventProbability));
  const mu = Math.max(0, p.informedRate);
  const theta = Math.min(1, Math.max(0, p.informedLargeFraction));
  const epsS = Math.max(1e-6, p.uninformedSmallRate);
  const epsL = Math.max(1e-6, p.uninformedLargeRate);
  const vol = Math.max(1e-4, p.volatility);
  const infL = alpha * mu * theta;
  const infS = alpha * mu * (1 - theta);
  const pinLarge = infL / (infL + 2 * epsL);
  const pinSmall = infS / (infS + 2 * epsS);
  const spreadLargeBps = pinLarge * vol * 10000;
  const spreadSmallBps = pinSmall * vol * 10000;
  const sizeAsymmetryRatio = pinSmall > 0 ? pinLarge / pinSmall : 1;
  const largeOrderAdverseSelectionMarkup = spreadLargeBps - spreadSmallBps;
  return { pinLarge, pinSmall, spreadLargeBps, spreadSmallBps, sizeAsymmetryRatio, largeOrderAdverseSelectionMarkup };
}
