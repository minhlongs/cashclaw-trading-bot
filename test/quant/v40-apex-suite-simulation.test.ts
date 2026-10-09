import { describe, it, expect } from 'vitest';
import { computeCarteaJaimungalExecution } from '@/tree/quantlib/execution/cartea-jaimungal-engine';
import { computeRollSpread } from '@/tree/quantlib/microstructure/roll-spread-engine';
import { reportFromTrades, computeSortino, median, computeMaxDrawdown } from '@/forest/alpha/evaluation/report-helpers';
import { SettingsSchema, maskSecret } from '@/app/api/settings/schema';
import type { BacktestTrade } from '@/forest/backtest/types';
import { RegimeLabel } from '@/tree/regime/types';

describe('Triad v40 Apex Multi-Domain Suite Cross-Domain Simulation', () => {
  it('integrates microstructure spread, optimal execution, and modular evaluation reporting', () => {
    // 1. Roll (1984) spread measurement from bouncing price series
    const prices = [50.0, 50.5, 49.8, 50.4, 49.9, 50.3, 49.9, 50.2];
    const rollRes = computeRollSpread({ priceSeries: prices, tickSize: 0.001 });
    expect(rollRes.numObservations).toBe(8);

    // 2. Cartea-Jaimungal (2014) execution with alpha drift informed by market microstructure
    const execRes = computeCarteaJaimungalExecution({
      initialShares: 500,
      initialPrice: prices[prices.length - 1],
      numSteps: 5,
      timeHorizon: 0.5,
      inventoryPenalty: 2e-4,
      temporaryImpact: 5e-4,
      alphaDrift: -0.01, // mild downward drift
    });
    expect(execRes.trajectory.length).toBe(5);
    expect(execRes.terminalShares).toBe(0);

    // 3. Modular evaluation report calculation
    const dummyTrades: BacktestTrade[] = [
      { entryTimestamp: 1000, exitTimestamp: 2000, side: 'buy', entryPrice: 50, exitPrice: 52, quantity: 1, pnl: 2, fee: 0.01, pnlPct: 4, holdingMinutes: 16.6 },
      { entryTimestamp: 2500, exitTimestamp: 3000, side: 'sell', entryPrice: 52, exitPrice: 51, quantity: 1, pnl: -1, fee: 0.01, pnlPct: -1.9, holdingMinutes: 8.3 },
    ];
    const report = reportFromTrades(dummyTrades, 'exp-40', 'BTCUSDT', '1m', RegimeLabel.RANGE);
    expect(report.numTrades).toBe(2);
    expect(report.netPnl).toBe(1);
    expect(report.winRate).toBe(0.5);
    expect(median([1, 2, 3])).toBe(2);
    expect(computeMaxDrawdown(dummyTrades)).toBe(1);
    expect(computeSortino([2, -1])).toBeGreaterThan(0);

    // 4. Settings schema and secret masking
    expect(maskSecret('abcdef123456')).toBe('ab••••56');
    const parseRes = SettingsSchema.safeParse({
      type: 'exchange',
      exchange: 'binance',
      apiKey: 'key123',
      apiSecret: 'secret456',
      testnet: true,
    });
    expect(parseRes.success).toBe(true);
  });
});
