import type { FosterViswanathanParams, FosterViswanathanResult, FosterViswanathanStage } from './foster-viswanathan-types';

export function computeFosterViswanathanEquilibrium(p: FosterViswanathanParams): FosterViswanathanResult {
  const m = Math.max(1, Math.floor(p.numTraders));
  const rounds = Math.max(1, Math.floor(p.numRounds));
  const sigmaU = Math.max(1e-6, p.noiseVariance);
  const rho = Math.max(0, Math.min(0.99, p.signalCorrelation));

  let currentSigma = Math.max(1e-6, p.priorVariance);
  const stages: FosterViswanathanStage[] = [];

  for (let r = 1; r <= rounds; r++) {
    const compFactor = 1 + (m - 1) * rho;
    const beta = Math.sqrt(sigmaU / (m * compFactor * currentSigma));
    const denom = m * (beta ** 2) * currentSigma * compFactor + sigmaU;
    const lambda = (m * beta * currentSigma) / denom;
    const postSigma = currentSigma * (1 - lambda * m * beta);
    const safePostSigma = Math.max(1e-8, Math.min(currentSigma, postSigma));
    const volumeVar = denom;

    stages.push({ round: r, beta, lambda, posteriorVariance: safePostSigma, expectedVolume: volumeVar });
    currentSigma = safePostSigma;
  }

  const terminalUncertainty = currentSigma;
  const infoRevealed = Math.max(0, p.priorVariance - terminalUncertainty);
  const avgDepth = stages.reduce((s, st) => s + (st.lambda > 1e-8 ? 1 / st.lambda : 0), 0) / stages.length;

  return { stages, totalInformationRevealed: infoRevealed, terminalUncertainty, averageMarketDepth: avgDepth };
}
