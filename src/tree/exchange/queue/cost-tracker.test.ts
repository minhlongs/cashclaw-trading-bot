import { describe, it, expect } from 'vitest';
import { CostTracker } from './cost-tracker';

const BUDGET = { binance: 100, bybit: 200, okx: 150 };
const NOOP_GET_NOW = () => Date.now();

function makeTracker(budget = BUDGET) {
  return new CostTracker({ budget, getNow: NOOP_GET_NOW });
}

describe('CostTracker', () => {
  it('starts with full budget remaining', () => {
    const tracker = makeTracker();
    expect(tracker.getRemaining('binance')).toBe(100);
    expect(tracker.getRemaining('bybit')).toBe(200);
    expect(tracker.getRemaining('okx')).toBe(150);
  });

  it('records cost and decrements remaining', () => {
    const tracker = makeTracker();
    tracker.record('binance', 10);
    expect(tracker.getUsed('binance')).toBe(10);
    expect(tracker.getRemaining('binance')).toBe(90);
  });

  it('accumulates multiple records', () => {
    const tracker = makeTracker();
    tracker.record('binance', 5);
    tracker.record('binance', 15);
    tracker.record('binance', 3);
    expect(tracker.getUsed('binance')).toBe(23);
    expect(tracker.getRemaining('binance')).toBe(77);
  });

  it('detects over budget', () => {
    const tracker = makeTracker();
    expect(tracker.isOverBudget('binance')).toBe(false);
    tracker.record('binance', 100);
    expect(tracker.isOverBudget('binance')).toBe(true);
  });

  it('remaining never goes negative', () => {
    const tracker = makeTracker();
    tracker.record('binance', 200);
    expect(tracker.getRemaining('binance')).toBe(0);
    expect(tracker.isOverBudget('binance')).toBe(true);
  });

  it('tracks exchanges independently', () => {
    const tracker = makeTracker();
    tracker.record('binance', 50);
    tracker.record('bybit', 10);
    expect(tracker.getRemaining('binance')).toBe(50);
    expect(tracker.getRemaining('bybit')).toBe(190);
    expect(tracker.getRemaining('okx')).toBe(150);
  });

  it('resets all buckets', () => {
    const tracker = makeTracker();
    tracker.record('binance', 80);
    tracker.record('bybit', 50);
    tracker.reset();
    expect(tracker.getRemaining('binance')).toBe(100);
    expect(tracker.getRemaining('bybit')).toBe(200);
  });

  it('resets on new day', () => {
    const day1 = new Date('2026-08-16T12:00:00Z').getTime();
    const day2 = new Date('2026-08-17T12:00:00Z').getTime();

    let now = day1;
    const tracker = new CostTracker({
      budget: BUDGET,
      getNow: () => now,
    });

    tracker.record('binance', 80);
    expect(tracker.getUsed('binance')).toBe(80);

    // Advance to next day
    now = day2;
    expect(tracker.getUsed('binance')).toBe(0);
    expect(tracker.getRemaining('binance')).toBe(100);
  });

  it('returns budget via getBudget', () => {
    const tracker = makeTracker();
    expect(tracker.getBudget('binance')).toBe(100);
    expect(tracker.getBudget('bybit')).toBe(200);
  });

  it('snapshot returns all exchanges', () => {
    const tracker = makeTracker();
    tracker.record('binance', 30);
    const snap = tracker.snapshot();
    expect(snap.binance).toEqual({ budget: 100, used: 30, remaining: 70 });
    expect(snap.bybit).toEqual({ budget: 200, used: 0, remaining: 200 });
    expect(snap.okx).toEqual({ budget: 150, used: 0, remaining: 150 });
  });

  it('handles unknown exchange gracefully', () => {
    const tracker = makeTracker();
    expect(tracker.getRemaining('unknown' as any)).toBe(0);
    expect(tracker.isOverBudget('unknown' as any)).toBe(true);
    expect(tracker.getBudget('unknown' as any)).toBe(0);
  });
});
