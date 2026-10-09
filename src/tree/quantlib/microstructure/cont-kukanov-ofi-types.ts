export interface LobLevel {
  readonly bidPrice: number;
  readonly bidSize: number;
  readonly askPrice: number;
  readonly askSize: number;
}

export interface ContKukanovOfiParams {
  readonly prevLevels: readonly LobLevel[];
  readonly currLevels: readonly LobLevel[];
  readonly decayBeta?: number; // Level power decay parameter beta (default 0.5)
  readonly impactMultiplier?: number; // Basis point impact per unit OFI (default 1.0)
}

export interface ContKukanovOfiResult {
  readonly levelOfis: readonly number[];
  readonly totalOfi: number;
  readonly predictedPriceImpact: number;
  readonly depthImbalance: number;
}
