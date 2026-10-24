export function computeFoucaultEquilibrium(p: FoucaultEquilibriumParams): FoucaultEquilibriumResult {
  const sigV = Math.max(1e-4, p.assetVolatility), mid = Math.max(1e-4, p.midPrice ?? 100);
  const alphaI = Math.min(0.99, Math.max(0, p.informedProportion));
  const c = Math.max(0, p.holdingCost ?? 0.01), theta = Math.min(1, Math.max(0.01, p.orderArrivalRate ?? 0.8));
  const denom = Math.max(1e-4, 1 - alphaI * (1 - theta));
  const halfSpread = Math.max(1e-4, (alphaI * sigV + c) / denom);
  const fillProb = Math.min(1, Math.max(0, (1 - alphaI) / (1 + theta * (1 - alphaI))));
  const spread = halfSpread * 2;
  const curseBps = ((alphaI * sigV) / mid) * 10_000;
  const marketProb = 1 - fillProb;
  return {
    halfSpread,
    bid: Math.max(1e-4, mid - halfSpread),
    ask: mid + halfSpread,
    spread,
    fillProbability: fillProb,
    winnersCurseBps: curseBps,
    marketOrderProb: marketProb,
  };
}

export interface FoucaultEquilibriumParams {
  readonly assetVolatility: number;
  readonly informedProportion: number;
  readonly holdingCost?: number;
  readonly orderArrivalRate?: number;
  readonly midPrice?: number;
}

export interface FoucaultEquilibriumResult {
  readonly halfSpread: number;
  readonly bid: number;
  readonly ask: number;
  readonly spread: number;
  readonly fillProbability: number;
  readonly winnersCurseBps: number;
  readonly marketOrderProb: number;
}
