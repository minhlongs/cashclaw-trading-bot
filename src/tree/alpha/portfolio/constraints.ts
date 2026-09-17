/**
 * Portfolio risk overlay helpers — pure functions, no state.
 *
 * Each function applies one constraint to a weight map and returns the
 * scaled weights plus an optional riskAdjustments entry (null when
 * the constraint did not bind).
 */

import { fmt, scaleWeights, sumAbs } from './constraint-helpers';
import type { OverlayResult } from './exposure-constraints';

export type { OverlayResult } from './exposure-constraints';
export {
  applyBetaExposure,
  applyCorrelatedBucket,
  applyDrawdownDeRisk,
  applyTurnoverConstraint,
} from './exposure-constraints';

export function applyVolTarget(
  weights: ReadonlyMap<string, number>,
  realizedVol: number,
  targetVol: number,
): OverlayResult {
  if (realizedVol <= 0 || weights.size === 0) return { weights, adjustment: null };
  const gross = sumAbs(weights);
  const currentVol = gross * realizedVol;
  if (currentVol <= 0) return { weights, adjustment: null };
  const scale = targetVol / currentVol;
  if (Math.abs(scale - 1) < 1e-12) return { weights, adjustment: null };
  const scaled = scaleWeights(weights, scale);
  return { weights: scaled, adjustment: `vol target: scaled by ${fmt(scale)} (port vol ${fmt(currentVol)} -> ${fmt(targetVol)})` };
}

export function applyPositionCap(
  weights: ReadonlyMap<string, number>,
  maxWeight: number,
): OverlayResult {
  const capped = new Map<string, number>();
  let clippedCount = 0;
  let worstId = '';
  let worstFrom = 0;
  for (const [id, w] of weights) {
    const abs = Math.abs(w);
    if (abs > maxWeight) {
      capped.set(id, Math.sign(w) * maxWeight);
      clippedCount++;
      if (abs > worstFrom) { worstFrom = abs; worstId = id; }
    } else {
      capped.set(id, w);
    }
  }
  if (clippedCount === 0) return { weights, adjustment: null };
  return {
    weights: capped,
    adjustment: `position cap: clipped ${clippedCount} position(s), largest ${worstId} ${fmt(worstFrom)} -> ${fmt(maxWeight)}`,
  };
}

export function applyGrossExposure(
  weights: ReadonlyMap<string, number>,
  maxGross: number,
): OverlayResult {
  const gross = sumAbs(weights);
  if (gross <= maxGross) return { weights, adjustment: null };
  const scale = maxGross / gross;
  const scaled = scaleWeights(weights, scale);
  return { weights: scaled, adjustment: `gross exposure: scaled by ${fmt(scale)} (${fmt(gross)} -> ${fmt(maxGross)})` };
}

export function applyNetExposure(
  weights: ReadonlyMap<string, number>,
  maxNet: number,
): OverlayResult {
  let net = 0;
  for (const v of weights.values()) net += v;
  if (Math.abs(net) <= maxNet) return { weights, adjustment: null };
  const scale = maxNet / Math.abs(net);
  const scaled = scaleWeights(weights, scale);
  return { weights: scaled, adjustment: `net exposure: scaled by ${fmt(scale)} (|${fmt(net)}| -> ${fmt(maxNet)})` };
}
