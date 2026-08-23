// Multiple-Testing Defense — Counters Tests
// Covers: computeCounters đúng distinct counts (hypotheses/configs/datasets/regimes/assets) + summed oosPasses;
// incrementForJob monotonic

import { describe, expect, it } from 'vitest';
import {
  computeCounters,
  incrementForJob,
  emptyCounters,
} from './counters';
import type {
  ResearchCosts,
  ResearchEntry,
  ResearchRegistry,
  ResearchSlippage,
} from '@/tree/alpha/registry/types';
import type {
  QueueState,
  ResearchQueue,
  ResearchQueueJob,
} from '@/tree/alpha/queue/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { Universe } from '@/tree/alpha/universe/types';
import type { CounterKnownSets } from './types';

function emptyKnownSets(): CounterKnownSets {
  return { hypotheses: [], configurations: [], datasets: [], regimes: [], assets: [] };
}

// ── Helpers ──────────────────────────────────────────────
function makeCosts(): ResearchCosts { return { feeBps: 10, impactBps: 5 }; }
function makeSlippage(): ResearchSlippage { return { slippageBps: 3 }; }
function makeUniverse(symbols: string[]): Universe {
  return { id: 'u1', symbols, weighting: 'equal', rebalanceRule: 'none' };
}
function makeQueueJob(overrides: Partial<ResearchQueueJob> = {}): ResearchQueueJob {
  return {
    id: 'queue-1',
    hypothesis: 'H1',
    rationale: 'R1',
    features: ['f1'],
    dataset: 'ds1',
    regime: RegimeLabel.RANGE,
    universe: makeUniverse(['BTCUSDT']),
    costs: makeCosts(),
    slippage: makeSlippage(),
    seed: 42,
    parentHypothesis: null,
    generatedBy: 'gen',
    timestamp: 1_000_000,
    gitSha: 'abc',
    status: 'PROPOSED' as QueueState,
    configHash: 'hash1',
    result: null,
    ...overrides,
  };
}
function makeRegistryEntry(overrides: Partial<ResearchEntry> = {}): ResearchEntry {
  return {
    id: 'reg-1',
    hypothesis: 'H1',
    dataSources: ['binance-ohlcv'],
    featureSet: ['f1'],
    regime: 'RANGE',
    trainPeriod: { start: '2024-01-01', end: '2024-06-30' },
    validationPeriod: { start: '2024-07-01', end: '2024-09-30' },
    oosPeriod: { start: '2024-10-01', end: '2024-12-31' },
    costs: makeCosts(),
    slippage: makeSlippage(),
    seed: 42,
    gitCommit: 'abc',
    result: { oosPassCount: 2, oosTotalCount: 5, aggregatePnlUsd: 100, summary: 'pass' },
    falsificationReason: null,
    status: 'SURVIVED',
    reproducibility: 'full',
    ...overrides,
  };
}

describe('emptyCounters', () => {
  it('returns zeroed counters', () => {
    const c = emptyCounters();
    expect(c.hypothesesTested).toBe(0);
    expect(c.configurations).toBe(0);
    expect(c.datasets).toBe(0);
    expect(c.regimes).toBe(0);
    expect(c.assets).toBe(0);
    expect(c.oosPasses).toBe(0);
  });
});

