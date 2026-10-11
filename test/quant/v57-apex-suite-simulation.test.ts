import { describe, it, expect } from 'vitest';
import { computeGarmanDealerInventory } from '@/tree/quantlib/microstructure/garman-dealer-inventory-engine';
import { computePaganoMarketThinness } from '@/tree/quantlib/microstructure/pagano-market-thinness-engine';
import { computeHasbrouckTradeImpact } from '@/tree/quantlib/microstructure/hasbrouck-trade-impact-engine';
import { computeAlmgrenRiskPenalty } from '@/tree/quantlib/execution/almgren-risk-penalty-engine';

describe('Triad v57 Apex Multi-Domain Quantitative Suite E2E Simulation', () => {
  it('combines Garman inventory, Pagano thinness, Hasbrouck impact, and Almgren risk liquidation', () => {
    // 1. Pagano Market Venue Thinness
    const pagano = computePaganoMarketThinness({
      venues: [
        { venueId: 'primary-exchange', traderCount: 1200 },
        { venueId: 'alternative-dex', traderCount: 300 },
      ],
      assetVolatility: 0.025,
      riskAversion: 2.0,
      fixedCostPerTrade: 0.01,
    });
    expect(pagano.isConcentrated).toBe(true);

    // 2. Garman Dealer Inventory Quoting
    const garman = computeGarmanDealerInventory({
      initialInventory: 200,
      buyerArrivalRate: 15,
      sellerArrivalRate: 20,
      baseSpread: 1.5,
      inventorySensitivity: 0.005,
      referencePrice: 250,
    });
    expect(garman.effectiveSpread).toBeCloseTo(1.5, 4);

    // 3. Hasbrouck VAR Trade Impact
    const hasbrouck = computeHasbrouckTradeImpact({
      tradeInnovations: [garman.inventoryDrift, -1.0, 2.5, -0.5, 3.0],
      returns: [0.0015, -0.0008, 0.0022, -0.0004, 0.003],
    });
    expect(hasbrouck.permanentImpact).toBeGreaterThan(0);

    // 4. Almgren Risk-Penalty Liquidation
    const almgren = computeAlmgrenRiskPenalty({
      totalShares: 500,
      horizonSteps: 5,
      volatility: pagano.venueCosts[0]!.transactionCost,
      riskAversion: 0.05,
      temporaryImpactEta: hasbrouck.permanentImpact * 0.1,
    });
    expect(almgren.trajectory).toHaveLength(6);
    expect(almgren.totalPenaltyCost).toBeGreaterThan(0);
  });
});
