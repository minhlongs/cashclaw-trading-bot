export function computeHubermanStanzlManipulation(p: HubermanStanzlManipulationParams): HubermanStanzlManipulationResult {
  const p0 = Math.max(1e-4, p.initialPrice), lambda = p.permanentImpactFactor;
  const theta = Math.max(0, p.transientImpactFactor ?? 0), rho = Math.max(0, Math.min(1, p.decayRate ?? 0.5));
  let cumShares = 0, totalCost = 0, permCost = 0, transCost = 0;
  const schedule: HubermanStanzlManipulationStep[] = [];
  for (let t = 0; t < p.tradeTrajectory.length; t++) {
    const qt = p.tradeTrajectory[t]!; cumShares += qt;
    let transientSum = 0;
    for (let s = 0; s < t; s++) transientSum += Math.pow(rho, t - s) * p.tradeTrajectory[s]!;
    const permImpact = lambda * cumShares, transImpact = theta * transientSum;
    const price = Math.max(1e-4, p0 + permImpact + transImpact), stepCost = qt * price;
    totalCost += stepCost; permCost += qt * permImpact; transCost += qt * transImpact;
    schedule.push({ step: t + 1, shares: qt, price, cumulativeShares: cumShares, stepCost });
  }
  const effPrice = cumShares !== 0 ? totalCost / cumShares : p0;
  const roundTripCost = totalCost - cumShares * p0;
  const isQuasiArbitrageFree = lambda > 0 && theta >= 0 && (cumShares !== 0 || roundTripCost >= -1e-6);
  return { schedule, totalCost, effectivePrice: effPrice, roundTripCost, isQuasiArbitrageFree, permanentImpactCost: permCost, transientImpactCost: transCost };
}

export interface HubermanStanzlManipulationStep {
  readonly step: number;
  readonly shares: number;
  readonly price: number;
  readonly cumulativeShares: number;
  readonly stepCost: number;
}

export interface HubermanStanzlManipulationParams {
  readonly tradeTrajectory: readonly number[];
  readonly initialPrice: number;
  readonly permanentImpactFactor: number;
  readonly transientImpactFactor?: number;
  readonly decayRate?: number;
}

export interface HubermanStanzlManipulationResult {
  readonly schedule: readonly HubermanStanzlManipulationStep[];
  readonly totalCost: number;
  readonly effectivePrice: number;
  readonly roundTripCost: number;
  readonly isQuasiArbitrageFree: boolean;
  readonly permanentImpactCost: number;
  readonly transientImpactCost: number;
}
