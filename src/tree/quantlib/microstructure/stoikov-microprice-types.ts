export interface StoikovOrderBookL1 {
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly bidVolume: number;
  readonly askVolume: number;
}

export interface StoikovMicroPriceConfig {
  readonly kappa?: number;
}

export interface StoikovMicroPriceResult {
  readonly midPrice: number;
  readonly spread: number;
  readonly imbalance: number;
  readonly microPrice: number;
  readonly driftBps: number;
  readonly probabilityUp: number;
}
