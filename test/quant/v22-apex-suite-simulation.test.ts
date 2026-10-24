import { describe, expect, it } from 'vitest';
import { computeOptimalExecution } from '@/tree/quantlib/execution/almgren-nonlinear-impact-engine';
import { computeMRRDecomposition } from '@/tree/quantlib/microstructure/mrr-spread-decomposition-engine';
import type { MRRTradeTick } from '@/tree/quantlib/microstructure/mrr-spread-decomposition-engine';
import { checkDrawdown, checkNetPnlAfterFees, checkTradeCount } from '@/forest/alpha/gate/gate-checks';
import { macdIndicator, rsiIndicator, smaIndicator } from '@/tree/alpha/indicators-technical';
import type { Candle } from '@/forest/backtest/ohlcv';

describe('Triad v22 Apex Multi-Domain Quantitative & Architecture Simulation', () => {
  it('integrates non-linear execution, spread decomposition, modular gate checks, and indicators', () => {
    // 1. Technical momentum & trend indicators
    const candles: Candle[] = Array.from({ length: 40 }, (_, i) => ({
      timestamp: 1_700_000_000 + i * 3600,
      open: 100 + i * 0.5,
      high: 101 + i * 0.5,
      low: 99.5 + i * 0.5,
      close: 100.8 + i * 0.5,
      volume: 1000 + i * 10,
    }));

    const sma = smaIndicator(candles, 10, '1h');
    const rsi = rsiIndicator(candles, 14, '1h');
    const macd = macdIndicator(candles, 12, '1h');

    expect(sma.value).not.toBeNull();
    expect(rsi.value).not.toBeNull();
    expect(macd.value).not.toBeNull();

    // 2. MRR spread decomposition on simulated micro-trades
    const ticks: MRRTradeTick[] = [
      { price: 100.0, tradeDirection: 1 },
      { price: 100.2, tradeDirection: 1 },
      { price: 100.1, tradeDirection: -1 },
      { price: 100.3, tradeDirection: 1 },
      { price: 100.15, tradeDirection: -1 },
    ];
    const mrr = computeMRRDecomposition(ticks);
    expect(mrr.adverseSelectionShare).toBeGreaterThanOrEqual(0);

    // 3. Almgren (2003) Non-linear execution schedule for target rebalancing
    const exec = computeOptimalExecution({
      totalShares: 2_500,
      timeHorizon: 0.5,
      numSteps: 5,
      volatility: 0.2,
      riskAversion: 5e-4,
      temporaryImpactEta: 0.03,
      powerExponent: 0.5,
    });
    expect(exec.schedule).toHaveLength(5);
    expect(exec.expectedCost).toBeGreaterThan(0);

    // 4. Survival gate checks
    const tradesCheck = checkTradeCount(50, 30);
    const ddCheck = checkDrawdown(0.08, 0.20);
    const pnlCheck = checkNetPnlAfterFees(1500, 0);

    expect(tradesCheck.passed).toBe(true);
    expect(ddCheck.passed).toBe(true);
    expect(pnlCheck.passed).toBe(true);
  });
});
