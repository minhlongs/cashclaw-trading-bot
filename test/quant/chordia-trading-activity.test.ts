import { describe, it, expect } from 'vitest';
import { ChordiaTradingActivityEngine } from '@/tree/quantlib/microstructure/chordia-trading-activity-engine';
import type { DailyActivity } from '@/tree/quantlib/microstructure/chordia-trading-activity-engine';

describe('Chordia, Subrahmanyam & Anshuman (2001) Trading Activity & Liquidity Volatility', () => {
  const activities: DailyActivity[] = [
    { volume: 100_000, sharesOutstanding: 1_000_000 },
    { volume: 150_000, sharesOutstanding: 1_000_000 },
    { volume: 120_000, sharesOutstanding: 1_000_000 },
    { volume: 200_000, sharesOutstanding: 1_000_000 },
    { volume: 80_000, sharesOutstanding: 1_000_000 },
  ];

  it('computes mean turnover and liquidity volatility metrics', () => {
    const res = ChordiaTradingActivityEngine.calculate({ activities, riskSensitivity: 0.5 });
    expect(res.meanTurnover).toBeGreaterThan(0);
    expect(res.turnoverVolatility).toBeGreaterThan(0);
    expect(res.coefficientOfVariation).toBeGreaterThan(0);
    expect(res.sampleDays).toBe(5);
    expect(typeof res.liquidityRiskAdjustment).toBe('number');
  });

  it('throws on invalid observations', () => {
    expect(() => ChordiaTradingActivityEngine.calculate({ activities: [] })).toThrow();
    expect(() =>
      ChordiaTradingActivityEngine.calculate({
        activities: [{ volume: -10, sharesOutstanding: 100 }],
      }),
    ).toThrow();
  });
});
