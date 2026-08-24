// Ingest pipeline tests — fake store + fake fetchers exercise the full
// poll lifecycle: happy path, fetch failure, parse failure, and incomplete
// trade window (gap → trade features null).

import { describe, expect, it } from 'vitest';
import type { FeatureVector } from '@/tree/alpha/microstructure/types';
import type {
  DepthSnapshotRecord,
  IngestLogRecord,
  MicrostructureStore,
  TradeBatchRecord,
} from '../persistence/micro-store-types';
import { runMicroIngest, type MicroIngestDeps } from './ingest-pipeline';

// ── Fake in-memory store ─────────────────────────────────────────────────────

function createFakeStore(prevLastId: number | null = null): MicrostructureStore & {
  depthRows: DepthSnapshotRecord[];
  tradeBatches: TradeBatchRecord[];
  vectors: FeatureVector[];
  logs: IngestLogRecord[];
} {
  const depthRows: DepthSnapshotRecord[] = [];
  const tradeBatches: TradeBatchRecord[] = [];
  const vectors: FeatureVector[] = [];
  const logs: IngestLogRecord[] = [];

  return {
    depthRows,
    tradeBatches,
    vectors,
    logs,
    appendDepthSnapshot: async (r) => { depthRows.push(r); },
    appendTradeBatch: async (r) => { tradeBatches.push(r); },
    appendFeatureVector: async (v) => { vectors.push(v); },
    appendIngestLog: async (r) => { logs.push(r); },
    loadDepthSeries: async () => [...depthRows],
    loadTradeBatches: async () => [...tradeBatches],
    loadFeatureVectors: async () => [...vectors],
    lastTradeId: async () => prevLastId,
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

const VALID_DEPTH_BODY = {
  lastUpdateId: 42,
  bids: [
    [104_063.99, 0.5],
    [104_062.0, 1.25],
  ],
  asks: [
    [104_064.5, 0.75],
    [104_066.01, 2.0],
  ],
};

function makeTradeBody(startId: number, count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => ({
    a: startId + i,
    p: 104_064.0 + i * 0.1,
    q: 0.01,
    T: NOW - 5000 + i * 100,
    m: i % 2 === 0,
  }));
}

function makeDeps(overrides: Partial<MicroIngestDeps> = {}): MicroIngestDeps {
  return {
    store: createFakeStore(),
    fetchDepth: async () => ({ body: VALID_DEPTH_BODY, latencyMs: 12 }),
    fetchTrades: async () => ({ body: makeTradeBody(100, 5), latencyMs: 8 }),
    now: () => NOW,
    symbols: ['BTCUSDT'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('runMicroIngest', () => {
  it('happy path: persists depth, trades, vector, and OK audit log', async () => {
    const store = createFakeStore();
    const report = await runMicroIngest(makeDeps({ store }));

    expect(report.outcomes).toHaveLength(1);
    const outcome = report.outcomes[0];
    expect(outcome.status).toBe('OK');
    expect(outcome.reason).toBeNull();
    expect(outcome.depthRows).toBe(1);
    expect(outcome.tradeChunks).toBe(1);
    expect(outcome.vectors).toBe(1);

    expect(store.depthRows).toHaveLength(1);
    expect(store.depthRows[0].symbol).toBe('BTCUSDT');
    expect(store.tradeBatches).toHaveLength(1);
    expect(store.tradeBatches[0].complete).toBe(true);
    expect(store.vectors).toHaveLength(1);
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0].status).toBe('OK');
  });

  it('fetch failure: logs FETCH_FAILED, persists nothing', async () => {
    const store = createFakeStore();
    const deps = makeDeps({
      store,
      fetchDepth: async () => { throw new Error('network timeout'); },
    });
    const report = await runMicroIngest(deps);

    const outcome = report.outcomes[0];
    expect(outcome.status).toBe('FETCH_FAILED');
    expect(outcome.reason).toContain('depth fetch failed');
    expect(outcome.depthRows).toBe(0);
    expect(outcome.tradeChunks).toBe(0);
    expect(outcome.vectors).toBe(0);

    expect(store.depthRows).toHaveLength(0);
    expect(store.tradeBatches).toHaveLength(0);
    expect(store.vectors).toHaveLength(0);
    expect(store.logs).toHaveLength(1);
    expect(store.logs[0].status).toBe('FETCH_FAILED');
  });

  it('trades fetch failure: logs FETCH_FAILED independently', async () => {
    const store = createFakeStore();
    const deps = makeDeps({
      store,
      fetchTrades: async () => { throw new Error('503'); },
    });
    const report = await runMicroIngest(deps);

    expect(report.outcomes[0].status).toBe('FETCH_FAILED');
    expect(report.outcomes[0].reason).toContain('trades fetch failed');
    expect(store.logs[0].status).toBe('FETCH_FAILED');
  });

  it('bad depth payload: logs DATA_INVALID, no persistence', async () => {
    const store = createFakeStore();
    const deps = makeDeps({
      store,
      fetchDepth: async () => ({ body: { garbage: true }, latencyMs: 5 }),
    });
    const report = await runMicroIngest(deps);

    const outcome = report.outcomes[0];
    expect(outcome.status).toBe('DATA_INVALID');
    expect(outcome.reason).toContain('depth');
    expect(store.depthRows).toHaveLength(0);
    expect(store.logs[0].status).toBe('DATA_INVALID');
  });

  it('bad trades payload: logs DATA_INVALID, no persistence', async () => {
    const store = createFakeStore();
    const deps = makeDeps({
      store,
      fetchTrades: async () => ({ body: 'not-an-array', latencyMs: 3 }),
    });
    const report = await runMicroIngest(deps);

    expect(report.outcomes[0].status).toBe('DATA_INVALID');
    expect(report.outcomes[0].reason).toContain('trades');
    expect(store.tradeBatches).toHaveLength(0);
  });

  it('crossed book: quality check rejects depth as DATA_INVALID', async () => {
    const store = createFakeStore();
    const crossedDepth = {
      lastUpdateId: 1,
      bids: [[104_065.0, 1.0]],
      asks: [[104_064.0, 1.0]],
    };
    const deps = makeDeps({
      store,
      fetchDepth: async () => ({ body: crossedDepth, latencyMs: 5 }),
    });
    const report = await runMicroIngest(deps);

    expect(report.outcomes[0].status).toBe('DATA_INVALID');
    expect(report.outcomes[0].reason).toContain('crossed');
  });

  it('incomplete trade window (gap): trade features are null in vector', async () => {
    // prevLastId=200 but batch starts at id 300 → gap → incomplete
    const store = createFakeStore(200);
    const gapTrades = makeTradeBody(300, 3);
    const deps = makeDeps({
      store,
      fetchTrades: async () => ({ body: gapTrades, latencyMs: 5 }),
    });
    const report = await runMicroIngest(deps);

    const outcome = report.outcomes[0];
    expect(outcome.status).toBe('OK');
    expect(store.tradeBatches[0].complete).toBe(false);

    // Vector should have trade features as null
    const vec = store.vectors[0];
    expect(vec).toBeDefined();
    expect(vec.features['trade_imbalance']).toBeNull();
    expect(vec.features['aggressive_volume']).toBeNull();
    expect(vec.features['volume_delta']).toBeNull();
    // Orderbook features still computed
    expect(vec.features['bid_ask_spread']).not.toBeNull();
  });

  it('multi-symbol: one failure does not block others', async () => {
    const store = createFakeStore();
    const deps = makeDeps({
      store,
      symbols: ['BTCUSDT', 'ETHUSDT'],
      fetchDepth: async (symbol) => {
        if (symbol === 'ETHUSDT') throw new Error('eth down');
        return { body: VALID_DEPTH_BODY, latencyMs: 10 };
      },
    });
    const report = await runMicroIngest(deps);

    expect(report.outcomes).toHaveLength(2);
    const btc = report.outcomes.find((o) => o.symbol === 'BTCUSDT');
    const eth = report.outcomes.find((o) => o.symbol === 'ETHUSDT');
    expect(btc?.status).toBe('OK');
    expect(eth?.status).toBe('FETCH_FAILED');
  });

  it('resume-point dedupe: only fresh prints are persisted', async () => {
    // prevLastId=102, batch has ids 100-104 → fresh = 103,104
    const store = createFakeStore(102);
    const overlapping = makeTradeBody(100, 5); // ids 100..104
    const deps = makeDeps({
      store,
      fetchTrades: async () => ({ body: overlapping, latencyMs: 5 }),
    });
    await runMicroIngest(deps);

    // Only 2 fresh prints (103, 104) should be in the batch
    expect(store.tradeBatches).toHaveLength(1);
    expect(store.tradeBatches[0].prints).toHaveLength(2);
    expect(store.tradeBatches[0].firstTradeId).toBe(103);
    expect(store.tradeBatches[0].lastTradeId).toBe(104);
  });

  it('report timing: startedAt and finishedAt use injected clock', async () => {
    let tick = NOW;
    const deps = makeDeps({ now: () => tick++ });
    const report = await runMicroIngest(deps);
    expect(report.startedAt).toBe(NOW);
    expect(report.finishedAt).toBeGreaterThan(NOW);
  });
});
