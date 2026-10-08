import type { KellySizingResult } from './fleet-types';

export const MAX_SAFE_LEVERAGE = 3.0;

export function computeFractionalKelly(
  winRate: number,
  winLossRatio: number,
  fraction = 0.5, // Default Half-Kelly
  maxLeverageCap = MAX_SAFE_LEVERAGE,
): KellySizingResult {
  if (winRate <= 0 || winRate >= 1 || winLossRatio <= 0) {
    return { fullKelly: 0, halfKelly: 0, recommendedLeverage: 0, safeCapReached: false };
  }

  const p = winRate;
  const q = 1 - p;
  const b = winLossRatio;

  // Kelly formula: f* = (b*p - q) / b
  const fullKelly = Math.max(0, (b * p - q) / b);
  const fractional = fullKelly * fraction;

  const safeCapReached = fractional > maxLeverageCap;
  const recommendedLeverage = Math.min(maxLeverageCap, fractional);

  return {
    fullKelly,
    halfKelly: fractional,
    recommendedLeverage,
    safeCapReached,
  };
}
