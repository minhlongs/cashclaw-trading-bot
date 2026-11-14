import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionBudgetGuard, type LeaseD1DatabaseLike } from './ee/scheduler/d1-lease-store';
import type { WorkerEnv } from './worker-env';

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock('@/lib/logger', () => ({ createLogger: () => mockLogger }));

const mockDrainQueues = vi.fn();
vi.mock('./tree/bot', () => ({ getBotManager: vi.fn(() => ({ drainQueues: mockDrainQueues })) }));

const mockRunMicroIngest = vi.fn();
vi.mock('./forest/alpha/microstructure/ingest-pipeline', () => ({
  runMicroIngest: (...args: unknown[]) => mockRunMicroIngest(...args),
}));
vi.mock('./forest/alpha/persistence/micro-d1-store', () => ({ createD1MicroStore: vi.fn(() => ({})) }));
vi.mock('./forest/alpha/microstructure/binance-rest', () => ({ fetchDepth: vi.fn(), fetchAggTrades: vi.fn() }));

import { cronSchedulerCoordinator, scheduled } from './worker-cron';

function makeBusyD1(): LeaseD1DatabaseLike {
  return {
    prepare() {
      const stmt = {
        bind: () => stmt,
        first: async () => null,
        run: async () => { throw new Error('SQLITE_BUSY: database is locked'); },
      };
      return stmt;
    },
  };
}

function makeStatefulLeaseD1(initialToken = 6): { db: LeaseD1DatabaseLike; getReleasedTokens: () => number[] } {
  let holder: string | null = null;
  let acquiredAtMs = 0;
  let expiresAtMs = 0;
  let token = initialToken;
  const releasedTokens: number[] = [];

  const db: LeaseD1DatabaseLike = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) { bound = values; return stmt; },
        async first<T = unknown>(): Promise<T | null> {
          if (!holder) return null;
          return {
            bot_id: 'cron-queue-drainer', workspace_id: 'global-cloud', holder_id: holder,
            fencing_token: token, acquired_at_ms: acquiredAtMs, expires_at_ms: expiresAtMs,
          } as unknown as T;
        },
        async run(): Promise<{ meta: { changes: number } }> {
          if (sql.includes('INSERT INTO scheduler_bot_leases')) {
            const nowMs = Number(bound[0]);
            if (expiresAtMs > nowMs) return { meta: { changes: 0 } };
            holder = String(bound[3]);
            acquiredAtMs = nowMs;
            expiresAtMs = Number(bound[4]);
            token += 1;
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE scheduler_bot_leases SET expires_at_ms')) {
            const nowMs = Number(bound[0]);
            const reqToken = Number(bound[3]);
            if (holder === String(bound[2]) && token === reqToken && expiresAtMs > nowMs) {
              expiresAtMs = nowMs;
              releasedTokens.push(reqToken);
              return { meta: { changes: 1 } };
            }
          }
          return { meta: { changes: 0 } };
        },
      };
      return stmt;
    },
  };
  return { db, getReleasedTokens: () => releasedTokens };
}

function mkCronEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: undefined,
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('not found', { status: 404 })) },
    CLOUD_LEASE_ENABLED: 'true', ISOLATE_ID: 'iso-prod-1',
    ...overrides,
  };
}

