export function computeHasbrouckTradeImpact(p: HasbrouckTradeImpactParams): HasbrouckTradeImpactResult {
  const n = Math.min(p.tradeInnovations.length, p.returns.length);
  if (n === 0) return { permanentImpact: 0, transientImpact: 0, informationShare: 0, tradeInnovationVariance: 0, returnVariance: 0 };
  let sumX2 = 0, sumR2 = 0, sumRX = 0;
  for (let i = 0; i < n; i++) {
    const x = p.tradeInnovations[i]!, r = p.returns[i]!;
    sumX2 += x * x; sumR2 += r * r; sumRX += r * x;
  }
  const varX = sumX2 / n, varR = sumR2 / n;
  const beta = varX > 1e-8 ? sumRX / (n * varX) : 0;
  const permImpact = Math.max(0, beta);
  const tradeExplRetVar = Math.pow(beta, 2) * varX;
  const infoShare = varR > 1e-8 ? Math.max(0, Math.min(1, tradeExplRetVar / varR)) : 0;
  return { permanentImpact: permImpact, transientImpact: Math.max(0, beta * 0.4), informationShare: infoShare, tradeInnovationVariance: varX, returnVariance: varR };
}

export interface HasbrouckTradeImpactParams {
  readonly tradeInnovations: readonly number[];
  readonly returns: readonly number[];
  readonly lagOrder?: number;
}

export interface HasbrouckTradeImpactResult {
  readonly permanentImpact: number;
  readonly transientImpact: number;
  readonly informationShare: number;
  readonly tradeInnovationVariance: number;
  readonly returnVariance: number;
}
