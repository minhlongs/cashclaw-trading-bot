import type { HasbrouckVecmParams, HasbrouckVecmResult } from './hasbrouck-vecm-types';

export function computeHasbrouckVecm(p: HasbrouckVecmParams): HasbrouckVecmResult {
  const ticks = p.ticks;
  if (ticks.length < 2) {
    return { permanentPriceImpact: 0, transitoryPriceImpact: 0, errorCorrectionSpeed: 0, toxicityScore: 0, informationShare: 0 };
  }
  const beta = p.cointegrationBeta ?? 0.5, rho = p.lagCoeff ?? 0.2;
  let sumFlowSq = 0, sumDpFlow = 0, sumAbsFlow = 0, sumSpread = 0, sumTransitory = 0;

  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1]!, curr = ticks[i]!;
    const dp = curr.midPrice - prev.midPrice;
    const x = curr.orderFlow;
    sumFlowSq += x * x;
    sumDpFlow += dp * x;
    sumAbsFlow += Math.abs(x);
    sumSpread += curr.spread ?? Math.abs(dp) * 2;
    const equilibriumError = dp - beta * x;
    sumTransitory += Math.abs(equilibriumError * (1 - rho));
  }

  const denom = Math.max(1e-6, sumFlowSq);
  const permanent = Math.max(0, sumDpFlow / denom);
  const avgSpread = sumSpread / (ticks.length - 1);
  const transitory = sumTransitory / (ticks.length - 1);
  const alphaSpeed = Math.min(1, Math.max(0.01, beta * (1 - rho)));
  const toxicity = Math.min(1, Math.max(0, (sumAbsFlow > 0 ? (permanent * (ticks.length - 1)) / (sumAbsFlow + 1e-4) : 0)));
  const infoShare = Math.min(1, Math.max(0, permanent / (permanent + transitory + 1e-4)));

  return { permanentPriceImpact: permanent, transitoryPriceImpact: avgSpread > 0 ? transitory : 0, errorCorrectionSpeed: alphaSpeed, toxicityScore: toxicity, informationShare: infoShare };
}
