import { describe, it, expect } from 'vitest';
import { resolveStressConfig, applyCosts, type StressMode } from './cost-model';

// Pin all 4 stress modes field-by-field against tree/alpha/cost-stress.ts.
// Both modules must stay in sync; this test is the enforcement seam.

describe('resolveStressConfig (forest layer — mirrors tree/alpha/cost-stress)', () => {
  const modes: StressMode[] = ['normal', 'conservative', 'adverse', 'extreme'];
  const expectedTotalsBps: Record<StressMode, number> = {
    normal: 16,
    conservative: 27,
    adverse: 50,
    extreme: 100,
  };

  for (const mode of modes) {
    it(`${mode} returns correct fields (sums to ${expectedTotalsBps[mode]} bps)`, () => {
      const c = resolveStressConfig(mode);
      expect(c.feePct + c.slipPct + c.marketImpactPct).toBeCloseTo(
        expectedTotalsBps[mode] / 10_000,
        10,
      );
    });
  }

  it('extreme field-by-field pin', () => {
    const c = resolveStressConfig('extreme');
    expect(c.feePct).toBeCloseTo(0.0015, 12);
    expect(c.slipPct).toBeCloseTo(0.0040, 12);
    expect(c.marketImpactPct).toBeCloseTo(0.0045, 12);
  });

  it('ordering: normal < conservative < adverse < extreme', () => {
    const sum = (m: StressMode) => {
      const c = resolveStressConfig(m);
      return c.feePct + c.slipPct + c.marketImpactPct;
    };
    expect(sum('normal')).toBeLessThan(sum('conservative'));
    expect(sum('conservative')).toBeLessThan(sum('adverse'));
    expect(sum('adverse')).toBeLessThan(sum('extreme'));
  });
});

describe('applyCosts with extreme mode', () => {
  it('netPnl = grossPnl − 0.01 × notional', () => {
    const grossPnl = 500;
    const notional = 10_000;
    const c = resolveStressConfig('extreme');
    const result = applyCosts(grossPnl, notional, c);
    const expectedTotalCost = (c.feePct + c.slipPct + c.marketImpactPct) * notional;
    expect(result.netPnl).toBeCloseTo(grossPnl - expectedTotalCost, 10);
    expect(result.fees).toBeCloseTo(notional * c.feePct, 10);
    expect(result.slippage).toBeCloseTo(notional * c.slipPct, 10);
    expect(result.marketImpact).toBeCloseTo(notional * c.marketImpactPct, 10);
  });

  it('applyCosts returns zero costs when notional is zero', () => {
    const c = resolveStressConfig('extreme');
    const result = applyCosts(100, 0, c);
    expect(result.netPnl).toBe(100);
    expect(result.fees).toBe(0);
    expect(result.slippage).toBe(0);
    expect(result.marketImpact).toBe(0);
  });
});
