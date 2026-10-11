export type ToxicityLevel = 'low' | 'moderate' | 'high' | 'extreme';

export interface VpinTrade {
  size: number;
  priceChange: number;
}

export interface VolumeBucket {
  index: number;
  buyVolume: number;
  sellVolume: number;
  absImbalance: number;
}

export interface EasleyVpinParams {
  trades: VpinTrade[];
  bucketVolume: number;
  numBuckets?: number;
  priceStdDev?: number;
}

export interface EasleyVpinResult {
  vpin: number;
  toxicityLevel: ToxicityLevel;
  totalBuckets: number;
  averageImbalance: number;
  buckets: VolumeBucket[];
}
