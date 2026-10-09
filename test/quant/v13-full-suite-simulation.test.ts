import { describe, it, expect } from 'vitest';
import { ContStoikovLOBQueueEngine } from '../../src/tree/quantlib/microstructure/cont-stoikov-lob-queue';
import type { LOBQueueSnapshot } from '../../src/tree/quantlib/microstructure/cont-stoikov-lob-types';
import { DeliberationReflexiveLoop } from '../../src/forest/research/tradingagents/deliberation-reflexive-loop';
import type { FactorOOSResult, AgentBeliefPrior } from '../../src/forest/research/tradingagents/deliberation-reflexive-types';
import { ExecutionOmsWaterfall } from '../../src/tree/execution/oms/execution-oms-waterfall';
import type { InboundOrder } from '../../src/tree/execution/oms/execution-oms-types';
import { computeBatchEdgeAttribution } from '../../src/tree/alpha/observability/attribution';
import { validateAlignment } from '../../src/tree/alpha/data-quality/validate-alignment';
import type { Candle } from '../../src/tree/alpha/data-quality/types';

describe('v13 Full Architecture Triad & Quantitative Simulation', () => {
  it('executes cohesive v13 end-to-end multi-pillar workflow', () => {
    // 1. Pillar 1: Cont-Stoikov LOB Queue Dynamics & Micro-Price
    const queueEngine = new ContStoikovLOBQueueEngine();
    const snapshot: LOBQueueSnapshot = {
      bestBid: 100.0,
      bestAsk: 100.2,
      bidVolume: 250,
      askVolume: 50,
      queuePosition: 10,
      totalLevelVolume: 100,
      marketArrivalRate: 15,
      cancelRate: 5,
    };
    const queueResult = queueEngine.calculateQueueDynamics(snapshot);

    expect(queueResult.midPrice).toBe(100.1);
    expect(queueResult.microPrice).toBeGreaterThan(queueResult.midPrice);
    expect(queueResult.orderFlowImbalance).toBeCloseTo(0.6667, 3);
    expect(queueResult.fillProbability).toBeGreaterThan(0.6);
    expect(queueResult.isDepletionLikely).toBe(true);

    // 2. Pillar 2: Closed-Loop Reflexive Alpha Deliberation
    const reflexiveLoop = new DeliberationReflexiveLoop();
    const priors: AgentBeliefPrior[] = [
      {
        featureKey: 'CONT_STOIKOV_OFI',
        confidenceScore: 0.5,
        sampleCount: 1,
        isQuarantined: false,
        feedbackNotes: ['Initial prior'],
      },
      {
        featureKey: 'OVERFIT_NOISE_ALPHA',
        confidenceScore: 0.25,
        sampleCount: 3,
        isQuarantined: false,
        feedbackNotes: ['Decaying prior'],
      },
    ];

    const oosFeedbacks: FactorOOSResult[] = [
      {
        factorName: 'CONT_STOIKOV_OFI',
        icMean: 0.082,
        irRatio: 1.65,
        quantileSpread: 0.041,
        verdict: 'PAPER_CANDIDATE',
      },
      {
        factorName: 'OVERFIT_NOISE_ALPHA',
        icMean: -0.075,
        irRatio: -1.1,
        quantileSpread: -0.03,
        verdict: 'KILLED',
      },
    ];

    const updatedPriors = reflexiveLoop.updateBeliefPriors(priors, oosFeedbacks);
    expect(updatedPriors).toHaveLength(2);

    const ofiPrior = updatedPriors.find((p) => p.featureKey === 'CONT_STOIKOV_OFI');
    const noisePrior = updatedPriors.find((p) => p.featureKey === 'OVERFIT_NOISE_ALPHA');

    expect(ofiPrior?.confidenceScore).toBeGreaterThan(0.7);
    expect(ofiPrior?.isQuarantined).toBe(false);
    expect(noisePrior?.isQuarantined).toBe(true);

    const debateGuidance = reflexiveLoop.generateDebateGuidance(updatedPriors);
    expect(debateGuidance.boostFactors).toContain('CONT_STOIKOV_OFI');
    expect(debateGuidance.quarantinedFactors).toContain('OVERFIT_NOISE_ALPHA');
    expect(debateGuidance.summaryPromptGuidance).toContain('CONT_STOIKOV_OFI');

    // 3. Pillar 3: Modularized OMS Execution & Observability Pipeline
    const waterfall = new ExecutionOmsWaterfall({
      enableDarkMesh: false,
      enableUrgencyGuard: true,
      enableSlicing: true,
      slicingThresholdQty: 5.0,
      maxSlices: 3,
    });

    const inboundOrder: InboundOrder = {
      orderId: 'ORD-V13-TEST',
      strategyId: 'ALPHA-MICRO-OFI',
      symbol: 'BTC/USDT',
      side: 'BUY',
      quantity: 12.0,
      timestamp: 1700000000000,
    };

    const omsResult = waterfall.processOrder(inboundOrder, queueResult.microPrice);
    expect(omsResult.state).toBe('ROUTING');
    expect(omsResult.slices.length).toBe(3);
    expect(omsResult.routedQuantity).toBeCloseTo(12.0, 4);

    // Edge Attribution & Data Quality Verification
    const edgeBatch = computeBatchEdgeAttribution([
      {
        alphaId: 'ALPHA-MICRO-OFI',
        expectedReturn: 0.012,
        expectedCost: 0.002,
        entryPrice: 100.1,
        exitPrice: 101.5,
        side: 'buy',
        feePct: 0.001,
      },
    ]);
    expect(edgeBatch.count).toBe(1);
    expect(edgeBatch.meanDeltaEdge).toBeGreaterThan(0);

    const sampleCandles: Candle[] = [
      { timestamp: 1000, open: 100, high: 101, low: 99, close: 100.5, volume: 50 },
      { timestamp: 2000, open: 100.5, high: 102, low: 100, close: 101.5, volume: 60 },
    ];
    const alignCheck = validateAlignment(sampleCandles, sampleCandles);
    expect(alignCheck.passed).toBe(true);
  });
});
