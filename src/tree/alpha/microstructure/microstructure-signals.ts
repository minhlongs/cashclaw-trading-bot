import type { OfiResult, VpinMetric, MicrostructureSignal } from './microstructure-types';

export function deriveMicrostructureSignal(
  ofi: OfiResult,
  vpin: VpinMetric,
  ofiSignificanceThreshold = 0.2,
): MicrostructureSignal {
  const ofiScore = ofi.normalizedOfi;
  const vpinToxicity = vpin.vpin;

  let compositeDirection: 'buy' | 'sell' | 'neutral' = 'neutral';
  let confidence = Math.abs(ofiScore);

  // If high toxicity is detected, reinforce direction if OFI is strong, or force caution
  if (ofiScore > ofiSignificanceThreshold) {
    compositeDirection = 'buy';
    confidence = Math.min(1.0, confidence * (1 + (vpin.isToxic ? 0.3 : 0)));
  } else if (ofiScore < -ofiSignificanceThreshold) {
    compositeDirection = 'sell';
    confidence = Math.min(1.0, confidence * (1 + (vpin.isToxic ? 0.3 : 0)));
  } else {
    compositeDirection = 'neutral';
    confidence = 0;
  }

  return {
    ofiScore,
    vpinToxicity,
    compositeDirection,
    confidence,
  };
}
