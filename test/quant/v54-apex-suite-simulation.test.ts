import { describe, it, expect } from 'vitest';
import { computeKissellGlantzExecution } from '../../src/tree/quantlib/execution/kissell-glantz-engine';
import { computeGlostenMilgromSpread } from '../../src/tree/quantlib/microstructure/glosten-milgrom-engine';
import { updateTrailingLevels, findTrailingExits } from '../../src/tree/bot/strategies/grid-levels-trailing';
import { DashboardStateTracker } from '../../src/forest/alpha/dashboard/state-tracker';
import { RegimeLabel } from '../../src/tree/regime/types';
import type { GridLevel } from '../../src/tree/bot/types';

describe('Triad v54 Apex Suite Simulation: Execution, Microstructure, Strategy, & Observability', () => {
  it('integrates pre-trade scheduling, adverse selection spreads, trailing stops, and dashboard tracking', () => {
    // 1. Pillar 1: Pre-trade institutional optimal frontier execution
    const execRes = computeKissellGlantzExecution({
      totalShares: 5_000,
      initialPrice: 200,
      adv: 50_000,
      volatility: 0.025,
      riskAversion: 0.1,
      numBuckets: 4,
    });
    expect(execRes.schedule).toHaveLength(4);
    expect(execRes.totalExecutionCost).toBeGreaterThan(0);
    expect(execRes.implementationShortfallBps).toBeGreaterThan(0);

    // 2. Pillar 2: Microstructure sequential trading under adverse selection
    const microRes = computeGlostenMilgromSpread({
      vLow: 190,
      vHigh: 210,
      priorHighProb: 0.5,
      informedProb: 0.25,
      tradeSequence: ['buy', 'buy', 'sell'],
    });
    expect(microRes.quotes).toHaveLength(3);
    expect(microRes.averageSpread).toBeGreaterThan(0);
    expect(microRes.adverseSelectionBps).toBeGreaterThan(0);

    // 3. Pillar 3: Trailing grid level stop management and ratcheting
    const testLevels: GridLevel[] = [
      {
        level: 1,
        triggerPrice: 200,
        quantity: 1,
        takeProfitPrice: 210,
        stopLossPrice: 190,
        orderId: 'ord-1',
        price: 200,
        side: 'buy',
        status: 'filled',
        filledPrice: 200,
      },
    ];
    // Seed trailing
    updateTrailingLevels(testLevels, 205, 5, 2);
    expect(testLevels[0]!.trailingActive).toBe(true);
    expect(testLevels[0]!.trailingSkipExit).toBe(true);

    // Ratchet up with higher price
    updateTrailingLevels(testLevels, 210, 5, 2);
    expect(testLevels[0]!.currentTpPrice).toBe(200 + 200 * 0.05);

    // Initial check clears skip exit
    const skipCheck = findTrailingExits(testLevels, 210);
    expect(skipCheck).toHaveLength(0);
    expect(testLevels[0]!.trailingSkipExit).toBe(false);

    // Subsequent tick exits on take-profit
    const closes = findTrailingExits(testLevels, 215);
    expect(closes).toHaveLength(1);
    expect(closes[0]!.reason).toBe('take-profit');

    // 4. Pillar 3: Dashboard state tracking
    const tracker = new DashboardStateTracker();
    const snap = tracker.update(
      { label: RegimeLabel.TREND_UP, confidence: 0.85, timestamp: 1_700_000_000 },
      [],
      [],
      { totalPnl: 1500, sharpeRatio: 2.1, maxDrawdown: 3.5, winRate: 0.65, tradeCount: 10, avgDuration: 3600 },
    );

    expect(snap.currentRegime).toBe(RegimeLabel.TREND_UP);
    expect(snap.regimeConfidence).toBe(0.85);
    expect(tracker.getPerformanceTimeSeries()).toHaveLength(1);
    expect(tracker.getPerformanceTimeSeries()[0]!.value).toBe(2.1);
  });
});
