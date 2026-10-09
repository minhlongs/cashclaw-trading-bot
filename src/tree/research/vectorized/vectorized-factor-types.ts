export interface VectorizedSeries {
  readonly name: string;
  readonly data: Float64Array;
}

export interface VectorizedIcMetrics {
  readonly factorName: string;
  readonly pearsonIc: number;
  readonly spearmanIc: number;
  readonly tStatistic: number;
  readonly pValueApprox: number;
  readonly observations: number;
}

export interface VectorizedQuantileSpread {
  readonly topQuantileMeanReturn: number;
  readonly bottomQuantileMeanReturn: number;
  readonly longShortSpread: number;
  readonly monotonicScore: number;
}
