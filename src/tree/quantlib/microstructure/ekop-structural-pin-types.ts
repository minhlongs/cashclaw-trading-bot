export interface EkopStructuralPinParams {
  readonly eventProbability: number; // alpha in [0, 1]
  readonly badNewsProbability: number; // delta in [0, 1]
  readonly informedArrivalRate: number; // mu > 0
  readonly uninformedBuyRate: number; // epsilon_b > 0
  readonly uninformedSellRate: number; // epsilon_s > 0
}

export type AdverseSelectionRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface EkopStructuralPinResult {
  readonly pin: number;
  readonly expectedBuys: number;
  readonly expectedSells: number;
  readonly expectedTotalVolume: number;
  readonly orderFlowAsymmetry: number;
  readonly adverseSelectionRiskLevel: AdverseSelectionRiskLevel;
}