describe('incrementForJob', () => {
  it('increments all distinct counts for first job', () => {
    const job = makeQueueJob({
      hypothesis: 'H1',
      configHash: 'cfg1',
      dataset: 'ds1',
      regime: RegimeLabel.TREND_UP,
      universe: makeUniverse(['BTCUSDT', 'ETHUSDT']),
      result: { oosPassCount: 1, oosTotalCount: 3, aggregatePnlUsd: 50, summary: 'pass' },
    });
    const c = incrementForJob(emptyCounters(), job);
    expect(c.hypothesesTested).toBe(1);
    expect(c.configurations).toBe(1);
    expect(c.datasets).toBe(1);
    expect(c.regimes).toBe(1);
    expect(c.assets).toBe(2);
    expect(c.oosPasses).toBe(1);
  });

  it('does not double-count same hypothesis when known sets accumulated', () => {
    const job1 = makeQueueJob({ hypothesis: 'H1', configHash: 'cfg1' });
    const job2 = makeQueueJob({ hypothesis: 'H1', configHash: 'cfg2', id: 'job-2' });
    const known = emptyKnownSets();
    const c1 = incrementForJob(emptyCounters(), job1, known);
    const c2 = incrementForJob(c1, job2, {
      hypotheses: [...known.hypotheses, job1.hypothesis],
      configurations: [...known.configurations, job1.configHash],
      datasets: [...known.datasets, job1.dataset],
      regimes: [...known.regimes, job1.regime],
      assets: [...known.assets, ...job1.universe.symbols],
    });
    expect(c2.hypothesesTested).toBe(1); // same hypothesis
    expect(c2.configurations).toBe(2); // different configs
  });

  it('does not double-count same config hash when known sets accumulated', () => {
    const job1 = makeQueueJob({ hypothesis: 'H1', configHash: 'cfg1' });
    const job2 = makeQueueJob({ hypothesis: 'H2', configHash: 'cfg1', id: 'job-2' });
    const known = emptyKnownSets();
    const c1 = incrementForJob(emptyCounters(), job1, known);
    const c2 = incrementForJob(c1, job2, {
      hypotheses: [...known.hypotheses, job1.hypothesis],
      configurations: [...known.configurations, job1.configHash],
      datasets: [...known.datasets, job1.dataset],
      regimes: [...known.regimes, job1.regime],
      assets: [...known.assets, ...job1.universe.symbols],
    });
    expect(c2.hypothesesTested).toBe(2);
    expect(c2.configurations).toBe(1); // same config
  });

  it('does not double-count same dataset when known sets accumulated', () => {
    const job1 = makeQueueJob({ dataset: 'ds1', configHash: 'cfg1' });
    const job2 = makeQueueJob({ dataset: 'ds1', configHash: 'cfg2', id: 'job-2' });
    const known = emptyKnownSets();
    const c1 = incrementForJob(emptyCounters(), job1, known);
    const c2 = incrementForJob(c1, job2, {
      hypotheses: [...known.hypotheses, job1.hypothesis],
      configurations: [...known.configurations, job1.configHash],
      datasets: [...known.datasets, job1.dataset],
      regimes: [...known.regimes, job1.regime],
      assets: [...known.assets, ...job1.universe.symbols],
    });
    expect(c2.datasets).toBe(1);
  });

  it('does not double-count same regime when known sets accumulated', () => {
    const job1 = makeQueueJob({ regime: RegimeLabel.RANGE, configHash: 'cfg1' });
    const job2 = makeQueueJob({ regime: RegimeLabel.RANGE, configHash: 'cfg2', id: 'job-2' });
    const known = emptyKnownSets();
    const c1 = incrementForJob(emptyCounters(), job1, known);
    const c2 = incrementForJob(c1, job2, {
      hypotheses: [...known.hypotheses, job1.hypothesis],
      configurations: [...known.configurations, job1.configHash],
      datasets: [...known.datasets, job1.dataset],
      regimes: [...known.regimes, job1.regime],
      assets: [...known.assets, ...job1.universe.symbols],
    });
    expect(c2.regimes).toBe(1);
  });

  it('accumulates assets across jobs when known sets accumulated', () => {
    const job1 = makeQueueJob({ universe: makeUniverse(['BTCUSDT']), configHash: 'cfg1' });
    const job2 = makeQueueJob({ universe: makeUniverse(['ETHUSDT']), configHash: 'cfg2', id: 'job-2' });
    const known = emptyKnownSets();
    const c1 = incrementForJob(emptyCounters(), job1, known);
    const c2 = incrementForJob(c1, job2, {
      hypotheses: [...known.hypotheses, job1.hypothesis],
      configurations: [...known.configurations, job1.configHash],
      datasets: [...known.datasets, job1.dataset],
      regimes: [...known.regimes, job1.regime],
      assets: [...known.assets, ...job1.universe.symbols],
    });
    expect(c2.assets).toBe(2);
  });

  it('sums oosPasses across jobs', () => {
    const job1 = makeQueueJob({ result: { oosPassCount: 2, oosTotalCount: 3, aggregatePnlUsd: 10, summary: '' }, configHash: 'cfg1' });
    const job2 = makeQueueJob({ result: { oosPassCount: 3, oosTotalCount: 4, aggregatePnlUsd: 20, summary: '' }, configHash: 'cfg2', id: 'job-2' });
    let c = emptyCounters();
    c = incrementForJob(c, job1);
    c = incrementForJob(c, job2);
    expect(c.oosPasses).toBe(5);
  });

  it('job with null result adds 0 oosPasses', () => {
    const job = makeQueueJob({ result: null, configHash: 'cfg1' });
    const c = incrementForJob(emptyCounters(), job);
    expect(c.oosPasses).toBe(0);
  });

  it('monotonic: each call returns equal or greater counts', () => {
    let c = emptyCounters();
    for (let i = 0; i < 10; i++) {
      const before = { ...c };
      c = incrementForJob(c, makeQueueJob({ hypothesis: `H${i}`, configHash: `cfg${i}`, id: `job-${i}` }));
      expect(c.hypothesesTested).toBeGreaterThanOrEqual(before.hypothesesTested);
      expect(c.configurations).toBeGreaterThanOrEqual(before.configurations);
      expect(c.datasets).toBeGreaterThanOrEqual(before.datasets);
      expect(c.regimes).toBeGreaterThanOrEqual(before.regimes);
      expect(c.assets).toBeGreaterThanOrEqual(before.assets);
      expect(c.oosPasses).toBeGreaterThanOrEqual(before.oosPasses);
    }
  });

  it('respects known sets passed in', () => {
    const job = makeQueueJob({ hypothesis: 'H1', configHash: 'cfg1' });
    const known = {
      hypotheses: ['H0'],
      configurations: ['cfg0'],
      datasets: ['ds0'],
      regimes: ['RANGE'],
      assets: ['BTCUSDT'],
    };
    const c = incrementForJob(emptyCounters(), job, known);
    expect(c.hypothesesTested).toBe(2); // H0 + H1
    expect(c.configurations).toBe(2); // cfg0 + cfg1
    expect(c.datasets).toBe(2); // ds0 + ds1
    expect(c.regimes).toBe(1); // RANGE (job has RANGE, known has RANGE)
    expect(c.assets).toBe(1); // BTCUSDT deduped across known + job
  });
});

