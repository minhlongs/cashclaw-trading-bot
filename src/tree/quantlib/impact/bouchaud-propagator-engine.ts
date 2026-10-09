import type {
  BouchaudPropagatorParams,
  BouchaudPropagatorResult,
  PropagatorOrderTick,
} from './bouchaud-propagator-types';

export function computeBouchaudImpact(
  ticks: readonly PropagatorOrderTick[],
  params: BouchaudPropagatorParams,
): BouchaudPropagatorResult {
  if (ticks.length === 0) {
    return { impactSeries: [], peakImpact: 0, permanentImpact: 0, relaxationRatio: 0 };
  }

  const gamma0 = Math.max(1e-6, params.gamma0);
  const tau0 = Math.max(1e-4, params.tau0);
  const beta = Math.max(0.01, Math.min(1.0, params.beta));

  const kernel = (tau: number): number => gamma0 / Math.pow(1 + tau / tau0, beta);

  const n = ticks.length;
  const impactSeries: number[] = new Array(n);
  let maxAbsImpact = 0;

  for (let t = 0; t < n; t++) {
    let impactAtT = 0;
    for (let s = 0; s <= t; s++) {
      const tau = t - s;
      const signedVol = (ticks[s].volume ?? 1) * ticks[s].orderSign;
      impactAtT += kernel(tau) * signedVol;
    }
    impactSeries[t] = impactAtT;
    if (Math.abs(impactAtT) > maxAbsImpact) {
      maxAbsImpact = Math.abs(impactAtT);
    }
  }

  const permanentImpact = impactSeries[n - 1];
  const relaxationRatio = maxAbsImpact > 1e-8
    ? Math.max(0, 1 - Math.abs(permanentImpact) / maxAbsImpact)
    : 0;

  return {
    impactSeries,
    peakImpact: maxAbsImpact,
    permanentImpact,
    relaxationRatio,
  };
}
