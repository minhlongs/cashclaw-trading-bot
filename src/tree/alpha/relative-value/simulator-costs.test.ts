import { describe, it, expect } from 'vitest';
import { runPairSpreadSim } from './simulator';
import { resolveCostFraction } from './pair-period';
import { ouPanel, simConfig } from './simulator-fixtures';
import type { PairSimConfig } from './types';

// ── Cost fraction resolution (weight-builder.ts:11 convention) ──────────

describe('resolveCostFraction', () => {
  it('costBps/10_000 takes priority over stressMode', () => {
    expect(resolveCostFraction({ costBps: 17 })).toBe(17 / 10_000);
    expect(resolveCostFraction({ costBps: 0 })).toBe(0);
    expect(
      resolveCostFraction({ costBps: 50, stressMode: 'normal' }),
    ).toBe(50 / 10_000);
  });

  it('falls back to stress-mode fee+slip+impact sum', () => {
    // conservative = the resolver default; exact sums verified in cost-model.
    expect(resolveCostFraction({})).toBeGreaterThan(0);
    const normal = resolveCostFraction({ stressMode: 'normal' });
    const conservative = resolveCostFraction({ stressMode: 'conservative' });
    const adverse = resolveCostFraction({ stressMode: 'adverse' });
    expect(normal).toBeLessThan(conservative);
    expect(conservative).toBeLessThan(adverse);
  });
});

// ── Round-trip costs paid on BOTH transitions ───────────────────────────

describe('runPairSpreadSim — round-trip turnover costs', () => {
  const panel = ouPanel();

  function configWith(costBps: number): PairSimConfig {
    return simConfig({ costBps });
  }

  it('costPct = turnover × costBps/10_000 per period; net = gross − costPct', () => {
    const result = runPairSpreadSim(panel, configWith(17));
    for (const p of result.periods) {
      expect(p.costPct).toBeCloseTo((p.turnover * 17) / 10_000, 14);
      expect(p.netReturn).toBeCloseTo(p.grossReturn - p.costPct, 14);
    }
  });

  it('totalCosts equals totalTurnover × cost fraction', () => {
    const result = runPairSpreadSim(panel, configWith(17));
    expect(result.totalCosts).toBeCloseTo(result.totalTurnover * (17 / 10_000), 14);
    expect(result.totalCosts).toBeGreaterThan(0);
  });

  it('entry and exit periods both pay positive costs (round trip)', () => {
    const result = runPairSpreadSim(panel, configWith(25));
    const withTurnover = result.periods.filter((p) => p.turnover > 0);
    expect(withTurnover.length).toBeGreaterThanOrEqual(2);
    for (const p of withTurnover) {
      expect(p.costPct).toBeGreaterThan(0);
      expect(p.netReturn).toBeLessThan(p.grossReturn);
    }
  });

  it('higher costBps strictly reduces final equity vs zero-cost run', () => {
    const free = runPairSpreadSim(panel, simConfig());
    const cheap = runPairSpreadSim(panel, configWith(10));
    const pricey = runPairSpreadSim(panel, configWith(100));
    const last = (r: { equityCurve: number[] }) => r.equityCurve[r.equityCurve.length - 1]!;
    expect(last(free)).toBeGreaterThan(last(cheap));
    expect(last(cheap)).toBeGreaterThan(last(pricey));
  });

  it('stressMode resolution applies when costBps is absent', () => {
    const stressed = runPairSpreadSim(panel, simConfig({ costBps: undefined }));
    expect(stressed.totalCosts).toBeGreaterThan(0);
    for (const p of stressed.periods) {
      if (p.turnover > 0) {
        expect(p.netReturn).toBeLessThan(p.grossReturn);
      }
    }
  });
});
