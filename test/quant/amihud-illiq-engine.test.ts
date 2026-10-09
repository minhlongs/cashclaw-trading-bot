import { describe, it, expect } from 'vitest';
import { AmihudIlliqEngine } from '../../src/tree/quantlib/liquidity/amihud-illiq-engine';

describe('AmihudIlliqEngine', () => {
  it('returns default fallback when observations are below minimum threshold', () => {
    const engine = new AmihudIlliqEngine({ minObservations: 4 });
    const result = engine.estimateIlliquidity([
      { returnPct: 0.01, volumeUsd: 10000 },
      { returnPct: -0.02, volumeUsd: 20000 },
    ]);
    expect(result.sampleCount).toBe(2);
    expect(result.meanIlliquidity).toBe(0);
    expect(result.isIlliquidRegime).toBe(false);
  });

  it('correctly calculates scaled Amihud illiquidity mean and median', () => {
    const engine = new AmihudIlliqEngine({
      minObservations: 4,
      illiquidityThreshold: 1.5,
      scaleFactor: 1e6,
    });
    const bars = [
      { returnPct: 0.02, volumeUsd: 10000 }, // ratio: 2.0
      { returnPct: 0.01, volumeUsd: 10000 }, // ratio: 1.0
      { returnPct: -0.03, volumeUsd: 10000 }, // ratio: 3.0
      { returnPct: 0.02, volumeUsd: 10000 }, // ratio: 2.0
    ];
    const result = engine.estimateIlliquidity(bars);
    expect(result.sampleCount).toBe(4);
    expect(result.meanIlliquidity).toBe(2.0);
    expect(result.medianIlliquidity).toBe(2.0);
    expect(result.isIlliquidRegime).toBe(true);
  });

  it('identifies liquid regime when trading volume dampens price impact', () => {
    const engine = new AmihudIlliqEngine({
      minObservations: 3,
      illiquidityThreshold: 0.5,
      scaleFactor: 1e6,
    });
    const bars = [
      { returnPct: 0.001, volumeUsd: 100000 }, // ratio: 0.01
      { returnPct: -0.002, volumeUsd: 200000 }, // ratio: 0.01
      { returnPct: 0.0015, volumeUsd: 150000 }, // ratio: 0.01
    ];
    const result = engine.estimateIlliquidity(bars);
    expect(result.meanIlliquidity).toBeLessThan(0.1);
    expect(result.isIlliquidRegime).toBe(false);
  });
});
