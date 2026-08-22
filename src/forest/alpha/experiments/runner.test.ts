// Experiment Engine — Runner Tests

import { describe, it, expect, vi } from 'vitest';
import { runExperiment } from './runner';
import type { Experiment, ExperimentDeps } from './types';
import type { BacktestResult } from '@/forest/backtest/types';
import type { WalkForwardResult } from '@/forest/backtest/walkforward';
import { RegimeLabel } from '@/tree/regime/types';

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp-001',
    hypothesis: 'momentum works in trending regimes',
    dataset: 'test-set',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    featureSet: { name: 'core', features: ['rsi_14', 'macd'] },
    regimeFilter: [RegimeLabel.TREND_UP, RegimeLabel.TREND_DOWN],
    entryRule: { type: 'threshold', threshold: 0.5, direction: 'buy' },
    exitRule: { type: 'stoploss', value: 0.02 },
    positionSizing: { type: 'fixed', value: 1 },
    feeModel: { type: 'percentage', value: 0.001 },
    slippageModel: { type: 'percentage', value: 0.0005 },
    trainPeriod: { start: '2024-01-01', end: '2024-03-31' },
    validationPeriod: { start: '2024-04-01', end: '2024-04-30' },
    testPeriod: { start: '2024-05-01', end: '2024-06-30' },
    configSnapshot: {},
    ...overrides,
  };
}

function mkTrade(pnl: number): BacktestResult['trades_json'][number] {
  return { entryTimestamp: 0, exitTimestamp: 1, side: 'buy', entryPrice: 100, exitPrice: 100 + pnl, quantity: 1, pnl, fee: 0, pnlPct: 0.01, holdingMinutes: 1 };
}

function emptyBt(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    id: '',
    bot_id: '',
    strategy: '',
    pair: '',
    exchange: '',
    start_date: 0,
    end_date: 0,
    total_trades: 0,
    win_count: 0,
    loss_count: 0,
    win_rate: 0.6,
    total_pnl: 100,
    max_drawdown: 0.1,
    sharpe_ratio: 1.5,
    params_json: '{}',
    equity_curve_json: [],
    trades_json: [],
    created_at: Date.now(),
    ...overrides,
  };
}

const baseDeps: ExperimentDeps = {
  runBacktest: vi.fn(async () => emptyBt()),
  runWalkForward: vi.fn(async () => ({
    windows: [],
    aggregated: {
      inSample: { ...emptyBt(), sharpe_ratio: 0, total_pnl: 0, total_trades: 0, win_rate: 0, max_drawdown: 0 },
      validation: { ...emptyBt(), sharpe_ratio: 0, total_pnl: 0, total_trades: 0, win_rate: 0, max_drawdown: 0 },
      outOfSample: { ...emptyBt(), sharpe_ratio: 0, total_pnl: 0, total_trades: 0, win_rate: 0, max_drawdown: 0 },
      byRegime: {},
      summaryStats: { totalWindows: 0, avgInSampleSharpe: 0, avgOutSampleSharpe: 0, degradationRatio: 0, regimeDiversity: 0 },
    },
  } as unknown as WalkForwardResult)),
  classifyRegime: vi.fn(() => RegimeLabel.TREND_UP),
  computeFeatures: vi.fn(async () => []),
  labelTripleBarrier: vi.fn(async () => []),
};

