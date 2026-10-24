export function computeKyleCournotEquilibrium(p: KyleCournotParams): KyleCournotResult {
  const n = Math.max(1, Math.round(p.numInformedTraders));
  const sig0 = Math.max(1e-6, p.assetVariance), sigU = Math.max(1e-6, Math.sqrt(Math.max(1e-6, p.noiseVariance)));
  const p0 = p.initialPrice, v = p.fundamentalValue;
  const beta = sigU / Math.sqrt(n * sig0);
  const lambda = Math.sqrt(n * sig0) / ((n + 1) * sigU);
  const depth = 1 / Math.max(1e-8, lambda);
  const aggregateX = n * beta * (v - p0);
  const clearingPrice = p0 + lambda * aggregateX;
  const expProfit = (Math.sqrt(sig0 / n) * sigU) / Math.pow(n + 1, 2);
  const residualVar = sig0 / (n + 1);
  const efficiency = 1 - residualVar / sig0;
  return {
    traderAggressiveness: beta,
    priceImpactLambda: lambda,
    marketDepth: depth,
    clearingPrice,
    aggregateInformedFlow: aggregateX,
    expectedTraderProfit: expProfit,
    residualUncertainty: residualVar,
    priceEfficiencyRatio: efficiency,
  };
}

export interface KyleCournotParams {
  readonly numInformedTraders: number;
  readonly assetVariance: number;
  readonly noiseVariance: number;
  readonly initialPrice: number;
  readonly fundamentalValue: number;
}

export interface KyleCournotResult {
  readonly traderAggressiveness: number;
  readonly priceImpactLambda: number;
  readonly marketDepth: number;
  readonly clearingPrice: number;
  readonly aggregateInformedFlow: number;
  readonly expectedTraderProfit: number;
  readonly residualUncertainty: number;
  readonly priceEfficiencyRatio: number;
}
