export interface StollTick {
  price: number;
  midpoint: number;
}

export interface StollSpreadParams {
  ticks: StollTick[];
  spreadOverride?: number;
}

export interface StollSpreadResult {
  effectiveSpread: number;
  adverseSelectionFraction: number;
  inventoryHoldingFraction: number;
  orderProcessingFraction: number;
  impliedRollSpread: number;
  serialCovariancePrice: number;
  serialCovarianceMidpoint: number;
}