describe('runExperiment', () => {
  it('returns completed status with metrics from each period', async () => {
    const trainBt = emptyBt({ sharpe_ratio: 1.2, total_pnl: 50, total_trades: 5, win_rate: 0.5, max_drawdown: 0.05 });
    const valBt = emptyBt({ sharpe_ratio: 1.4, total_pnl: 80, total_trades: 8, win_rate: 0.55, max_drawdown: 0.07 });
    const testBt = emptyBt({ sharpe_ratio: 1.8, total_pnl: 120, total_trades: 12, win_rate: 0.7, max_drawdown: 0.12 });

    const deps: ExperimentDeps = {
      ...baseDeps,
      runBacktest: vi.fn(async (_candles: unknown[], opts: Record<string, unknown>) => {
        if ((opts.period as { start: string }).start === '2024-01-01') return trainBt;
        if ((opts.period as { start: string }).start === '2024-04-01') return valBt;
        return testBt;
      }),
    };

    const result = await runExperiment(makeExperiment(), deps);

    expect(result.status).toBe('completed');
    expect(result.experimentId).toBe('exp-001');
    expect(result.trainMetrics.sharpe).toBeCloseTo(1.2);
    expect(result.validationMetrics.sharpe).toBeCloseTo(1.4);
    expect(result.testMetrics.sharpe).toBeCloseTo(1.8);
    expect(result.artifacts).toContain('experiments/exp-001/result.json');
  });

  it('surfaces error message when backtest fails', async () => {
    const deps: ExperimentDeps = {
      ...baseDeps,
      runBacktest: vi.fn(async () => {
        throw new Error('data fetch failed');
      }),
    };

    const result = await runExperiment(makeExperiment(), deps);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('data fetch failed');
    expect(result.testMetrics.tradeCount).toBe(0);
    expect(result.artifacts).toEqual([]);
  });

  it('computes symbolPerformance from test backtest', async () => {
    const testBt = emptyBt({ total_pnl: 250, total_trades: 2, trades_json: [mkTrade(50), mkTrade(200)] });
    const deps: ExperimentDeps = {
      ...baseDeps,
      runBacktest: vi.fn(async () => testBt),
    };

    const result = await runExperiment(makeExperiment(), deps);

    expect(result.symbolPerformance['BTC/USDT'].totalPnl).toBeCloseTo(250);
    expect(result.symbolPerformance['BTC/USDT'].tradeCount).toBe(2);
  });

  it('captures regimePerformance via classifyRegime', async () => {
    const btWithTrades = emptyBt({
      trades_json: [mkTrade(10)],
      total_trades: 1,
      total_pnl: 10,
    });
    const deps: ExperimentDeps = {
      ...baseDeps,
      runBacktest: vi.fn(async () => btWithTrades),
      classifyRegime: vi.fn(() => RegimeLabel.HIGH_VOLATILITY),
    };

    const result = await runExperiment(makeExperiment(), deps);

    expect(result.regimePerformance[RegimeLabel.HIGH_VOLATILITY]).toBeDefined();
    expect(result.regimePerformance[RegimeLabel.HIGH_VOLATILITY].sampleCount).toBe(1);
  });

  it('produces a deterministic experimentHash for identical inputs', async () => {
    const exp = makeExperiment({ randomSeed: 42, gitCommit: 'abc123' });

    const first = await runExperiment(exp, baseDeps);
    const second = await runExperiment(exp, baseDeps);

    expect(first.experimentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.experimentHash).toBe(first.experimentHash);
  });

  it('produces a deterministic experimentHash without gitCommit', async () => {
    const exp = makeExperiment({ randomSeed: 42 });

    const first = await runExperiment(exp, baseDeps);
    const second = await runExperiment(exp, baseDeps);

    expect(first.experimentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.experimentHash).toBe(first.experimentHash);
  });

  it('produces different hashes when gitCommit differs', async () => {
    const withCommit = await runExperiment(makeExperiment({ randomSeed: 42, gitCommit: 'abc123' }), baseDeps);
    const withoutCommit = await runExperiment(makeExperiment({ randomSeed: 42 }), baseDeps);

    expect(withCommit.experimentHash).not.toBe(withoutCommit.experimentHash);
  });

  it('produces different hashes when seed or config differs', async () => {
    const base = await runExperiment(makeExperiment({ randomSeed: 42 }), baseDeps);
    const otherSeed = await runExperiment(makeExperiment({ randomSeed: 43 }), baseDeps);
    const otherConfig = await runExperiment(
      makeExperiment({ randomSeed: 42, configSnapshot: { lr: 0.01 } }),
      baseDeps,
    );

    expect(otherSeed.experimentHash).not.toBe(base.experimentHash);
    expect(otherConfig.experimentHash).not.toBe(base.experimentHash);
  });

  it('populates falsificationReason from gate output on failed runs', async () => {
    const deps: ExperimentDeps = {
      ...baseDeps,
      runBacktest: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    const result = await runExperiment(makeExperiment(), deps, {
      gateReason: 'Failed 3/8 checks: min_trades, min_sharpe',
    });

    expect(result.status).toBe('failed');
    expect(result.falsificationReason).toBe('Failed 3/8 checks: min_trades, min_sharpe');
    expect(result.error).toBe('boom');
    expect(result.experimentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to the error message when no gate reason is provided', async () => {
    const deps: ExperimentDeps = {
      ...baseDeps,
      runBacktest: vi.fn(async () => {
        throw new Error('boom');
      }),
    };

    const result = await runExperiment(makeExperiment(), deps);

    expect(result.status).toBe('failed');
    expect(result.falsificationReason).toBe('boom');
  });
});