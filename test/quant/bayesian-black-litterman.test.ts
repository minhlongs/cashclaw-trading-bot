import { describe, it, expect } from 'vitest';
import { VectorizedOrthogonalizer } from '../../src/tree/research/vectorized/vectorized-orthogonalizer';
import {
  BlackLittermanEngine,
  type AssetMarketPrior,
  type QualitativeAgentView,
} from '../../src/tree/quantlib/portfolio/black-litterman-engine';

describe('Phase 02: Bayesian Black-Litterman & Factor Orthogonalization', () => {
  it('orthogonalizes factor series removing collinearity', () => {
    const orthogonalizer = new VectorizedOrthogonalizer();

    const f1 = {
      name: 'MOMENTUM',
      data: new Float64Array([1, 2, 3, 4, 5]),
    };
    // f2 has high collinearity with f1 plus small deviation
    const f2 = {
      name: 'TREND_COPIER',
      data: new Float64Array([2, 4, 6, 8, 9.5]),
    };

    const ortho = orthogonalizer.orthogonalizeGramSchmidt([f1, f2]);
    expect(ortho).toHaveLength(2);
    expect(ortho[0]!.name).toBe('MOMENTUM_ORTHO');
    expect(ortho[1]!.name).toBe('TREND_COPIER_ORTHO');

    // Inner product of orthogonalized series should be ~ 0
    let dot = 0;
    for (let i = 0; i < 5; i++) {
      dot += ortho[0]!.data[i]! * ortho[1]!.data[i]!;
    }
    expect(Math.abs(dot)).toBeLessThan(1e-6);
  });

  it('updates prior market returns with qualitative AI agent views', () => {
    const engine = new BlackLittermanEngine();

    const priors: AssetMarketPrior[] = [
      { symbol: 'BTC', marketWeight: 0.6, equilibriumReturn: 0.08, variance: 0.04 },
      { symbol: 'ETH', marketWeight: 0.4, equilibriumReturn: 0.06, variance: 0.06 },
    ];

    // Bullish view on ETH from debate agent
    const views: QualitativeAgentView[] = [
      { symbol: 'ETH', expectedReturn: 0.14, confidence: 0.8, viewDescription: 'Bullish on scaling' },
    ];

    const result = engine.computePosteriorWeights(priors, views);

    expect(result.assets).toHaveLength(2);
    const eth = result.assets.find((a) => a.symbol === 'ETH');
    const btc = result.assets.find((a) => a.symbol === 'BTC');

    expect(eth).toBeDefined();
    expect(btc).toBeDefined();
    // Posterior return of ETH shifted upwards toward agent view
    expect(eth!.posteriorReturn).toBeGreaterThan(eth!.priorReturn);
    expect(eth!.viewTiltPct).toBeGreaterThan(0);
    expect(result.averageConfidence).toBe(0.8);
  });
});
