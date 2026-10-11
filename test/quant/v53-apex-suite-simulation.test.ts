import { describe, expect, it, vi } from 'vitest';
import { executeEngleFerstenbergExecution } from '@/tree/quantlib/execution/engle-ferstenberg-engine';
import { computeHoStollQuotes } from '@/tree/quantlib/microstructure/ho-stoll-engine';
import { Killswitch } from '@/tree/bot/killswitch';
import { evaluateObservability } from '@/forest/alpha/observability-eval/evaluate';
import type { FeatureSnapshotHash } from '@/tree/alpha/observability/types';
import { RegimeLabel } from '@/tree/regime/types';

describe('Triad v53 Apex Multi-Domain Quantitative & Architecture Suite Simulation', () => {
  it('integrates Engle-Ferstenberg execution schedule with Ho-Stoll quotes, Killswitch circuit breaker, and Observability eval', () => {
    // 1. Dealer quotes from Ho-Stoll
    const dealerQuotes = computeHoStollQuotes({
      midPrice: 150,
      inventories: [-2, 0, 2],
      riskAversion: 0.15,
      volatility: 0.025,
      timeHorizon: 0.5,
    });
    expect(dealerQuotes.quotes).toHaveLength(3);
    const midAsk = dealerQuotes.quotes.find((q) => q.inventory === 0)?.optimalAsk ?? 150.5;

    // 2. Portfolio execution schedule from Engle-Ferstenberg against dealer ask
    const exec = executeEngleFerstenbergExecution({
      totalShares: 1_000,
      initialPrice: midAsk,
      numBuckets: 4,
      riskAversion: 0.1,
      volatility: 0.03,
      marketVolume: 20_000,
    });
    expect(exec.schedule).toHaveLength(4);
    expect(exec.totalExecutionCost).toBeGreaterThan(0);

    // 3. Killswitch handles execution fills and halts on excessive loss
    const onHalt = vi.fn();
    const onDailyStateChange = vi.fn();
    const ks = new Killswitch({
      onHalt,
      onResume: vi.fn(),
      onDailyStateChange,
      onError: vi.fn(),
      onOrderPlaced: vi.fn(),
      onOrderFilled: vi.fn(),
    }, {
      maxDailyLossPct: 5,
      maxConsecutiveLosses: 3,
    }, false);

    ks.registerBot('bot-v53', 10_000);
    expect(ks.isTradingEnabled()).toBe(true);

    // Order 1: small positive pnl
    ks.onOrderFilled({ id: 'ord-1', pnl: 50 });
    expect(ks.isHalted()).toBe(false);

    // Order 2: massive loss exceeding 5% of 10,000 peak capital ($500)
    ks.onOrderFilled({ id: 'ord-2', pnl: -600 });
    expect(ks.isHalted()).toBe(true);
    expect(onHalt).toHaveBeenCalledWith(expect.stringContaining('Daily loss limit exceeded'));
    expect(ks.isTradingEnabled()).toBe(false);

    // 4. Observability eval runs and produces verified report
    const obsReport = evaluateObservability({
      alphaDecisions: [{
        alphaId: 'alpha-v53',
        symbol: 'BTC/USDT',
        direction: 'buy',
        confidence: 0.85,
        expectedReturn: 0.05,
        expectedCost: 0.001,
        expectedTurnover: 0.1,
        regime: RegimeLabel.TREND_UP,
        horizon: '1h',
        featureSnapshotHash: 'a'.repeat(64) as FeatureSnapshotHash,
        featureDependencies: ['volatility', 'vpin'],
        timestamp: Date.now() - 1000,
      }],
      portfolioDecisions: [{
        targetWeights: { 'BTC/USDT': 0.1 },
        grossExposure: 0.8,
        netExposure: 0.2,
        volTargetingScale: 1.0,
        activeRiskOverlayAdjustments: ['dampen'],
        timestamp: Date.now() - 500,
      }],
      shadowOrders: [],
      shadowFills: [],
      operationalTelemetry: [{
        decisionLatencyMs: 15,
        dataFreshnessMs: 50,
        timestamp: Date.now(),
        providerProvenance: {
          primaryProvider: 'binance',
          activeProvider: 'binance',
          usedFallback: false,
          fallbackAttempts: 0,
        },
      }],
    });

    expect(obsReport.sampleCounts.alphaDecisions).toBe(1);
    expect(obsReport.sampleCounts.portfolioDecisions).toBe(1);
    expect(obsReport.portfolioDiagnostics.activeRiskOverlayTriggers.dampen).toBe(1);
    expect(obsReport.systemHealth.overallStatus).toBeDefined();
  });
});
