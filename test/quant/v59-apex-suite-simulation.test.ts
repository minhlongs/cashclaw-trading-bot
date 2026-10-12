import { describe, it, expect } from 'vitest';
import { GatheralArbitrageEngine } from '@/tree/quantlib/execution/gatheral-arbitrage-engine';
import { RollImplicitSpreadEngine } from '@/tree/quantlib/microstructure/roll-implicit-spread-engine';
import { KyleObizhaevaInvarianceEngine } from '@/tree/quantlib/microstructure/kyle-obizhaeva-invariance-engine';
import { BiaisLobDynamicsEngine } from '@/tree/quantlib/microstructure/biais-lob-dynamics-engine';
import { RateLimiter } from '@/tree/exchange/rate-limiter/rate-limiter';
import { proposalToScoredAlphas } from '@/forest/research/tradingagents/portfolio-advisor';
import type { PortfolioProposal } from '@/forest/research/tradingagents/portfolio-advisor-types';
import type { ComposedAlpha } from '@/tree/alpha/composition/types';
import { RegimeLabel } from '@/tree/regime/types';

describe('Triad v59 Golden Apex Suite Multi-Domain Simulation', () => {
  it('executes coherent quantitative pipeline across execution and microstructure', () => {
    // 1. Gatheral Transient Impact Arbitrage Check
    const decayCheck = GatheralArbitrageEngine.evaluateDecayKernel({
      decayKernel: 'power-law',
      decayFactor: 1.25,
      characteristicTime: 30,
      initialImpact: 0.02,
    });
    expect(decayCheck.isArbitrageFree).toBe(true);

    // 2. Roll (1984) Implicit Effective Spread
    const priceSeries = [0.05, -0.04, 0.06, -0.05, 0.04, -0.03];
    const rollRes = RollImplicitSpreadEngine.calculateSpread({
      priceChanges: priceSeries,
      referencePrice: 150.0,
    });
    expect(rollRes.rollSpread).toBeGreaterThan(0);
    expect(rollRes.percentageSpread).toBeDefined();

    // 3. Kyle & Obizhaeva Invariance
    const invarianceRes = KyleObizhaevaInvarianceEngine.calculateInvariants({
      price: 150.0,
      averageDailyVolume: 2_500_000,
      annualizedVolatility: 0.45,
    });
    expect(invarianceRes.dollarVolume).toBe(375_000_000);
    expect(invarianceRes.expectedDailyBets).toBeGreaterThan(100);

    // 4. Biais LOB Dynamics
    const lobRes = BiaisLobDynamicsEngine.analyzeTransitions({
      eventSequence: ['market-order', 'market-order', 'limit-at-best', 'cancellation', 'limit-in-spread'],
    });
    expect(lobRes.totalEvents).toBe(5);

    // 5. Modularized RateLimiter Verification
    const limiter = new RateLimiter();
    const acquireRes = limiter.tryAcquire('binance', 'api');
    expect(acquireRes.allowed).toBe(true);

    // 6. Modularized PortfolioAdvisor Proposal Transformation
    const mockProposal: PortfolioProposal = {
      proposalId: 'p1',
      researchGoalId: 'g1',
      assets: [{ asset: 'alpha-1', proposedWeight: 0.5, rationale: 'strong trend' }],
      hedge: 'none',
      rebalance: '1d',
      exposure: 0.5,
      rationale: 'momentum alpha',
      createdAt: new Date().toISOString(),
    };
    const mockAlpha: ComposedAlpha = {
      alphaId: 'alpha-1',
      direction: 'buy',
      confidence: 0.85,
      expectedReturn: 0.015,
      expectedCost: 0.002,
      expectedTurnover: 0.1,
      regime: RegimeLabel.TREND_UP,
      horizon: '1h',
      provenance: 'test',
      featureDependencies: ['momentum'],
      timestamp: Date.now(),
    };
    const scored = proposalToScoredAlphas(mockProposal, [mockAlpha]);
    expect(scored).toHaveLength(1);
    expect(scored[0].score).toBe(0.85);
  });
});
