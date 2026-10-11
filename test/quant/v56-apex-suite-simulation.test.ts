import { describe, it, expect } from 'vitest';
import { computeEkopStructuralPin } from '@/tree/quantlib/microstructure/ekop-structural-pin-engine';
import { computeMrrStructuralSpread } from '@/tree/quantlib/microstructure/mrr-structural-engine';
import { computeChordiaOrderImbalance } from '@/tree/quantlib/microstructure/chordia-imbalance-engine';
import { computeHubermanStanzlManipulation } from '@/tree/quantlib/execution/huberman-stanzl-manipulation-engine';

describe('Triad v56 Apex Multi-Domain Quantitative Suite E2E Simulation', () => {
  it('runs cross-domain pipeline combining PIN, MRR structural spread, Chordia imbalance, and Huberman-Stanzl execution', () => {
    // 1. EKOP PIN Information Risk
    const ekop = computeEkopStructuralPin({
      eventProbability: 0.40,
      badNewsProbability: 0.70,
      informedArrivalRate: 600,
      uninformedBuyRate: 350,
      uninformedSellRate: 350,
    });
    expect(ekop.pin).toBeGreaterThan(0.2);
    expect(ekop.expectedTotalVolume).toBeGreaterThan(0);

    // 2. MRR Structural Order Flow & Adverse Selection
    const adverseTheta = ekop.pin * 0.5;
    const mrr = computeMrrStructuralSpread({
      tradeSigns: [1, 1, 1, -1, 1],
      adverseSelection: adverseTheta,
      orderProcessingCost: 0.08,
      autocorrelation: 0.3,
      midPrice: 150,
    });
    expect(mrr.spread).toBeGreaterThan(0);
    expect(mrr.adverseSelectionShare).toBeGreaterThan(0.5);

    // 3. Chordia-Roll-Subrahmanyam Order Imbalance Dynamics
    const chordia = computeChordiaOrderImbalance({
      buyerVolume: ekop.expectedBuys,
      sellerVolume: ekop.expectedSells,
      returnVolatility: 0.015,
      baselineSpreadBps: mrr.spread * 10,
      imbalanceSensitivity: 5.0,
      reversalCoefficient: 2.0,
    });
    expect(chordia.dynamicSpreadBps).toBeGreaterThan(mrr.spread * 10);
    expect(chordia.expectedReversalBps).toBeDefined();

    // 4. Huberman-Stanzl Non-Arbitrage Execution Trajectory
    const hs = computeHubermanStanzlManipulation({
      tradeTrajectory: [50, 100, 75, -75, -150],
      initialPrice: 150,
      permanentImpactFactor: 0.005,
      transientImpactFactor: 0.008,
      decayRate: 0.7,
    });
    expect(hs.schedule).toHaveLength(5);
    expect(hs.isQuasiArbitrageFree).toBe(true);
    expect(hs.roundTripCost).toBeGreaterThanOrEqual(0);
  });
});
