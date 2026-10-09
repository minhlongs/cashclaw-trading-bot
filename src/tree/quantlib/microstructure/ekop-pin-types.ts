export interface EkopTradeBucket {
  readonly buys: number;
  readonly sells: number;
}

export interface EkopPinResult {
  readonly pin: number; // Probability of Informed Trading [0, 1]
  readonly alpha: number; // Probability of information event [0, 1]
  readonly mu: number; // Informed trader arrival rate
  readonly epsilon: number; // Uninformed noise arrival rate
  readonly sampleBuckets: number;
}
