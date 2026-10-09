import type { HoldenSubrahmanyamParams, HoldenSubrahmanyamResult, HoldenSubrahmanyamStage } from './holden-subrahmanyam-types';

export function computeHoldenSubrahmanyamEquilibrium(p: HoldenSubrahmanyamParams): HoldenSubrahmanyamResult {
  const m = Math.max(1, Math.floor(p.numTraders));
  const rounds = Math.max(1, Math.floor(p.numRounds));
  const sigmaU = Math.max(1e-6, p.noiseVariance);
  const rho = Math.max(0, p.riskAversion);

  let currentSigma = Math.max(1e-6, p.priorVariance);
  const stages: HoldenSubrahmanyamStage[] = [];

  for (let r = 1; r <= rounds; r++) {
    // Under risk aversion rho, traders trade aggressively to unload inventory risk early
    // beta = sqrt(sigmaU / (m * currentSigma)) / (1 + rho * sqrt(currentSigma * sigmaU / m))
    const baseBeta = Math.sqrt(sigmaU / (m * currentSigma));
    const riskDamping = 1 + rho * Math.sqrt((currentSigma * sigmaU) / m);
    const beta = baseBeta / riskDamping;
    const denom = m * (beta ** 2) * currentSigma + sigmaU;
    const lambda = (m * beta * currentSigma) / denom;
    const postSigma = currentSigma * (1 - lambda * m * beta);
    const safePostSigma = Math.max(1e-8, Math.min(currentSigma, postSigma));
    const efficiency = 1 - (safePostSigma / p.priorVariance);

    stages.push({ round: r, beta, lambda, posteriorVariance: safePostSigma, priceEfficiency: efficiency });
    currentSigma = safePostSigma;
  }

  const terminalUncertainty = currentSigma;
  const infoRevealed = Math.max(0, p.priorVariance - terminalUncertainty);
  const avgDepth = stages.reduce((s, st) => s + (st.lambda > 1e-8 ? 1 / st.lambda : 0), 0) / stages.length;

  return { stages, totalInformationRevealed: infoRevealed, terminalUncertainty, averageMarketDepth: avgDepth };
}
