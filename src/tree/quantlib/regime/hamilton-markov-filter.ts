export type HamiltonRegimeState = 'LOW_VOL_BULL' | 'HIGH_VOL_CRISIS';

export interface HamiltonFilterParams {
  readonly returns: readonly number[];
  readonly p11: number;
  readonly p22: number;
  readonly mu1: number;
  readonly sigma1: number;
  readonly mu2: number;
  readonly sigma2: number;
}

export interface HamiltonFilterStep {
  readonly stepIndex: number;
  readonly returnVal: number;
  readonly predictedLowVolProb: number;
  readonly predictedCrisisProb: number;
  readonly filteredLowVolProb: number;
  readonly filteredCrisisProb: number;
  readonly activeState: HamiltonRegimeState;
  readonly sizingMultiplier: number;
}

export interface HamiltonFilterResult {
  readonly ergodicLowVolPi1: number;
  readonly ergodicCrisisPi2: number;
  readonly expectedDurationLowVol: number;
  readonly expectedDurationCrisis: number;
  readonly logLikelihoodHmm: number;
  readonly logLikelihoodSingleGaussian: number;
  readonly likelihoodRatio2DeltaL: number;
  readonly latestCrisisProb: number;
  readonly latestSizingMultiplier: number;
  readonly latestState: HamiltonRegimeState;
  readonly steps: readonly HamiltonFilterStep[];
}

function gaussianPdf(x: number, mu: number, sigma: number): number {
  const s = Math.max(1e-6, sigma);
  const z = (x - mu) / s;
  return Math.max(1e-30, (1 / (Math.sqrt(2 * Math.PI) * s)) * Math.exp(-0.5 * z * z));
}

function computeSingleGaussianLogLik(returns: readonly number[]): number {
  if (returns.length === 0) return 0;
  const mean = returns.reduce((acc, r) => acc + r, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / returns.length;
  const std = Math.max(1e-4, Math.sqrt(variance));
  return returns.reduce((acc, r) => acc + Math.log(gaussianPdf(r, mean, std)), 0);
}

export function runHamiltonMarkovFilter(params: HamiltonFilterParams): HamiltonFilterResult {
  const p11 = Math.min(0.999, Math.max(0.001, params.p11));
  const p22 = Math.min(0.999, Math.max(0.001, params.p22));
  const denom = Math.max(1e-6, 2 - p11 - p22);
  const pi1 = Number(((1 - p22) / denom).toFixed(6));
  const pi2 = Number((1 - pi1).toFixed(6));

  let xi1 = pi1;
  let xi2 = pi2;
  let logLikHmm = 0;
  const steps: HamiltonFilterStep[] = [];

  for (let t = 0; t < params.returns.length; t++) {
    const r = params.returns[t]!;
    const pred1 = p11 * xi1 + (1 - p22) * xi2;
    const pred2 = (1 - p11) * xi1 + p22 * xi2;
    const eta1 = gaussianPdf(r, params.mu1, params.sigma1);
    const eta2 = gaussianPdf(r, params.mu2, params.sigma2);
    const joint = Math.max(1e-30, pred1 * eta1 + pred2 * eta2);

    xi1 = (pred1 * eta1) / joint;
    xi2 = 1 - xi1;
    logLikHmm += Math.log(joint);

    const sizing = Math.max(0.15, Math.min(1, 1 - 0.85 * xi2));
    steps.push({
      stepIndex: t + 1,
      returnVal: r,
      predictedLowVolProb: Number(pred1.toFixed(6)),
      predictedCrisisProb: Number(pred2.toFixed(6)),
      filteredLowVolProb: Number(xi1.toFixed(6)),
      filteredCrisisProb: Number(xi2.toFixed(6)),
      activeState: xi2 >= 0.5 ? 'HIGH_VOL_CRISIS' : 'LOW_VOL_BULL',
      sizingMultiplier: Number(sizing.toFixed(4)),
    });
  }

  const logLik0 = computeSingleGaussianLogLik(params.returns);
  const lrStat = Math.max(0, 2 * (logLikHmm - logLik0));
  const last = steps[steps.length - 1];

  return {
    ergodicLowVolPi1: pi1,
    ergodicCrisisPi2: pi2,
    expectedDurationLowVol: Number((1 / (1 - p11)).toFixed(2)),
    expectedDurationCrisis: Number((1 / (1 - p22)).toFixed(2)),
    logLikelihoodHmm: Number(logLikHmm.toFixed(4)),
    logLikelihoodSingleGaussian: Number(logLik0.toFixed(4)),
    likelihoodRatio2DeltaL: Number(lrStat.toFixed(4)),
    latestCrisisProb: last?.filteredCrisisProb ?? pi2,
    latestSizingMultiplier: last?.sizingMultiplier ?? Number(Math.max(0.15, 1 - 0.85 * pi2).toFixed(4)),
    latestState: last?.activeState ?? (pi2 >= 0.5 ? 'HIGH_VOL_CRISIS' : 'LOW_VOL_BULL'),
    steps,
  };
}