describe('worker-cron scheduled() — fail-closed D1 lease, fencing release & ExecutionBudgetGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    cronSchedulerCoordinator.clearLeases();
    mockDrainQueues.mockResolvedValue({ binance: { processed: 2, skipped: 0, pending: 0 } });
    mockRunMicroIngest.mockResolvedValue({
      startedAt: 1_000, finishedAt: 1_010,
      outcomes: [{ symbol: 'BTCUSDT', status: 'OK', reason: null, depthRows: 1, tradeChunks: 1, vectors: 1 }],
    });
  });

  it('aborts fail-closed when env.DB throws SQLITE_BUSY (LEASE_D1_ERROR) with 0 drainQueues calls and zero in-memory fallback', async () => {
    const inMemorySpy = vi.spyOn(cronSchedulerCoordinator, 'acquireTickLease');
    await scheduled({ scheduledTime: 1_760_000_000_000 }, mkCronEnv({ DB: makeBusyD1() as unknown as WorkerEnv['DB'] }));

    expect(mockDrainQueues).not.toHaveBeenCalled();
    expect(inMemorySpy).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'cron lease failed (fail-closed)',
      expect.objectContaining({ message: expect.stringContaining('LEASE_D1_ERROR: SQLITE_BUSY') }),
      expect.objectContaining({ action: 'cron-lease-abort' }),
    );
  });

  it('skips duplicate ticks on both durable D1 lease and unbound in-memory lease', async () => {
    const { db } = makeStatefulLeaseD1(0);
    await cronSchedulerCoordinator.acquireDurableTickLease(
      { botId: 'cron-queue-drainer', workspaceId: 'global-cloud', isolateId: 'iso-other', nowMs: 1_760_000_000_000 }, db,
    );
    await scheduled({ scheduledTime: 1_760_000_005_000 }, mkCronEnv({ DB: db as unknown as WorkerEnv['DB'] }));
    expect(mockDrainQueues).not.toHaveBeenCalled();

    cronSchedulerCoordinator.clearLeases();
    await scheduled({ scheduledTime: 1_760_060_000_000 }, mkCronEnv({ DB: undefined, ISOLATE_ID: 'iso-1' }));
    await scheduled({ scheduledTime: 1_760_060_005_000 }, mkCronEnv({ DB: undefined, ISOLATE_ID: 'iso-2' }));
    expect(mockDrainQueues).toHaveBeenCalledTimes(1);
  });

  it('executes drainQueues under ExecutionBudgetGuard and releases durable lease with exact fencingToken even when drainQueues throws', async () => {
    const { db, getReleasedTokens } = makeStatefulLeaseD1(6);
    const releaseSpy = vi.spyOn(cronSchedulerCoordinator, 'releaseDurableTickLease');

    await scheduled({ scheduledTime: Date.now() }, mkCronEnv({ DB: db as unknown as WorkerEnv['DB'] }));
    expect(mockDrainQueues).toHaveBeenCalledTimes(1);
    expect(releaseSpy).toHaveBeenCalledWith('cron-queue-drainer', 'iso-prod-1', 7, expect.any(Number), db);
    expect(getReleasedTokens()).toEqual([7]);

    mockDrainQueues.mockRejectedValueOnce(new Error('Queue adapter explosion'));
    await scheduled({ scheduledTime: Date.now() + 50 }, mkCronEnv({ DB: db as unknown as WorkerEnv['DB'] }));
    expect(releaseSpy).toHaveBeenLastCalledWith('cron-queue-drainer', 'iso-prod-1', 8, expect.any(Number), db);
    expect(getReleasedTokens()).toEqual([7, 8]);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'cron tick aborted',
      expect.objectContaining({ message: expect.stringContaining('TICK_EXECUTION_FAILED: Queue adapter explosion') }),
      expect.objectContaining({ action: 'cron-tick-abort' }),
    );
  });

  it('halts work cleanly when ExecutionBudgetGuard trips (maxRecursionDepth or maxSubrequests) and still releases durable lease', async () => {
    const { db, getReleasedTokens } = makeStatefulLeaseD1(10);

    vi.spyOn(cronSchedulerCoordinator, 'createExecutionBudgetGuard').mockReturnValueOnce(new ExecutionBudgetGuard({ maxRecursionDepth: 0 }));
    await scheduled({ scheduledTime: Date.now() }, mkCronEnv({ DB: db as unknown as WorkerEnv['DB'] }));
    expect(mockDrainQueues).not.toHaveBeenCalled();
    expect(getReleasedTokens()).toEqual([11]);

    vi.spyOn(cronSchedulerCoordinator, 'createExecutionBudgetGuard').mockReturnValueOnce(new ExecutionBudgetGuard({ maxSubrequests: 0 }));
    await scheduled({ scheduledTime: Date.now() + 50 }, mkCronEnv({ DB: db as unknown as WorkerEnv['DB'] }));
    expect(mockDrainQueues).not.toHaveBeenCalled();
    expect(getReleasedTokens()).toEqual([11, 12]);

    vi.spyOn(cronSchedulerCoordinator, 'createExecutionBudgetGuard').mockReturnValueOnce(new ExecutionBudgetGuard({ maxSubrequests: 2 }));
    await scheduled(
      { scheduledTime: Date.now() + 100 },
      mkCronEnv({ DB: db as unknown as WorkerEnv['DB'], MICRO_INGEST_ENABLED: 'true', MICRO_INGEST_SYMBOLS: 'BTCUSDT,ETHUSDT' }),
    );
    expect(mockDrainQueues).toHaveBeenCalledTimes(1);
    expect(mockRunMicroIngest).not.toHaveBeenCalled();
    expect(getReleasedTokens()).toEqual([11, 12, 13]);

    mockRunMicroIngest.mockImplementationOnce(async (deps: {
      fetchDepth: (s: string) => Promise<unknown>; fetchTrades: (s: string, a: number, b: number) => Promise<unknown>; now: () => number;
    }) => {
      await deps.fetchDepth('BTCUSDT');
      await deps.fetchTrades('BTCUSDT', 1000, 2000);
      const ts = deps.now();
      return { startedAt: ts, finishedAt: ts + 5, outcomes: [{ symbol: 'BTCUSDT', status: 'OK', reason: null, depthRows: 1, tradeChunks: 1, vectors: 1 }] };
    });
    await scheduled(
      { scheduledTime: Date.now() + 150 },
      mkCronEnv({ DB: db as unknown as WorkerEnv['DB'], MICRO_INGEST_ENABLED: 'true', MICRO_INGEST_SYMBOLS: 'BTCUSDT' }),
    );
    expect(mockRunMicroIngest).toHaveBeenCalledTimes(1);
    expect(getReleasedTokens()).toEqual([11, 12, 13, 14]);

    mockRunMicroIngest.mockRejectedValueOnce(new Error('Binance REST timeout'));
    vi.spyOn(cronSchedulerCoordinator, 'releaseDurableTickLease').mockResolvedValueOnce({ ok: false, error: 'LEASE_D1_ERROR: transient release timeout' });
    await scheduled({ scheduledTime: Date.now() + 200 }, mkCronEnv({ DB: db as unknown as WorkerEnv['DB'], MICRO_INGEST_ENABLED: 'true' }));
    expect(mockLogger.error).toHaveBeenCalledWith('micro-ingest crashed (isolated)', expect.objectContaining({ message: 'Binance REST timeout' }), expect.objectContaining({ action: 'micro-ingest' }));
    expect(mockLogger.warn).toHaveBeenCalledWith('LEASE_D1_ERROR: transient release timeout', expect.objectContaining({ action: 'cron-lease-release' }));
  });
});
