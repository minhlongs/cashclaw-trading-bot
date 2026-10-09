import { describe, it, expect } from 'vitest';
import { computeBertsimasHummelExecution } from '@/tree/quantlib/execution/bertsimas-hummel-engine';
import { computeKyleCrossAssetImpact } from '@/tree/quantlib/microstructure/kyle-cross-asset-engine';
import { BotManager, getBotManager, resetBotManager } from '@/tree/bot/bot-manager';
import { CANNED_RESPONSES, detectRole, DeterministicFixtureProvider } from '@/forest/research/tradingagents/test-fixtures';

describe('Triad v30 Apex Suite Cross-Domain Simulation & Architecture E2E', () => {
  it('orchestrates dynamic execution alongside multi-asset cross-impact and modular bot manager', async () => {
    // 1. Bertsimas-Hummel Dynamic Execution under Decay
    const execution = computeBertsimasHummelExecution({
      totalShares: 5000,
      timeHorizon: 0.5,
      numSteps: 5,
      impactParam: 0.02,
      alphaSignal: 0.05,
      alphaDecay: 0.8,
      signalSensitivity: 1.2,
      riskAversion: 0.005,
    });
    expect(execution.terminalShares).toBe(0);
    expect(execution.trajectory.length).toBe(5);

    // 2. Kyle-Caballe-Krishnan Multi-Asset Microstructure
    const microstructure = computeKyleCrossAssetImpact({
      assets: ['BTC', 'ETH'],
      assetVariances: [0.05, 0.08],
      crossAssetCorrelation: 0.7,
      noiseVolatilities: [100, 90],
      orderFlows: [execution.trajectory[0]!.tradeSize, 10],
    });
    expect(microstructure.priceImpacts.length).toBe(2);
    expect(microstructure.totalAdverseSelectionCost).toBeGreaterThan(0);

    // 3. Modular BotManager Facade & Singleton Verification
    resetBotManager();
    const mgr1 = getBotManager();
    const mgr2 = getBotManager();
    expect(mgr1).toBe(mgr2);
    expect(mgr1 instanceof BotManager).toBe(true);

    const bots = await mgr1.getAllBots();
    expect(Array.isArray(bots)).toBe(true);
    resetBotManager();

    // 4. Modular TradingAgents Test Fixtures Verification
    expect(detectRole('bull researcher stance')).toBe('bull-researcher');
    expect(CANNED_RESPONSES['bull-researcher']).toBeDefined();
    const fixtureProvider = new DeterministicFixtureProvider();
    const callRes = await fixtureProvider.call({ systemPrompt: 'bull researcher analysis', prompt: 'evaluate' });
    expect(callRes.text).toContain('Momentum persists');
  });
});
