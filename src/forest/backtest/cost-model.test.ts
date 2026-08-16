// Backtest Engine — Cost Model tests

import { describe, expect, it } from 'vitest';
import {
  applyCosts,
  estimateMarketImpact,
  resolveStressConfig,
} from './cost-model';
import type { CostConfig } from './cost-model';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function makeConfig(
  feePct: number,
  slipPct: number,
  marketImpactPct = 0,
): CostConfig {
  return { feePct, slipPct, marketImpactPct };
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('resolveStressConfig', () => {
  it('returns 5 bps for normal mode', () => {
    const cfg = resolveStressConfig('normal');
    expect(cfg.feePct).toBeCloseTo(0.0005);
    expect(cfg.slipPct).toBeCloseTo(0.0005);
  });

  it('returns 10 bps for conservative mode', () => {
    const cfg = resolveStressConfig('conservative');
    expect(cfg.feePct).toBeCloseTo(0.0010);
    expect(cfg.slipPct).toBeCloseTo(0.0010);
  });

  it('returns 20 bps for adverse mode', () => {
    const cfg = resolveStressConfig('adverse');
    expect(cfg.feePct).toBeCloseTo(0.0020);
    expect(cfg.slipPct).toBeCloseTo(0.0020);
  });

  it('returns a copy (not the internal reference)', () => {
    const a = resolveStressConfig('normal');
    const b = resolveStressConfig('normal');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('applyCosts', () => {
  const NOTIONAL = 10_000; // $10k trade

  it('normal mode: 5 bps fee + 5 bps slip', () => {
    const cfg = makeConfig(0.0005, 0.0005);
    const result = applyCosts(200, NOTIONAL, cfg);

    expect(result.fees).toBeCloseTo(5);       // 10000 * 0.0005
    expect(result.slippage).toBeCloseTo(5);   // 10000 * 0.0005
    expect(result.marketImpact).toBeCloseTo(0);
    expect(result.netPnl).toBeCloseTo(190);   // 200 - 10
  });

  it('conservative mode: 10 bps fee + 10 bps slip', () => {
    const cfg = makeConfig(0.0010, 0.0010);
    const result = applyCosts(200, NOTIONAL, cfg);

    expect(result.fees).toBeCloseTo(10);
    expect(result.slippage).toBeCloseTo(10);
    expect(result.netPnl).toBeCloseTo(180);   // 200 - 20
  });

  it('adverse mode: 20 bps fee + 20 bps slip', () => {
    const cfg = makeConfig(0.0020, 0.0020);
    const result = applyCosts(200, NOTIONAL, cfg);

    expect(result.fees).toBeCloseTo(20);
    expect(result.slippage).toBeCloseTo(20);
    expect(result.netPnl).toBeCloseTo(160);   // 200 - 40
  });

  it('includes market impact when provided', () => {
    const cfg = makeConfig(0.0005, 0.0005, 0.001);
    const result = applyCosts(300, NOTIONAL, cfg);

    expect(result.marketImpact).toBeCloseTo(10);  // 10000 * 0.001
    expect(result.netPnl).toBeCloseTo(280);       // 300 - 5 - 5 - 10
  });

  it('zero notional returns zero costs', () => {
    const cfg = makeConfig(0.0020, 0.0020);
    const result = applyCosts(100, 0, cfg);

    expect(result.fees).toBe(0);
    expect(result.slippage).toBe(0);
    expect(result.marketImpact).toBe(0);
    expect(result.netPnl).toBe(100);
  });

  it('negative notional returns zero costs', () => {
    const cfg = makeConfig(0.0005, 0.0005);
    const result = applyCosts(50, -100, cfg);

    expect(result.fees).toBe(0);
    expect(result.slippage).toBe(0);
    expect(result.netPnl).toBe(50);
  });

  it('handles negative gross PnL correctly', () => {
    const cfg = makeConfig(0.0010, 0.0010);
    const result = applyCosts(-100, NOTIONAL, cfg);

    expect(result.netPnl).toBeCloseTo(-120);  // -100 - 10 - 10
  });
});

describe('estimateMarketImpact', () => {
  it('returns 0 when avgDailyVolume is 0', () => {
    expect(estimateMarketImpact(1000, 0)).toBe(0);
  });

  it('returns 0 when orderSize is 0', () => {
    expect(estimateMarketImpact(0, 100_000)).toBe(0);
  });

  it('returns 0 for negative volume', () => {
    expect(estimateMarketImpact(1000, -500)).toBe(0);
  });

  it('scales with square root of participation rate', () => {
    const impact1 = estimateMarketImpact(1_000, 1_000_000);   // 0.1%
    const impact4 = estimateMarketImpact(4_000, 1_000_000);   // 0.4%

    // 4x order size should yield 2x impact (sqrt)
    expect(impact4 / impact1).toBeCloseTo(2);
  });

  it('returns 0.1 (10%) for 100% participation', () => {
    const impact = estimateMarketImpact(100_000, 100_000);
    expect(impact).toBeCloseTo(0.1);
  });

  it('returns small impact for typical retail order', () => {
    // $500 order on $50M ADV → impact should be < 10 bps
    const impact = estimateMarketImpact(500, 50_000_000);
    expect(impact).toBeLessThan(0.001);
  });
});
