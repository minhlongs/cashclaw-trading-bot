// Alpha Research Pipeline — Survival Gate Integration Tests
// Verifies that AlphaResearchPipeline runs the survival gate on the evaluation
// report and applies lifecycle state transitions according to promotion rules.

import { describe, it, expect } from 'vitest';
import { AlphaResearchPipeline } from './engine';
import type { PipelineConfig } from './types';
import type { Candle } from '@/forest/backtest/ohlcv';
import type { RegimeConfig } from '@/tree/regime/types';

function makeCandles(count: number, startPrice = 100): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const variance = Math.sin(i * 0.1) * 2 + Math.cos(i * 0.05) * 3;
    price = Math.max(1, price + variance);
    candles.push({
      timestamp: 1_700_000_000_000 + i * 3_600_000,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000 + (i % 10) * 50,
    });
  }
  return candles;
}

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1h',
    candles: makeCandles(120),
    indicatorSet: { sma: 20, rsi: 14, atr: 14, lookback: 20 },
    regimeConfig: {
      minCandles: 10,
      confidenceThreshold: 0.6,
      lookback: 20,
      minDuration: 3,
    } as RegimeConfig,
    walkforwardConfig: {
      trainBars: 40,
      validateBars: 20,
      testBars: 20,
      stepBars: 20,
    },
    costMode: 'normal',
    minSharpe: 0,
    minTrades: 0,
    baselinesEnabled: false,
    ...overrides,
  };
}

describe('AlphaResearchPipeline survival gate & promotion integration', () => {
  it('kills strategy and transitions from RESEARCH to KILLED when default gate checks fail', async () => {
    const pipeline = new AlphaResearchPipeline(makeConfig());
    const report = await pipeline.run();

    expect(report.survivalGate).not.toBeNull();
    expect(report.survivalGate?.status).toBe('KILLED');
    expect(report.promotion).not.toBeNull();
    expect(report.promotion?.from).toBe('RESEARCH');
    expect(report.promotion?.to).toBe('KILLED');
    expect(report.promotion?.trigger.type).toBe('gate_failed');

    const stepResult = pipeline.getResults().find((r) => r.step === 'generate_report');
    expect(stepResult?.status).toBe('success');
    expect(stepResult?.data).toEqual({
      survivalGate: report.survivalGate,
      promotion: report.promotion,
    });
  });

  it('promotes strategy from RESEARCH to BACKTEST when survival gate criteria pass', async () => {
    // Lenient thresholds so synthetic run satisfies all survival gate checks
    const pipeline = new AlphaResearchPipeline(
      makeConfig({
        survivalGateConfig: {
          minTrades: 0,
          minExpectancy: -100,
          minProfitFactor: 0,
          maxDrawdown: 1.0,
          minSharpe: -10,
          minRegimeCoverage: 0,
          minNetPnlAfterFees: -100000,
          minNetPnlAdverse: -100000,
        },
      }),
    );
    const report = await pipeline.run();

    expect(report.survivalGate).not.toBeNull();
    expect(report.survivalGate?.status).toBe('PAPER_CANDIDATE');
    expect(report.promotion).not.toBeNull();
    expect(report.promotion?.from).toBe('RESEARCH');
    expect(report.promotion?.to).toBe('BACKTEST');
    expect(report.promotion?.trigger.type).toBe('gate_passed');
  });

  it('advances through custom initialStrategyPhase correctly', async () => {
    const lenientGate = {
      minTrades: 0,
      minExpectancy: -100,
      minProfitFactor: 0,
      maxDrawdown: 1.0,
      minSharpe: -10,
      minRegimeCoverage: 0,
      minNetPnlAfterFees: -100000,
      minNetPnlAdverse: -100000,
    };

    // BACKTEST -> OOS_PASS
    const pipeBacktest = new AlphaResearchPipeline(
      makeConfig({ initialStrategyPhase: 'BACKTEST', survivalGateConfig: lenientGate }),
    );
    const repBacktest = await pipeBacktest.run();
    expect(repBacktest.promotion?.from).toBe('BACKTEST');
    expect(repBacktest.promotion?.to).toBe('OOS_PASS');

    // OOS_PASS -> ROBUSTNESS_PASS
    const pipeOos = new AlphaResearchPipeline(
      makeConfig({ initialStrategyPhase: 'OOS_PASS', survivalGateConfig: lenientGate }),
    );
    const repOos = await pipeOos.run();
    expect(repOos.promotion?.from).toBe('OOS_PASS');
    expect(repOos.promotion?.to).toBe('ROBUSTNESS_PASS');

    // ROBUSTNESS_PASS -> PAPER
    const pipeRobustness = new AlphaResearchPipeline(
      makeConfig({ initialStrategyPhase: 'ROBUSTNESS_PASS', survivalGateConfig: lenientGate }),
    );
    const repRobustness = await pipeRobustness.run();
    expect(repRobustness.promotion?.from).toBe('ROBUSTNESS_PASS');
    expect(repRobustness.promotion?.to).toBe('PAPER');

    // PAPER -> SHADOW
    const pipePaper = new AlphaResearchPipeline(
      makeConfig({ initialStrategyPhase: 'PAPER', survivalGateConfig: lenientGate }),
    );
    const repPaper = await pipePaper.run();
    expect(repPaper.promotion?.from).toBe('PAPER');
    expect(repPaper.promotion?.to).toBe('SHADOW');
  });

  it('respects automated ceiling: SHADOW cannot transition past SHADOW on gate_passed', async () => {
    const lenientGate = {
      minTrades: 0,
      minExpectancy: -100,
      minProfitFactor: 0,
      maxDrawdown: 1.0,
      minSharpe: -10,
      minRegimeCoverage: 0,
      minNetPnlAfterFees: -100000,
      minNetPnlAdverse: -100000,
    };

    const pipeline = new AlphaResearchPipeline(
      makeConfig({ initialStrategyPhase: 'SHADOW', survivalGateConfig: lenientGate }),
    );
    const report = await pipeline.run();

    expect(report.survivalGate?.status).toBe('PAPER_CANDIDATE');
    // Capped at SHADOW: gate_passed has no valid transition from SHADOW, returns null
    expect(report.promotion).toBeNull();
  });

  it('does not transition from terminal phases (KILLED, LIVE)', async () => {
    const pipeKilled = new AlphaResearchPipeline(
      makeConfig({ initialStrategyPhase: 'KILLED' }),
    );
    const repKilled = await pipeKilled.run();
    expect(repKilled.promotion).toBeNull();

    const pipeLive = new AlphaResearchPipeline(
      makeConfig({ initialStrategyPhase: 'LIVE' }),
    );
    const repLive = await pipeLive.run();
    expect(repLive.promotion).toBeNull();
  });

  it('returns null survivalGate and null promotion when evaluate step is skipped', async () => {
    const pipeline = new AlphaResearchPipeline(
      makeConfig({
        minSharpe: 100, // Walkforward fails and triggers early stop
        minTrades: 100,
      }),
    );
    const report = await pipeline.run();

    expect(report.survivalGate).toBeNull();
    expect(report.promotion).toBeNull();
  });
});
