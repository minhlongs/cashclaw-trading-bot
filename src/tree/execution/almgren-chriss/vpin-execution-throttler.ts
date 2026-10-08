/**
 * @file vpin-execution-throttler.ts
 * @description Dynamic horizon dilation and maker/taker routing based on Continuous VPIN toxicity CDF.
 */

import type { ThrottleResult, VpinThrottleConfig } from './almgren-chriss-types';

export const DEFAULT_VPIN_THROTTLE_CONFIG: VpinThrottleConfig = {
  toxicityCdfThreshold: 0.85,
  dilationFactor: 2.0,
  criticalCdfThreshold: 0.95,
};

export function evaluateVpinThrottling(
  baseHorizonSeconds: number,
  vpinCdf: number,
  config: VpinThrottleConfig = DEFAULT_VPIN_THROTTLE_CONFIG
): ThrottleResult {
  const clampedCdf = Math.max(0, Math.min(1, vpinCdf));

  if (clampedCdf < config.toxicityCdfThreshold) {
    return {
      adjustedHorizonSeconds: baseHorizonSeconds,
      dilationMultiplier: 1.0,
      preferPassiveMaker: false,
      isThrottled: false,
    };
  }

  // Toxicity surge detected: dilate execution horizon to reduce instantaneous market impact
  const excessToxicity = clampedCdf - config.toxicityCdfThreshold;
  const dilationMultiplier = 1.0 + config.dilationFactor * excessToxicity;
  const adjustedHorizonSeconds = Math.round(baseHorizonSeconds * dilationMultiplier * 100) / 100;
  const preferPassiveMaker = clampedCdf >= config.criticalCdfThreshold;

  return {
    adjustedHorizonSeconds,
    dilationMultiplier: Math.round(dilationMultiplier * 1000) / 1000,
    preferPassiveMaker,
    isThrottled: true,
  };
}
