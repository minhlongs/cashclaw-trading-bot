export interface KalmanPairObservation {
  readonly priceY: number;
  readonly priceX: number;
}

export interface KalmanFilterConfig {
  readonly delta?: number;
  readonly rVariance?: number;
}

export interface KalmanState {
  readonly beta: number;
  readonly alpha: number;
  readonly error: number;
  readonly qVariance: number;
  readonly halfLifeBars: number;
}
