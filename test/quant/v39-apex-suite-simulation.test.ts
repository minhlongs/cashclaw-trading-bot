import { describe, it, expect, vi } from 'vitest';
import { computeLorenzAlmgrenExecution } from '@/tree/quantlib/execution/lorenz-almgren-engine';
import { computeCopelandGalaiSpread } from '@/tree/quantlib/microstructure/copeland-galai-engine';
import { extractGridConfig } from '@/forest/api/handlers/bot-detail-types';
import type { BotConfig } from '@/tree/bot';

describe('Triad v39 Apex Multi-Domain Suite Cross-Domain Simulation', () => {
  it('combines Copeland-Galai spread microstructure with Lorenz-Almgren adaptive execution and bot detail modularization', async () => {
    // 1. Dealer sets bid-ask quotes under informed order flow risk
    const spreadResult = computeCopelandGalaiSpread({
      assetPrice: 150.0,
      volatility: 0.35,
      timeToQuoteExpirySec: 60,
      informedTraderFraction: 0.25,
      orderHandlingCost: 0.05,
    });

    expect(spreadResult.equilibriumSpread).toBeGreaterThan(0);
    expect(spreadResult.optimalBid).toBeLessThan(150.0);
    expect(spreadResult.optimalAsk).toBeGreaterThan(150.0);

    // 2. Liquidator uses Lorenz-Almgren mean-variance optimal adaptive schedule
    const execResult = computeLorenzAlmgrenExecution({
      initialShares: 500,
      initialPrice: spreadResult.optimalBid,
      numSteps: 5,
      timeHorizon: 0.5,
      volatility: 0.35,
      riskAversion: 1e-4,
      temporaryImpact: 0.02,
      priceDriftSensitivity: 0.3,
    });

    expect(execResult.trajectory.length).toBe(5);
    expect(execResult.terminalShares).toBe(0);
    expect(execResult.vwapPrice).toBeGreaterThan(0);
    expect(execResult.totalExecutionCost).toBeGreaterThanOrEqual(0);

    // 3. Verify bot configuration extraction helper
    const gridConfig: BotConfig = {
      name: 'GridTrader',
      strategy: 'grid',
      symbol: 'BTC/USDT',
      capital: 10000,
      exchange: 'paper',
      mode: 'paper',
      maxDrawdownPct: 10,
      gridSpacingPct: 1.5,
      gridLevels: 8,
      capitalPerLevelPct: 12.5,
      takeProfitPct: 3.0,
      stopLossPct: 6.0,
      rebalanceOnFill: true,
    } as unknown as BotConfig;

    const extracted = extractGridConfig(gridConfig);
    expect(extracted).toBeDefined();
    expect(extracted?.gridLevels).toBe(8);
    expect(extracted?.gridSpacingPct).toBe(1.5);
    expect(extracted?.rebalanceOnFill).toBe(true);

    const nonGridConfig: BotConfig = {
      name: 'MomentumTrader',
      strategy: 'momentum',
      symbol: 'BTC/USDT',
      capital: 5000,
      exchange: 'paper',
      mode: 'paper',
      maxDrawdownPct: 10,
    } as unknown as BotConfig;
    expect(extractGridConfig(nonGridConfig)).toBeUndefined();
  });
});
