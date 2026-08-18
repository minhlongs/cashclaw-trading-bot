import { describe, it, expect } from 'vitest';
import { RegimeHistoryStore } from './history';
import { RegimeLabel, type RegimeFeatures, type RegimeResult } from './types';

const dummyFeatures: RegimeFeatures = {
  realizedVol: 0.02,
  atr: 150,
  trendStrength: 0.6,
  maSlope: 0.02,
  returnDispersion: 0.01,
  volumeAbnormality: 1.5,
};

function makeResult(
  label: RegimeLabel,
  timestamp: number,
  duration = 1,
  confidence = 0.8,
): RegimeResult {
  return {
    label,
    confidence,
    features: dummyFeatures,
    timestamp,
    previousLabel: null,
    duration,
  };
}

describe('RegimeHistoryStore', () => {
  it('add and retrieve history', () => {
    const store = new RegimeHistoryStore();
    const r1 = makeResult(RegimeLabel.TREND_UP, 1000);
    const r2 = makeResult(RegimeLabel.RANGE, 2000);
    store.add(r1);
    store.add(r2);
    expect(store.getHistory()).toEqual([r1, r2]);
    expect(store.length).toBe(2);
  });

  it('getCurrent returns latest result', () => {
    const store = new RegimeHistoryStore();
    expect(store.getCurrent()).toBeNull();

    const r1 = makeResult(RegimeLabel.RANGE, 1000);
    const r2 = makeResult(RegimeLabel.TREND_DOWN, 2000);
    store.add(r1);
    expect(store.getCurrent()).toBe(r1);
    store.add(r2);
    expect(store.getCurrent()).toBe(r2);
  });

  it('getByRegime filters correctly', () => {
    const store = new RegimeHistoryStore();
    store.add(makeResult(RegimeLabel.TREND_UP, 1000));
    store.add(makeResult(RegimeLabel.RANGE, 2000));
    store.add(makeResult(RegimeLabel.TREND_UP, 3000));
    store.add(makeResult(RegimeLabel.HIGH_VOLATILITY, 4000));

    const trends = store.getByRegime(RegimeLabel.TREND_UP);
    expect(trends).toHaveLength(2);
    expect(trends[0].timestamp).toBe(1000);
    expect(trends[1].timestamp).toBe(3000);

    const ranges = store.getByRegime(RegimeLabel.RANGE);
    expect(ranges).toHaveLength(1);

    const shocks = store.getByRegime(RegimeLabel.SHOCK);
    expect(shocks).toHaveLength(0);
  });

  it('transitionCount is accurate', () => {
    const store = new RegimeHistoryStore();
    expect(store.transitionCount()).toBe(0);

    // Same label repeated — no transitions
    store.add(makeResult(RegimeLabel.RANGE, 1000));
    store.add(makeResult(RegimeLabel.RANGE, 2000));
    store.add(makeResult(RegimeLabel.RANGE, 3000));
    expect(store.transitionCount()).toBe(0);

    // Add a different label — 1 transition
    store.add(makeResult(RegimeLabel.TREND_UP, 4000));
    expect(store.transitionCount()).toBe(1);

    // Add back to RANGE — another transition
    store.add(makeResult(RegimeLabel.RANGE, 5000));
    expect(store.transitionCount()).toBe(2);

    // Add same label — still 2
    store.add(makeResult(RegimeLabel.RANGE, 6000));
    expect(store.transitionCount()).toBe(2);
  });

  it('maxLength evicts oldest entries', () => {
    const store = new RegimeHistoryStore(3);
    store.add(makeResult(RegimeLabel.TREND_UP, 1000));
    store.add(makeResult(RegimeLabel.RANGE, 2000));
    store.add(makeResult(RegimeLabel.TREND_DOWN, 3000));
    expect(store.length).toBe(3);

    // Fourth entry evicts first
    store.add(makeResult(RegimeLabel.SHOCK, 4000));
    expect(store.length).toBe(3);
    const history = store.getHistory();
    expect(history[0].timestamp).toBe(2000);
    expect(history[2].timestamp).toBe(4000);

    // TREND_UP at 1000 is gone
    expect(store.getByRegime(RegimeLabel.TREND_UP)).toHaveLength(0);
  });

  it('averageDuration computes ms between consecutive entries', () => {
    const store = new RegimeHistoryStore();
    expect(store.averageDuration()).toBe(0);

    store.add(makeResult(RegimeLabel.TREND_UP, 1000));
    expect(store.averageDuration()).toBe(0); // single entry

    store.add(makeResult(RegimeLabel.RANGE, 4000)); // gap = 3000
    store.add(makeResult(RegimeLabel.TREND_DOWN, 7000)); // gap = 3000
    expect(store.averageDuration()).toBe(3000);
  });
});
