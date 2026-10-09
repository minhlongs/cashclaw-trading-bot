export interface KyleOrderFlowObservation {
  readonly orderFlow: number; // Signed order flow Q (positive for buy, negative for sell)
  readonly priceChange: number; // Delta P (P_t - P_{t-1})
}

export interface KyleLambdaConfig {
  readonly minObservations: number;
  readonly varianceFloor: number;
  readonly adverseSelectionThreshold: number;
}

export interface KyleLambdaResult {
  readonly lambda: number; // Adverse selection price impact parameter
  readonly rSquared: number; // Explanatory power of order flow on price change
  readonly isInformedFlowDominant: boolean; // Flag if lambda exceeds adverse selection threshold
  readonly sampleCount: number;
}
