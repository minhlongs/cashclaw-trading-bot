import { describe, it, expect } from 'vitest';
import { buildRateGraphEdges, type MarketTickerQuote } from '../../src/tree/quantlib/arbitrage/triangular-rate-graph';
import { detectTriangularArbitrage } from '../../src/tree/quantlib/arbitrage/bellman-ford-detector';
import { detectMarketRegime } from '../../src/forest/allocation/bandit/volatility-regime-detector';
import { updateBanditArms, sampleBetaAllocation } from '../../src/forest/allocation/bandit/thompson-sampling-bandit';
import { evaluatePortfolioGreeks } from '../../src/tree/quantlib/greeks/delta-neutral-hedger';
import type { BanditArmState, StrategyPerformanceReward } from '../../src/forest/allocation/bandit/bandit-types';
import type { SyntheticPosition } from '../../src/tree/quantlib/greeks/greeks-types';

describe('E2E Full-Suite v5 Tri-Horizon Synthesis Pipeline', () => {
  it('executes end-to-end: Graph Triangular Arb -> Adaptive Regime MAB -> Synthetic Delta Hedging Desk', () => {
    // -------------------------------------------------------------
    // Horizon 1: Graph-Theoretic Triangular Arbitrage Opportunity Discovery
    // -------------------------------------------------------------
    const quotes: MarketTickerQuote[] = [
      {
        pair: 'BTC/USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        askPrice: 50000,
        bidPrice: 49950,
        askSize: 5.0,
        bidSize: 5.0,
        feeBps: 5,
      },
      {
        pair: 'ETH/BTC',
        baseAsset: 'ETH',
        quoteAsset: 'BTC',
        askPrice: 0.05,
        bidPrice: 0.0499,
        askSize: 80,
        bidSize: 80,
        feeBps: 5,
      },
      {
        pair: 'ETH/USDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
        askPrice: 2605,
        bidPrice: 2600,
        askSize: 40,
        bidSize: 40,
        feeBps: 5,
      },
    ];

    const edges = buildRateGraphEdges(quotes);
    const arbCycle = detectTriangularArbitrage(edges, 'USDT', 15.0);

    expect(arbCycle).not.toBeNull();
    expect(arbCycle?.cycleSymbols).toEqual(['USDT', 'BTC', 'ETH', 'USDT']);
    expect(arbCycle?.netProfitBps).toBeGreaterThan(150); // > 1.5% net profit
    expect(arbCycle?.bottleneckDepth).toBeGreaterThan(0);

    // -------------------------------------------------------------
    // Horizon 2: Adaptive Regime Classification & Bayesian MAB Allocation
    // -------------------------------------------------------------
    // Market displays moderate chop volatility
    const regimeState = detectMarketRegime({ annualizedVolPct: 28.0, vpinToxicity: 0.22 });
    expect(regimeState.regime).toBe('LOW_VOL_CHOP');

    let arms: BanditArmState[] = [
      { strategyId: 'grid_btc', alpha: 3.0, beta: 1.0 },
      { strategyId: 'volatility_dca_eth', alpha: 2.0, beta: 2.0 },
      { strategyId: 'statarb_sol', alpha: 1.0, beta: 3.0 },
    ];

    const performanceRewards: StrategyPerformanceReward[] = [
      { strategyId: 'grid_btc', sortinoRatio: 3.2, maxDrawdownPct: 0.015, winRatePct: 75 },
      { strategyId: 'volatility_dca_eth', sortinoRatio: 1.1, maxDrawdownPct: 0.06, winRatePct: 52 },
      { strategyId: 'statarb_sol', sortinoRatio: -0.5, maxDrawdownPct: 0.09, winRatePct: 40 },
    ];

    arms = updateBanditArms(arms, performanceRewards);
    const allocations = sampleBetaAllocation(arms, regimeState.regime, [0.5, 0.5, 0.5], 5.0);

    expect(allocations).toHaveLength(3);
    const sumWeights = allocations.reduce((sum, a) => sum + a.targetWeightPct, 0);
    expect(sumWeights).toBeCloseTo(100.0, 1);

    // Grid strategy receives highest weight in LOW_VOL_CHOP regime
    const gridAlloc = allocations.find((a) => a.strategyId === 'grid_btc')?.targetWeightPct ?? 0;
    const statArbAlloc = allocations.find((a) => a.strategyId === 'statarb_sol')?.targetWeightPct ?? 0;
    expect(gridAlloc).toBeGreaterThan(statArbAlloc);

    // -------------------------------------------------------------
    // Horizon 3: Synthetic Greeks Evaluation & Delta Drift Auto-Hedging
    // -------------------------------------------------------------
    const activePositions: SyntheticPosition[] = [
      {
        symbol: 'BTC/USDT',
        notionalQuantity: 1.5, // 1.5 BTC Long spot/perp (+1.5 delta)
        isPerpOrSpot: true,
        spotPrice: 60000,
        impliedVol: 0.55,
      },
      {
        symbol: 'BTC-60000-CALL',
        notionalQuantity: -1.0, // Short 1x ATM Call (delta ~ -0.53)
        isPerpOrSpot: false,
        optionType: 'call',
        spotPrice: 60000,
        strikePrice: 60000,
        timeToExpiryYears: 14 / 365,
        impliedVol: 0.55,
      },
    ];

    const greeksSummary = evaluatePortfolioGreeks(activePositions, 0.05);

    expect(greeksSummary.netDelta).toBeGreaterThan(0.8);
    expect(greeksSummary.requiresHedging).toBe(true);
    expect(greeksSummary.suggestedHedgeQuantity).toBeCloseTo(-greeksSummary.netDelta, 3);
  });
});
