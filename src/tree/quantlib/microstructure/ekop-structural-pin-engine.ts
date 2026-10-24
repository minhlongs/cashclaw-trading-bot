export function computeEkopStructuralPin(p: EkopStructuralPinParams): EkopStructuralPinResult {
  const alpha = Math.max(0, Math.min(1, p.eventProbability));
  const delta = Math.max(0, Math.min(1, p.badNewsProbability));
  const mu = Math.max(0, p.informedArrivalRate);
  const eb = Math.max(1e-6, p.uninformedBuyRate), es = Math.max(1e-6, p.uninformedSellRate);
  const informedVolume = alpha * mu;
  const pin = informedVolume / (informedVolume + eb + es);
  const expBuys = alpha * (1 - delta) * mu + eb;
  const expSells = alpha * delta * mu + es;
  const totalVol = expBuys + expSells;
  const asymmetry = totalVol > 0 ? Math.abs(expBuys - expSells) / totalVol : 0;
  const riskLevel: AdverseSelectionRiskLevel = pin > 0.35 ? 'HIGH' : pin > 0.15 ? 'MEDIUM' : 'LOW';
  return {
    pin,
    expectedBuys: expBuys,
    expectedSells: expSells,
    expectedTotalVolume: totalVol,
    orderFlowAsymmetry: asymmetry,
    adverseSelectionRiskLevel: riskLevel,
  };
}

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
