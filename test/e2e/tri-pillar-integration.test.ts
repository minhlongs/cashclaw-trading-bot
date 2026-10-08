import { describe, it, expect } from 'vitest';
import { FundingRateMonitor } from '@/tree/exchange/arbitrage/funding-monitor';
import { QueuePositionTracker } from '@/tree/exchange/simulator/queue-tracker';
import { calculateOrderBookExecution } from '@/tree/exchange/simulator/slippage-model';
import { runAutonomousSwarmCycle } from '@/forest/research/swarm/autonomous-swarm';
import { computeAnnualizedFundingRate } from '@/tree/exchange/arbitrage/basis-calculator';

describe('Tri-Pillar Synergy End-to-End Integration', () => {
  it('seamlessly executes end-to-end flow across all three pillars', () => {
    // 1. Pillar 1: Multi-Venue Funding Arbitrage Discovery
    const fundingMonitor = new FundingRateMonitor();
    fundingMonitor.recordRate({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      rate: 0.0007, // 0.07%
      annualizedRate: computeAnnualizedFundingRate(0.0007),
      nextFundingTimeMs: 1700000000 + 28800000,
      timestampMs: 1700000000,
    });
    fundingMonitor.recordRate({
      exchange: 'okx',
      symbol: 'BTC/USDT',
      rate: 0.0001, // 0.01%
      annualizedRate: computeAnnualizedFundingRate(0.0001),
      nextFundingTimeMs: 1700000000 + 28800000,
      timestampMs: 1700000000,
    });

    const opps = fundingMonitor.scanOpportunities('BTC/USDT');
    expect(opps.length).toBe(1);
    expect(opps[0].isViable).toBe(true);

    // 2. Pillar 2: L2 Realistic Fill Simulation for the Arbitrage Leg
    const asks = [
      { price: 60000, size: 0.5 },
      { price: 60050, size: 1.5 },
    ];
    const fillResult = calculateOrderBookExecution('buy', 1.0, asks, 60000);
    expect(fillResult.executedPrice).toBeCloseTo(60025, 2);
    expect(fillResult.slippageBps).toBeCloseTo(4.16, 1);

    const queueTracker = new QueuePositionTracker();
    const qPos = queueTracker.registerLimitOrder('arb-leg-limit', 60000, 0.5);
    expect(qPos.isFilled).toBe(false);

    queueTracker.onTrade({
      price: 60000,
      size: 0.6,
      side: 'sell',
      timestampMs: 1700000005,
    });
    expect(queueTracker.getPosition('arb-leg-limit')?.isFilled).toBe(true);

    // 3. Pillar 3: Autonomous Alpha Swarm with Overfitting Defense
    const swarmOutcome = runAutonomousSwarmCycle(
      {
        anomaly: {
          symbol: 'BTC/USDT',
          kind: 'funding_extreme',
          metricValue: 0.0007,
          zScore: 3.5,
          timestampMs: 1700000000,
        },
        cumulativeTrials: 5,
        sampleLength: 300,
      },
      2.4, // Raw Sharpe from backtest
    );

    expect(swarmOutcome.isPromotedToPaper).toBe(true);
    expect(swarmOutcome.targetPhase).toBe('PAPER');
  });
});
