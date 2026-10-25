export function computePaganoMarketThinness(p: PaganoMarketThinnessParams): PaganoMarketThinnessResult {
  const totalTraders = p.venues.reduce((acc, v) => acc + Math.max(0, v.traderCount), 0);
  const c0 = Math.max(0, p.fixedCostPerTrade ?? 0), gamma = Math.max(1e-4, p.riskAversion);
  const vol2 = Math.pow(Math.max(1e-4, p.assetVolatility), 2);
  let maxShare = -1, dominantId = p.venues[0]?.venueId ?? '', hhi = 0;
  const venueCosts = p.venues.map((v) => {
    const count = Math.max(1, v.traderCount);
    const share = totalTraders > 0 ? v.traderCount / totalTraders : 0;
    const cost = (gamma * vol2) / count + c0;
    if (share > maxShare) { maxShare = share; dominantId = v.venueId; }
    hhi += Math.pow(share, 2);
    return { venueId: v.venueId, transactionCost: cost, share };
  });
  return { venueCosts, dominantVenueId: dominantId, herfindahlIndex: hhi, isConcentrated: maxShare >= 0.70 || hhi >= 0.50 };
}

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
