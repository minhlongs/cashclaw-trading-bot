export interface StealthTrade {
  readonly size: number;
  readonly priceChange: number;
}

export interface StealthBucketMetrics {
  readonly tradeCount: number;
  readonly totalVolume: number;
  readonly cpcFraction: number;
  readonly volumeFraction: number;
  readonly stealthRatio: number;
}

export interface BarclayWarnerParams {
  readonly trades: readonly StealthTrade[];
  readonly smallCutoff?: number;
  readonly largeCutoff?: number;
}

export interface BarclayWarnerResult {
  readonly smallBucket: StealthBucketMetrics;
  readonly mediumBucket: StealthBucketMetrics;
  readonly largeBucket: StealthBucketMetrics;
  readonly dominantStealthBucket: 'small' | 'medium' | 'large';
  readonly totalTrades: number;
  readonly netCumulativePriceChange: number;
}
