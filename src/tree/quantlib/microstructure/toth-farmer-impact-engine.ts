import type { TothFarmerImpactParams, TothFarmerImpactResult, TothFarmerRelaxationStep } from './toth-farmer-impact-types';

export function computeTothFarmerImpact(p: TothFarmerImpactParams): TothFarmerImpactResult {
  const q = Math.max(0, p.orderVolume), v = Math.max(1e-6, p.dailyVolume);
  const sigma = Math.max(0, p.volatility), y = Math.max(0, p.preFactor || 0.7);
  const alpha = Math.max(0, p.powerLawExponent || 0.5), tau0 = Math.max(1e-4, p.decayTimeConstant || 1);
  const steps = Math.max(1, Math.floor(p.evaluationSteps || 5));
  const participationRate = q / v;
  const peakImpact = y * sigma * Math.sqrt(participationRate);
  const instantaneousImpact = peakImpact * 0.5;
  const decayTrajectory: TothFarmerRelaxationStep[] = [];
  for (let i = 0; i < steps; i++) {
    const timeElapsed = i;
    const decayFactor = (1 + timeElapsed / tau0) ** (-alpha);
    const residualImpact = peakImpact * decayFactor;
    decayTrajectory.push({ step: i + 1, timeElapsed, decayFactor, residualImpact });
  }
  const terminalResidual = decayTrajectory[decayTrajectory.length - 1]?.residualImpact ?? peakImpact;
  return {
    instantaneousImpact,
    peakImpact,
    permanentResidualImpact: Math.min(peakImpact, terminalResidual * 0.67),
    participationRate,
    decayTrajectory,
  };
}
