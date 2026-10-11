export interface PaganoMarketVenue {
  readonly venueId: string;
  readonly traderCount: number;
}

export interface PaganoMarketThinnessParams {
  readonly venues: readonly PaganoMarketVenue[];
  readonly assetVolatility: number;
  readonly riskAversion: number;
  readonly fixedCostPerTrade?: number;
}

export interface PaganoMarketThinnessResult {
  readonly venueCosts: readonly { readonly venueId: string; readonly transactionCost: number; readonly share: number }[];
  readonly dominantVenueId: string;
  readonly herfindahlIndex: number;
  readonly isConcentrated: boolean;
}
