export interface HoStollQuote {
  readonly inventory: number;
  readonly reservationPrice: number;
  readonly optimalBid: number;
  readonly optimalAsk: number;
  readonly halfSpread: number;
  readonly fullSpread: number;
  readonly inventorySkew: number;
}

export interface HoStollParams {
  readonly midPrice: number;
  readonly inventories: readonly number[];
  readonly riskAversion?: number;
  readonly volatility?: number;
  readonly timeHorizon?: number;
  readonly arrivalIntensity?: number;
}

export interface HoStollResult {
  readonly quotes: readonly HoStollQuote[];
  readonly averageSpread: number;
  readonly baseSpread: number;
  readonly reservationPriceShiftPerUnit: number;
}
