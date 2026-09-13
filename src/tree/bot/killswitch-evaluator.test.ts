import { describe, it, expect } from 'vitest';
import {
  computeDrawdown,
  evaluateConsecutiveLosses,
  evaluateDailyPnl,
  evaluateOrderRisk,
} from './killswitch-evaluator';

const baseConfig = { maxDailyLossPct: 10, maxConsecutiveLosses: 3, maxDrawdownPct: 15 };

describe('computeDrawdown', () => {
  it('returns 0 when peakCapital <= 0', () => {
    expect(computeDrawdown(0, 500)).toBe(0);
    expect(computeDrawdown(-100, 500)).toBe(0);
  });

  it('calculates drawdown percentage accurately', () => {
    expect(computeDrawdown(1000, 900)).toBe(10);
    expect(computeDrawdown(1000, 800)).toBe(20);
    expect(computeDrawdown(1000, 1100)).toBe(10);
  });
});

describe('evaluateConsecutiveLosses', () => {
  it('returns null below threshold, message at or above threshold', () => {
    expect(evaluateConsecutiveLosses(2, 3)).toBeNull();
    expect(evaluateConsecutiveLosses(3, 3)).toBe('Max consecutive losses reached: 3');
    expect(evaluateConsecutiveLosses(4, 3)).toBe('Max consecutive losses reached: 4');
  });
});

describe('evaluateDailyPnl', () => {
  it('returns null when peakCapital <= 0 or dailyPnl >= 0', () => {
    expect(evaluateDailyPnl(-50, 0, 10)).toBeNull();
    expect(evaluateDailyPnl(50, 1000, 10)).toBeNull();
  });

  it('evaluates threshold boundary and formats percentage to 1 decimal place', () => {
    expect(evaluateDailyPnl(-99, 1000, 10)).toBeNull();
    expect(evaluateDailyPnl(-100, 1000, 10)).toBe('Daily loss limit exceeded: 10.0%');
    expect(evaluateDailyPnl(-106, 1000, 10)).toBe('Daily loss limit exceeded: 10.6%');
  });
});

describe('evaluateOrderRisk', () => {
  const baseState = { dailyPnl: 0, consecutiveLosses: 0, peakCapital: 1000, currentDrawdown: 5 };

  it('handles profit and zero pnl by resetting consecutive losses', () => {
    const profit = evaluateOrderRisk({ ...baseState, consecutiveLosses: 2 }, 100, baseConfig);
    expect(profit).toEqual({ dailyPnl: 100, consecutiveLosses: 0, currentDrawdown: -10, haltReason: null });

    const zero = evaluateOrderRisk({ ...baseState, consecutiveLosses: 2 }, 0, baseConfig);
    expect(zero).toEqual({ dailyPnl: 0, consecutiveLosses: 0, currentDrawdown: 0, haltReason: null });
  });

  it('retains input currentDrawdown on early halt from consecutive losses', () => {
    const res = evaluateOrderRisk({ ...baseState, consecutiveLosses: 2, currentDrawdown: 7.5 }, -10, baseConfig);
    expect(res.haltReason).toBe('Max consecutive losses reached: 3');
    expect(res.consecutiveLosses).toBe(3);
    expect(res.currentDrawdown).toBe(7.5);
  });

  it('retains input currentDrawdown on early halt from daily loss limit', () => {
    const cfg = { ...baseConfig, maxConsecutiveLosses: 10 };
    const res = evaluateOrderRisk({ ...baseState, dailyPnl: -90, currentDrawdown: 4.2 }, -20, cfg);
    expect(res.haltReason).toBe('Daily loss limit exceeded: 11.0%');
    expect(res.currentDrawdown).toBe(4.2);
  });

  it('triggers max drawdown halt and updates currentDrawdown when threshold reached', () => {
    const cfg = { ...baseConfig, maxDailyLossPct: 50, maxDrawdownPct: 15 };
    const res = evaluateOrderRisk(baseState, -160, cfg);
    expect(res.haltReason).toBe('Max drawdown reached: 16.00%');
    expect(res.currentDrawdown).toBe(16);
  });

  it('bypasses daily loss and drawdown when peakCapital is 0', () => {
    const noPeak = { dailyPnl: 0, consecutiveLosses: 0, peakCapital: 0, currentDrawdown: 0 };
    const cfg = { ...baseConfig, maxConsecutiveLosses: 10 };
    const res = evaluateOrderRisk(noPeak, -500, cfg);
    expect(res.haltReason).toBeNull();
    expect(res.dailyPnl).toBe(-500);
    expect(res.currentDrawdown).toBe(0);
  });
});
