import type { BackBaruchParams, BackBaruchResult, BackBaruchStep } from './back-baruch-types';

export function computeBackBaruchEquilibrium(p: BackBaruchParams): BackBaruchResult {
  const t = Math.max(1e-4, p.timeHorizon), n = Math.max(1, Math.floor(p.numSteps)), dt = t / n;
  const sig0 = Math.max(1e-8, p.priorVariance), sigmaU = Math.max(1e-6, p.noiseVolatility);
  const lambdaConst = Math.sqrt(sig0) / (sigmaU * Math.sqrt(t));
  const betaConst = sigmaU / Math.sqrt(sig0 * t);
  const trajectory: BackBaruchStep[] = [];
  let sumLambda = 0;
  for (let i = 0; i < n; i++) {
    const elapsed = i * dt;
    const postVar = Math.max(0, sig0 * (1 - elapsed / t));
    const efficiency = Math.min(1, Math.max(0, 1 - postVar / sig0));
    sumLambda += lambdaConst;
    trajectory.push({
      step: i + 1, time: elapsed, kyleLambda: lambdaConst,
      posteriorVariance: postVar, traderAggressiveness: betaConst,
      priceDiscoveryEfficiency: efficiency,
    });
  }
  const termVar = Math.max(0, sig0 * (1 - (n * dt) / t));
  return {
    trajectory, terminalVariance: termVar, averageLambda: sumLambda / n,
    finalDiscoveryEfficiency: Math.min(1, Math.max(0, 1 - termVar / sig0)),
  };
}
