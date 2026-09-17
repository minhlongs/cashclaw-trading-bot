/**
 * Internal mathematical helper functions for portfolio risk overlays.
 * Pure functions, zero state, zero side-effects, deterministic.
 */

export function sumAbs(m: ReadonlyMap<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += Math.abs(v);
  return s;
}

export function scaleWeights(m: ReadonlyMap<string, number>, factor: number): Map<string, number> {
  const r = new Map<string, number>();
  for (const [k, v] of m) r.set(k, v * factor);
  return r;
}

export function scaleWeightsDelta(
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

export function fmt(n: number): string {
  return n.toFixed(4);
}
