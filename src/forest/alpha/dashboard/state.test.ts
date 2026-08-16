// Dashboard State Tracker — Tests

import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardStateTracker } from './state';
import { RegimeLabel } from '@/tree/regime/types';
import type { AlphaSignal } from '@/tree/alpha/types';
import type { DashboardPosition, PerformanceInput, RegimeInput } from './types';

function regime(label: RegimeLabel, confidence: number, ts: number): RegimeInput {
  return { label, confidence, timestamp: ts };
}

function signal(name: string, confidence: number): AlphaSignal {
  return {
    name, direction: 'buy', confidence, source: 'regime',
    timestamp: Date.now(),
    features: { features: [], computedAt: Date.now(), symbol: 'BTC', lookback: 14 },
    metadata: {},
  } as AlphaSignal;
}

function position(id: string, pnl: number): DashboardPosition {
  return {
    id, symbol: 'BTC/USDT', side: 'long',
    entryPrice: 100, currentPrice: 100 + pnl,
    pnlPercent: pnl, openTimestamp: Date.now(),
  };
}

function perf(sharpe: number, pnl: number): PerformanceInput {
  return {
    totalPnl: pnl, sharpeRatio: sharpe, maxDrawdown: -5,
    winRate: 0.6, tradeCount: 10, avgDuration: 3600,
  };
}

describe('DashboardStateTracker', () => {
  let t: DashboardStateTracker;
  beforeEach(() => { t = new DashboardStateTracker(); });

  it('starts with UNKNOWN regime and empty state', () => {
    const s = t.update(regime(RegimeLabel.UNKNOWN, 0, 1000), [], [], perf(0, 0));
    expect(s.currentRegime).toBe(RegimeLabel.UNKNOWN);
    expect(s.recentSignals).toHaveLength(0);
    expect(s.openPositions).toHaveLength(0);
    expect(s.regimeTimeline).toHaveLength(0);
  });

  it('records a single regime entry in timeline', () => {
    const s = t.update(regime(RegimeLabel.TREND_UP, 0.85, 1000), [], [], perf(1.2, 50));
    expect(s.currentRegime).toBe(RegimeLabel.TREND_UP);
    expect(s.regimeConfidence).toBe(0.85);
    expect(s.regimeTimeline).toHaveLength(1);
    expect(s.regimeTimeline[0].regime).toBe(RegimeLabel.TREND_UP);
    expect(s.regimeTimeline[0].endTimestamp).toBeNull();
    expect(s.regimeTimeline[0].startTimestamp).toBe(1000);
  });

  it('transitions between regimes and closes the previous segment', () => {
    t.update(regime(RegimeLabel.TREND_UP, 0.8, 1000), [], [], perf(0, 0));
    const s = t.update(regime(RegimeLabel.RANGE, 0.7, 2000), [], [], perf(0, 0));
    expect(s.regimeTimeline).toHaveLength(2);
    expect(s.regimeTimeline[0].regime).toBe(RegimeLabel.TREND_UP);
    expect(s.regimeTimeline[0].endTimestamp).toBe(2000);
    expect(s.regimeTimeline[1].regime).toBe(RegimeLabel.RANGE);
    expect(s.regimeTimeline[1].endTimestamp).toBeNull();
    expect(s.currentRegime).toBe(RegimeLabel.RANGE);
  });

  it('tracks average confidence correctly across updates in same regime', () => {
    t.update(regime(RegimeLabel.RANGE, 0.6, 1000), [], [], perf(0, 0));
    t.update(regime(RegimeLabel.RANGE, 0.8, 1100), [], [], perf(0, 0));
    const s = t.update(regime(RegimeLabel.RANGE, 1.0, 1200), [], [], perf(0, 0));
    const entry = s.regimeTimeline[s.regimeTimeline.length - 1];
    expect(entry.signalCount).toBe(3);
    expect(entry.avgConfidence).toBeCloseTo(0.8, 5);
  });

  it('accumulates recent signals up to MAX_RECENT_SIGNALS', () => {
    t.update(regime(RegimeLabel.TREND_UP, 0.9, 1000), [signal('s1', 0.5)], [], perf(0, 0));
    const s = t.update(
      regime(RegimeLabel.TREND_UP, 0.9, 2000),
      [signal('s2', 0.6), signal('s3', 0.7)],
      [], perf(0, 0),
    );
    expect(s.recentSignals).toHaveLength(3);
    expect(s.recentSignals[0].name).toBe('s1');
    expect(s.recentSignals[2].name).toBe('s3');
  });

  it('replaces open positions on each update', () => {
    t.update(regime(RegimeLabel.TREND_DOWN, 0.7, 1000), [], [position('p1', 10)], perf(0, 0));
    const s = t.update(
      regime(RegimeLabel.TREND_DOWN, 0.7, 2000),
      [], [position('p2', -5), position('p3', 20)], perf(0, 0),
    );
    expect(s.openPositions).toHaveLength(2);
    expect(s.openPositions[0].id).toBe('p2');
  });

  it('returns latest performance summary', () => {
    t.update(regime(RegimeLabel.TREND_UP, 0.9, 1000), [], [], perf(0.5, 10));
    const s = t.update(regime(RegimeLabel.TREND_UP, 0.9, 2000), [], [], perf(1.8, 50));
    expect(s.performanceSummary.sharpeRatio).toBe(1.8);
    expect(s.performanceSummary.totalPnl).toBe(50);
  });

  it('getPerformanceTimeSeries returns rolling sharpe points', () => {
    t.update(regime(RegimeLabel.TREND_UP, 0.9, 1000), [], [], perf(0.5, 10));
    t.update(regime(RegimeLabel.TREND_UP, 0.9, 2000), [], [], perf(1.2, 20));
    const ts = t.getPerformanceTimeSeries();
    expect(ts).toHaveLength(2);
    expect(ts[0].label).toBe('sharpe');
    expect(ts[0].value).toBe(0.5);
    expect(ts[1].value).toBe(1.2);
  });

  it('setAttribution and getAttributionSummary round-trip correctly', () => {
    const contrib = { alpha_rsi: 0.45, alpha_macd: 0.35, alpha_vol: 0.2 };
    t.setAttribution(contrib);
    expect(t.getAttributionSummary()).toEqual(contrib);
  });

  it('getAttributionSummary returns a copy, not the internal reference', () => {
    t.setAttribution({ alpha_a: 1.0 });
    const a = t.getAttributionSummary();
    const b = t.getAttributionSummary();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('reset clears all internal state', () => {
    t.update(regime(RegimeLabel.SHOCK, 0.95, 1000), [signal('s1', 0.8)], [position('p1', 5)], perf(2.0, 100));
    t.setAttribution({ alpha_test: 1.0 });
    t.reset();
    const s = t.update(regime(RegimeLabel.UNKNOWN, 0, 2000), [], [], perf(0, 0));
    expect(s.currentRegime).toBe(RegimeLabel.UNKNOWN);
    expect(s.recentSignals).toHaveLength(0);
    expect(s.openPositions).toHaveLength(0);
    expect(s.regimeTimeline).toHaveLength(0);
    expect(Object.keys(s.attributionSummary)).toHaveLength(0);
  });
});
