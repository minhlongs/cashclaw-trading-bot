export interface L2TopSnapshot {
  readonly bidPrice: number;
  readonly bidSize: number;
  readonly askPrice: number;
  readonly askSize: number;
  readonly timestampMs: number;
}

export interface OfiResult {
  readonly ofi: number;
  readonly normalizedOfi: number;
  readonly timestampMs: number;
}

export interface MicrostructureTrade {
  readonly price: number;
  readonly size: number;
  readonly side: 'buy' | 'sell';
  readonly timestampMs: number;
}

export interface VpinMetric {
  readonly vpin: number;
  readonly sampleBucketsCount: number;
  readonly isToxic: boolean;
  readonly timestampMs: number;
}

export interface MicrostructureSignal {
  readonly ofiScore: number;
  readonly vpinToxicity: number;
  readonly compositeDirection: 'buy' | 'sell' | 'neutral';
  readonly confidence: number;
}
