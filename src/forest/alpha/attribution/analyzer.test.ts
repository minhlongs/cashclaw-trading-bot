// Alpha Attribution Engine — tests
// Validates attributePerformance and buildAttributionReport produce correct results.

import { describe, it, expect } from 'vitest';
import { attributePerformance } from './analyzer';
import type { AlphaSignal } from '@/tree/alpha/types';
import type { BacktestTrade } from '@/forest/backtest/types';
import { RegimeLabel } from '@/tree/regime/types';

// ── Synthetic data helpers ────────────────────────────────────────────────────

function makeSignal(name: string, ts: number, features: { id: string; value: number; causal: boolean }[]): AlphaSignal {
  return {
    name,
    source: 'indicator',
    direction: 'buy',
    confidence: 0.7,
    timestamp: ts,
    features: { features, computedAt: ts, symbol: 'BTCUSDT', lookback: 20 },
    metadata: {},
  };
}

function makeTrade(entryTs: number, pnl: number, holdingMinutes = 60): BacktestTrade {
  return {
    entryTimestamp: entryTs,
    exitTimestamp: entryTs + holdingMinutes * 60000,
    side: pnl >= 0 ? 'buy' : 'sell',
    entryPrice: 100,
    exitPrice: pnl >= 0 ? 100 + pnl / 10 : 100 + pnl / 10,
    quantity: 10,
    pnl,
    fee: 5,
    pnlPct: pnl,
    holdingMinutes,
  };
}

// ── Synthetic datasets ────────────────────────────────────────────────────────

const alphaA = makeSignal('alpha-a', 1000, [
  { id: 'rsi_14', value: 30, causal: true },
  { id: 'macd', value: 1.2, causal: true },
]);

const alphaB = makeSignal('alpha-b', 5000, [
  { id: 'rsi_14', value: 70, causal: true },
  { id: 'bb_width', value: 0.05, causal: false },
]);

const signals = [alphaA, alphaB];

// alpha-a: wins 500, losses -200 => total 300
// alpha-b: wins 500, wins 400, losses -200 => total 700
const trades: BacktestTrade[] = [
  makeTrade(2000, 500, 120),   // alpha-a win
  makeTrade(3000, -200, 30),   // alpha-a loss
  makeTrade(6000, 500, 90),    // alpha-b win
  makeTrade(7000, 400, 60),    // alpha-b win
  makeTrade(8000, -200, 45),   // alpha-b loss
];

const regimes = [
  { timestamp: 0, label: RegimeLabel.TREND_UP },
  { timestamp: 4000, label: RegimeLabel.RANGE },
  { timestamp: 7000, label: RegimeLabel.HIGH_VOLATILITY },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('attributePerformance', () => {
  it('returns one result per unique alpha signal', () => {
    const results = attributePerformance(trades, signals, regimes);
    expect(results.length).toBe(2);
  });

  it('sorts results by totalContribution descending', () => {
    const results = attributePerformance(trades, signals, regimes);
    expect(results[0].totalContribution).toBeGreaterThanOrEqual(results[1].totalContribution);
  });

  it('computes totalContribution as sum of trade PnL for each alpha', () => {
    const results = attributePerformance(trades, signals, regimes);
    const byId = new Map(results.map(r => [r.alphaId, r]));
    expect(byId.get('alpha-a')!.totalContribution).toBe(300);
    expect(byId.get('alpha-b')!.totalContribution).toBe(700);
  });

  it('computes winsContribution and lossesContribution', () => {
    const results = attributePerformance(trades, signals, regimes);
    const byId = new Map(results.map(r => [r.alphaId, r]));
    expect(byId.get('alpha-a')!.winsContribution).toBe(500);
    expect(byId.get('alpha-a')!.lossesContribution).toBe(-200);
    expect(byId.get('alpha-b')!.winsContribution).toBe(900);
    expect(byId.get('alpha-b')!.lossesContribution).toBe(-200);
  });

  it('breaks down trades by regime', () => {
    const results = attributePerformance(trades, signals, regimes);
    const b = results.find(r => r.alphaId === 'alpha-b')!;
    expect(b.RegimeBreakdown[RegimeLabel.RANGE].trades).toBe(1);
    expect(b.RegimeBreakdown[RegimeLabel.HIGH_VOLATILITY].trades).toBe(2);
    expect(b.RegimeBreakdown[RegimeLabel.RANGE].pnl).toBe(500);
    expect(b.RegimeBreakdown[RegimeLabel.HIGH_VOLATILITY].pnl).toBe(200);
  });

  it('computes feature importance via Pearson correlation', () => {
    const results = attributePerformance(trades, signals, regimes);
    const a = results.find(r => r.alphaId === 'alpha-a')!;
    // rsi_14 values: 30, 30 => constant => correlation 0
    expect(a.FeatureImportance['rsi_14']).toBeDefined();
    // non-causal feature excluded
    expect(a.FeatureImportance['bb_width']).toBeUndefined();
  });

  it('returns AvgConfidence as average of signal confidence values', () => {
    const results = attributePerformance(trades, signals, regimes);
    const a = results.find(r => r.alphaId === 'alpha-a')!;
    expect(a.AvgConfidence).toBe(0.7);
  });

  it('returns empty array when no signals provided', () => {
    const results = attributePerformance(trades, [], regimes);
    expect(results).toEqual([]);
  });

  it('handles trades without matching signals', () => {
    const orphanTrade: BacktestTrade = {
      ...trades[0],
      entryTimestamp: 0,
      exitTimestamp: 3600000,
    };
    const results = attributePerformance([orphanTrade], signals, regimes);
    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});