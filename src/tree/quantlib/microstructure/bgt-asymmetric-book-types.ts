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
