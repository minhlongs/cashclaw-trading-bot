export function computeBgtAsymmetricBook(p: BgtAsymmetricBookParams): BgtAsymmetricBookResult {
  const vb = Math.max(0, p.bidVolume), va = Math.max(0, p.askVolume);
  const totalVol = vb + va;
  const queueImbalance = totalVol > 0 ? (vb - va) / totalVol : 0;
  const logDepthRatio = vb > 0 && va > 0 ? Math.log(vb / va) : (vb > 0 ? 5 : (va > 0 ? -5 : 0));
  const expectedPriceChange = p.imbalanceCoeff * queueImbalance + p.depthRatioCoeff * logDepthRatio + p.ofiCoeff * p.ofi;
  const logit = p.baseInformedLogit + p.sensitivityInformed * Math.abs(queueImbalance);
  const informedTradingProbability = 1 / (1 + Math.exp(-logit));
  let bookState: BgtBookState = 'BALANCED';
  if (queueImbalance > 0.15) bookState = 'BUY_PRESSURE';
  else if (queueImbalance < -0.15) bookState = 'SELL_PRESSURE';
  return { queueImbalance, logDepthRatio, expectedPriceChange, informedTradingProbability, bookState };
}

export interface BgtAsymmetricBookParams {
  readonly bidVolume: number;
  readonly askVolume: number;
  readonly ofi: number;
  readonly imbalanceCoeff: number;
  readonly depthRatioCoeff: number;
  readonly ofiCoeff: number;
  readonly baseInformedLogit: number;
  readonly sensitivityInformed: number;
}

export type BgtBookState = 'BUY_PRESSURE' | 'SELL_PRESSURE' | 'BALANCED';

export interface BgtAsymmetricBookResult {
  readonly queueImbalance: number;
  readonly logDepthRatio: number;
  readonly expectedPriceChange: number;
  readonly informedTradingProbability: number;
  readonly bookState: BgtBookState;
}
