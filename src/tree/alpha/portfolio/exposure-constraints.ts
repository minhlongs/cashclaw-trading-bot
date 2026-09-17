/**
 * Complex portfolio risk overlays — correlated buckets, beta exposure,
 * turnover, and drawdown de-risking.
 * Pure functions, no state, no I/O.
 */

import { fmt, scaleWeights, scaleWeightsDelta } from './constraint-helpers';

export interface OverlayResult {
  readonly weights: ReadonlyMap<string, number>;
  readonly adjustment: string | null;
}

export function applyCorrelatedBucket(
  weights: ReadonlyMap<string, number>,
  corrMatrix: ReadonlyMap<string, ReadonlyMap<string, number>>,
  bucketThreshold: number,
  maxCorrelated: number,
): OverlayResult {
  const ids = [...weights.keys()];
  if (ids.length < 2) return { weights, adjustment: null };
  const visited = new Set<string>();
  let totalAdjustments = 0;
  const result = new Map(weights);

  for (const id of ids) {
    if (visited.has(id)) continue;
    const bucket = [id];
    visited.add(id);
    for (const other of ids) {
      if (visited.has(other)) continue;
      const row = corrMatrix.get(id);
      const c = row?.get(other);
      if (c !== undefined && c >= bucketThreshold) {
        bucket.push(other);
        visited.add(other);
      }
    }
    if (bucket.length < 2) continue;
    let bucketGross = 0;
    for (const b of bucket) bucketGross += Math.abs(result.get(b) ?? 0);
    if (bucketGross <= maxCorrelated) continue;
    const scale = maxCorrelated / bucketGross;
    for (const b of bucket) result.set(b, (result.get(b) ?? 0) * scale);
    totalAdjustments++;
  }
  if (totalAdjustments === 0) return { weights, adjustment: null };
  return { weights: result, adjustment: `correlated bucket: scaled ${totalAdjustments} bucket(s) to ${fmt(maxCorrelated)} max` };
}

export function applyBetaExposure(
  weights: ReadonlyMap<string, number>,
  betas: ReadonlyMap<string, number | null>,
  maxBeta: number,
): OverlayResult {
  const flagged: string[] = [];
  let betaSum = 0;
  for (const [id, w] of weights) {
    const b = betas.get(id);
    if (b === null) {
      flagged.push(`beta null for ${id}: excluded from beta calc (fail-closed)`);
      continue;
    }
    if (b === undefined) continue;
    betaSum += w * b;
  }
  const absBeta = Math.abs(betaSum);
  const baseAdj = flagged.length > 0 ? flagged.join('; ') : null;
  if (absBeta <= maxBeta) return { weights, adjustment: baseAdj };
  const scale = maxBeta / absBeta;
  const scaled = scaleWeights(weights, scale);
  const adj = baseAdj
    ? `beta exposure: scaled by ${fmt(scale)} (${fmt(absBeta)} -> ${fmt(maxBeta)}); ${baseAdj}`
    : `beta exposure: scaled by ${fmt(scale)} (${fmt(absBeta)} -> ${fmt(maxBeta)})`;
  return { weights: scaled, adjustment: adj };
}

export function applyTurnoverConstraint(
  weights: ReadonlyMap<string, number>,
  currentWeights: ReadonlyMap<string, number>,
  maxTurnover: number,
): OverlayResult {
  let totalDelta = 0;
  const allIds = new Set([...weights.keys(), ...currentWeights.keys()]);
  for (const id of allIds) {
    totalDelta += Math.abs((weights.get(id) ?? 0) - (currentWeights.get(id) ?? 0));
  }
  if (totalDelta <= maxTurnover) return { weights, adjustment: null };
  const scale = maxTurnover / totalDelta;
  const scaled = scaleWeightsDelta(weights, currentWeights, scale);
  return { weights: scaled, adjustment: `turnover constraint: delta scaled by ${fmt(scale)} (${fmt(totalDelta)} -> ${fmt(maxTurnover)})` };
}

export function applyDrawdownDeRisk(
  weights: ReadonlyMap<string, number>,
  currentDrawdown: number,
  threshold: number,
  deRiskFactor: number,
): OverlayResult {
  if (currentDrawdown <= threshold) return { weights, adjustment: null };
  const scaled = scaleWeights(weights, deRiskFactor);
  return { weights: scaled, adjustment: `drawdown de-risk: ${fmt(currentDrawdown)} > ${fmt(threshold)}, factor ${fmt(deRiskFactor)}` };
}
