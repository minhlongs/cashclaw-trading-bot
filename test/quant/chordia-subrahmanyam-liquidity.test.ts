import { describe, it, expect } from 'vitest';
import { computeChordiaCommonality } from '@/tree/quantlib/microstructure/chordia-subrahmanyam-liquidity-engine';

describe('Chordia, Roll & Subrahmanyam (2000) Commonality in Liquidity', () => {
  it('estimates systematic liquidity beta and asymmetric down/up market betas', () => {
    const assetSpreads = [0.10, 0.12, 0.11, 0.15, 0.14, 0.18, 0.16];
    const marketSpreads = [0.08, 0.09, 0.085, 0.11, 0.105, 0.13, 0.12];

    const res = computeChordiaCommonality({ assetSpreads, marketSpreads });

    expect(res.sampleSize).toBe(6);
    expect(res.liquidityBeta).toBeGreaterThan(0);
    expect(res.commonalityRSquared).toBeGreaterThan(0);
    expect(res.commonalityRSquared).toBeLessThanOrEqual(1.0);
    expect(res.averageAssetSpread).toBeGreaterThan(0);
    expect(res.downMarketBeta).toBeDefined();
    expect(res.upMarketBeta).toBeDefined();
  });

  it('infers market spreads automatically when omitted', () => {
    const assetSpreads = [0.10, 0.12, 0.11, 0.15, 0.14, 0.18];
    const res = computeChordiaCommonality({ assetSpreads });
    expect(res.sampleSize).toBe(5);
    expect(res.averageAssetSpread).toBeGreaterThan(0);
  });

  it('handles small sample series gracefully', () => {
    const res = computeChordiaCommonality({ assetSpreads: [0.10, 0.12] });
    expect(res.sampleSize).toBe(0);
    expect(res.liquidityBeta).toBe(0);
  });
});