describe('computeCounters', () => {
  it('combines registry and queue counts', () => {
    const registry: ResearchRegistry = {
      entries: [
        makeRegistryEntry({ id: 'reg-1', hypothesis: 'H1', result: { oosPassCount: 2, oosTotalCount: 5, aggregatePnlUsd: 100, summary: '' } }),
        makeRegistryEntry({ id: 'reg-2', hypothesis: 'H2', dataSources: ['bybit-ohlcv'], regime: 'TREND_UP', result: { oosPassCount: 1, oosTotalCount: 4, aggregatePnlUsd: 50, summary: '' } }),
      ],
      counts: { PROPOSED: 0, RUNNING: 0, SURVIVED: 2, FALSIFIED: 0, ARCHIVED: 0 },
    };
    const queue: ResearchQueue = {
      jobs: [
        makeQueueJob({ hypothesis: 'H3', configHash: 'cfg3', dataset: 'ds3', regime: RegimeLabel.RANGE, universe: makeUniverse(['SOLUSDT']), result: { oosPassCount: 3, oosTotalCount: 5, aggregatePnlUsd: 200, summary: '' } }),
        makeQueueJob({ hypothesis: 'H1', configHash: 'cfg4', id: 'job-2', universe: makeUniverse(['ADAUSDT']) }), // same hypothesis as reg-1
      ],
    };
    const c = computeCounters(registry, queue);
    // hypotheses: H1, H2, H3 = 3 (H1 appears in both)
    expect(c.hypothesesTested).toBe(3);
    // configurations: reg-1, reg-2, cfg3, cfg4 = 4 (each registry entry has unique id, queue has config hashes)
    expect(c.configurations).toBe(4);
    // datasets: binance-ohlcv, bybit-ohlcv, ds3, ds1 (job-2 default) = 4
    expect(c.datasets).toBe(4);
    // regimes: RANGE, TREND_UP = 2
    expect(c.regimes).toBe(2);
    // assets: registry entries carry no asset field — only queue jobs
    // contribute: SOLUSDT, ADAUSDT = 2
    expect(c.assets).toBe(2);
    // oosPasses: 2 + 1 + 3 + 0 = 6
    expect(c.oosPasses).toBe(6);
  });

  it('empty registry and queue → zero counters', () => {
    const registry: ResearchRegistry = { entries: [], counts: { PROPOSED: 0, RUNNING: 0, SURVIVED: 0, FALSIFIED: 0, ARCHIVED: 0 } };
    const queue: ResearchQueue = { jobs: [] };
    const c = computeCounters(registry, queue);
    expect(c.hypothesesTested).toBe(0);
    expect(c.configurations).toBe(0);
    expect(c.datasets).toBe(0);
    expect(c.regimes).toBe(0);
    expect(c.assets).toBe(0);
    expect(c.oosPasses).toBe(0);
  });

  it('registry with multiple data sources combines with | separator', () => {
    const registry: ResearchRegistry = {
      entries: [
        makeRegistryEntry({ id: 'reg-1', dataSources: ['binance-ohlcv', 'funding-rate'] }),
        makeRegistryEntry({ id: 'reg-2', dataSources: ['binance-ohlcv', 'funding-rate'] }), // same combined
        makeRegistryEntry({ id: 'reg-3', dataSources: ['bybit-ohlcv'] }),
      ],
      counts: { PROPOSED: 0, RUNNING: 0, SURVIVED: 3, FALSIFIED: 0, ARCHIVED: 0 },
    };
    const queue: ResearchQueue = { jobs: [] };
    const c = computeCounters(registry, queue);
    expect(c.datasets).toBe(2); // 'binance-ohlcv|funding-rate' and 'bybit-ohlcv'
  });
});