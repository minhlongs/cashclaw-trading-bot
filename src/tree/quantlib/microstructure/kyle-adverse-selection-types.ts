export interface SignedOrderFlowTrade {
  readonly timestamp: number;
  readonly price: number;
  readonly quantity: number;
  readonly side: 'BUY' | 'SELL';
}

export type AdverseSelectionLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface KyleLambdaResult {
  readonly lambda: number;
  readonly rSquared: number;
  readonly tStat: number;
  readonly adverseSelectionRisk: AdverseSelectionLevel;
  readonly observationCount: number;
  readonly netSignedOrderFlow: number;
}

export interface KyleEngineConfig {
  readonly minObservations?: number;
  readonly highLambdaThreshold?: number;
  readonly criticalLambdaThreshold?: number;
}
