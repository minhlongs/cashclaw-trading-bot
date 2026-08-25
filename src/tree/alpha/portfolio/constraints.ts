/**
 * Portfolio risk overlay helpers — pure functions, no state.
 *
 * Each function applies one constraint to a weight map and returns the
 * scaled weights plus an optional riskAdjustments entry (null when
 * the constraint did not bind).
 */

export interface OverlayResult {
  readonly weights: ReadonlyMap<string, number>;
  readonly adjustment: string | null;
}

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

// ── Internal helpers ────────────────────────────────────────────────────────

function sumAbs(m: ReadonlyMap<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += Math.abs(v);
  return s;
}

function scaleWeights(m: ReadonlyMap<string, number>, factor: number): Map<string, number> {
  const r = new Map<string, number>();
  for (const [k, v] of m) r.set(k, v * factor);
  return r;
}

function scaleWeightsDelta(
  target: ReadonlyMap<string, number>,
  current: ReadonlyMap<string, number>,
  factor: number,
): Map<string, number> {
  const r = new Map<string, number>();
  for (const [id, w] of target) {
    const old = current.get(id) ?? 0;
    r.set(id, old + (w - old) * factor);
  }
  return r;
}

function fmt(n: number): string {
  return n.toFixed(4);
}
