import { describe, it, expect } from 'vitest';
import { computePaganoMarketThinness } from '@/tree/quantlib/microstructure/pagano-market-thinness-engine';

describe('Pagano (1989) Market Thinness & Concentration Engine', () => {
  it('detects concentration when one venue attracts dominant trader count', () => {
    const res = computePaganoMarketThinness({
      venues: [
        { venueId: 'primary-binance', traderCount: 850 },
        { venueId: 'secondary-venue', traderCount: 150 },
      ],
      assetVolatility: 0.02,
      riskAversion: 1.5,
      fixedCostPerTrade: 0.05,
    });
    expect(res.dominantVenueId).toBe('primary-binance');
    expect(res.isConcentrated).toBe(true);
    expect(res.venueCosts[0]!.transactionCost).toBeLessThan(res.venueCosts[1]!.transactionCost);
  });
});
