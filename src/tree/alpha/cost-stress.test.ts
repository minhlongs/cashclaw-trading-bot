import { describe, it, expect } from 'vitest';
import { resolveStressConfig } from './cost-stress';

// Values mirror forest/backtest/cost-model.ts STRESS_CONFIGS verbatim.
// Note: that file's inline "N bps total" comments are stale — the real sums
// of its constants are 16/27/50 bps. These tests pin the COPIED VALUES.

describe('resolveStressConfig (tree layer — mirrors forest/backtest/cost-model)', () => {
  it('normal mode matches forest constants (sums to 16 bps)', () => {
    const c = resolveStressConfig('normal');
    expect(c.feePct).toBeCloseTo(0.0008, 12);
    expect(c.slipPct).toBeCloseTo(0.0003, 12);
    expect(c.marketImpactPct).toBeCloseTo(0.0005, 12);
    expect((c.feePct + c.slipPct + c.marketImpactPct) * 10_000).toBeCloseTo(16, 9);
  });

  it('conservative mode matches forest constants (sums to 27 bps)', () => {
    const c = resolveStressConfig('conservative');
    expect(c.feePct).toBeCloseTo(0.0010, 12);
    expect(c.slipPct).toBeCloseTo(0.0007, 12);
    expect(c.marketImpactPct).toBeCloseTo(0.0010, 12);
    expect((c.feePct + c.slipPct + c.marketImpactPct) * 10_000).toBeCloseTo(27, 9);
  });

  it('adverse mode matches forest constants (sums to 50 bps)', () => {
    const c = resolveStressConfig('adverse');
    expect(c.feePct).toBeCloseTo(0.0010, 12);
    expect(c.slipPct).toBeCloseTo(0.0020, 12);
    expect(c.marketImpactPct).toBeCloseTo(0.0020, 12);
    expect((c.feePct + c.slipPct + c.marketImpactPct) * 10_000).toBeCloseTo(50, 9);
  });

  it('returns a fresh copy on every call (not the same reference)', () => {
    const a = resolveStressConfig('conservative');
    const b = resolveStressConfig('conservative');
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('strict ordering: normal < conservative < adverse in total cost', () => {
    const sum = (m: ReturnType<typeof resolveStressConfig>) =>
      m.feePct + m.slipPct + m.marketImpactPct;
    expect(sum(resolveStressConfig('normal'))).toBeLessThan(
      sum(resolveStressConfig('conservative')),
    );
    expect(sum(resolveStressConfig('conservative'))).toBeLessThan(
      sum(resolveStressConfig('adverse')),
    );
  });

  it('extreme mode returns correct 3 fields (100 bps total)', () => {
    const c = resolveStressConfig('extreme');
    expect(c.feePct).toBeCloseTo(0.0015, 12);
    expect(c.slipPct).toBeCloseTo(0.0040, 12);
    expect(c.marketImpactPct).toBeCloseTo(0.0045, 12);
    expect((c.feePct + c.slipPct + c.marketImpactPct) * 10_000).toBeCloseTo(100, 9);
  });

  it('extreme total cost ≈ 0.01', () => {
    const c = resolveStressConfig('extreme');
    expect(c.feePct + c.slipPct + c.marketImpactPct).toBeCloseTo(0.01, 10);
  });

  it('adverse mode still sums to 50 bps (regression pin)', () => {
    const c = resolveStressConfig('adverse');
    expect((c.feePct + c.slipPct + c.marketImpactPct) * 10_000).toBeCloseTo(50, 9);
  });

  it('strict ordering: normal < conservative < adverse < extreme', () => {
    const sum = (m: ReturnType<typeof resolveStressConfig>) =>
      m.feePct + m.slipPct + m.marketImpactPct;
    expect(sum(resolveStressConfig('adverse'))).toBeLessThan(
      sum(resolveStressConfig('extreme')),
    );
  });
});
