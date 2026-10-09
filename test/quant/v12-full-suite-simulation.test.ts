import { describe, it, expect } from 'vitest';
import { KyleAdverseSelectionEngine } from '../../src/tree/quantlib/microstructure/kyle-adverse-selection-engine';
import { calculateAdaptiveVolumeSlices } from '../../src/tree/execution/oms/adaptive-volume-slicer';
import { VectorizedOrthogonalizer } from '../../src/tree/research/vectorized/vectorized-orthogonalizer';
import { BlackLittermanEngine } from '../../src/tree/quantlib/portfolio/black-litterman-engine';
import { SlippageAttributionLedger } from '../../src/tree/execution/attribution/slippage-attribution-ledger';
import type { SignedOrderFlowTrade } from '../../src/tree/quantlib/microstructure/kyle-adverse-selection-types';
import type { AssetMarketPrior, QualitativeAgentView } from '../../src/tree/quantlib/portfolio/black-litterman-types';
import type { ExecutionFillRecord } from '../../src/tree/execution/attribution/slippage-attribution-types';

describe('v12 Full Architecture Triad & Quantitative Simulation', () => {
  it('executes cohesive v12 end-to-end multi-pillar workflow', () => {
    // 1. Pillar 1: Kyle-Back Adverse Selection & Adaptive Volume Slicing
    const kyleEngine = new KyleAdverseSelectionEngine();
    const trades: SignedOrderFlowTrade[] = [
      { timestamp: 1000, price: 3000.0, quantity: 5, side: 'BUY' },
      { timestamp: 2000, price: 3001.0, quantity: 8, side: 'BUY' },
      { timestamp: 3000, price: 3002.5, quantity: 12, side: 'BUY' },
      { timestamp: 4000, price: 3001.5, quantity: 6, side: 'SELL' },
      { timestamp: 5000, price: 3003.0, quantity: 10, side: 'BUY' },
    ];
    const kyleResult = kyleEngine.estimateLambda(trades);
    expect(kyleResult.lambda).toBeGreaterThan(0);
    expect(kyleResult.adverseSelectionRisk).toBe('CRITICAL');

    const adaptiveSlices = calculateAdaptiveVolumeSlices({
      totalQuantity: 20,
      sliceCount: 4,
    });
    expect(adaptiveSlices).toHaveLength(4);
    const totalSliced = adaptiveSlices.reduce((sum, s) => sum + s.targetQuantity, 0);
    expect(totalSliced).toBeCloseTo(20, 4);

    // 2. Pillar 2: Factor Orthogonalization & Bayesian Black-Litterman Portfolio
    const orthogonalizer = new VectorizedOrthogonalizer();
    const alphaSeries = [
      { name: 'ALPHA_MOMENTUM', data: new Float64Array([1.2, 2.1, 3.0, 4.2, 5.1]) },
      { name: 'ALPHA_VALUE', data: new Float64Array([2.4, 4.2, 6.1, 8.4, 10.3]) },
    ];
    const orthoAlphas = orthogonalizer.orthogonalizeGramSchmidt(alphaSeries);
    expect(orthoAlphas).toHaveLength(2);

    const blEngine = new BlackLittermanEngine();
    const marketPriors: AssetMarketPrior[] = [
      { symbol: 'BTC', marketWeight: 0.7, equilibriumReturn: 0.10, variance: 0.05 },
      { symbol: 'ETH', marketWeight: 0.3, equilibriumReturn: 0.08, variance: 0.08 },
    ];
    const agentViews: QualitativeAgentView[] = [
      { symbol: 'ETH', expectedReturn: 0.16, confidence: 0.75, viewDescription: 'Layer2 Scaling Surge' },
    ];
    const blResult = blEngine.computePosteriorWeights(marketPriors, agentViews);
    expect(blResult.assets).toHaveLength(2);
    const ethAlloc = blResult.assets.find((a) => a.symbol === 'ETH');
    expect(ethAlloc?.posteriorReturn).toBeGreaterThan(0.08);

    // 3. Pillar 3: Post-Trade Slippage Attribution Ledger
    const attributionLedger = new SlippageAttributionLedger();
    const arrivalPrice = 3000.0;
    const executionFills: ExecutionFillRecord[] = adaptiveSlices.map((s, idx) => ({
      sliceIndex: s.sliceIndex,
      arrivalPrice,
      executionPrice: arrivalPrice + idx * 0.4,
      quantity: s.targetQuantity,
      venue: 'binance',
      timestamp: 1000 + idx * 1000,
    }));
    const attribution = attributionLedger.attributeExecutionSlippage(
      'ORDER-V12-TRIAD',
      arrivalPrice,
      executionFills
    );
    expect(attribution.totalExecutedQuantity).toBeCloseTo(20, 4);
    expect(attribution.totalSlippageBps).toBeGreaterThan(0);
    expect(attribution.halfSpreadBps).toBe(2.5);
  });
});
