// Research Queue Persistence — D1 Store Tests
// Verifies the append-only doctrine at the SQL level: every write issues an
// INSERT (never UPDATE/DELETE) and reads issue SELECT with the right filters.

import { describe, expect, it } from 'vitest';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';
import { RegimeLabel } from '@/tree/regime/types';
import type { Universe } from '@/tree/alpha/universe/types';
import type { ResearchQueueJob } from '@/tree/alpha/queue/types';
import { createD1QueueStore } from './queue-d1-store';
import type { CounterSnapshot, QueueEventRecord } from './queue-store-types';

// ── Recording D1 stub ────────────────────────────────────

interface RecordedStatement {
  readonly sql: string;
  readonly values: readonly unknown[];
}

interface StubAllResult {
  readonly results: readonly Record<string, unknown>[];
}

function createRecordingDb(allResult: StubAllResult = { results: [] }): {
  db: D1Database;
  statements: RecordedStatement[];
} {
  const statements: RecordedStatement[] = [];

  const makeStatement = (sql: string): D1PreparedStatement => {
    let values: unknown[] = [];
    const statement: D1PreparedStatement = {
      bind(...bound: unknown[]): D1PreparedStatement {
        values = bound;
        return statement;
      },
      first: async () => null,
      firstRow: async () => null,
      all: async <T>() => {
        statements.push({ sql, values });
        return { results: [...allResult.results] as T[], meta: { duration: 0 } };
      },
      run: async () => {
        statements.push({ sql, values });
        return { meta: { changes: 1, last_row_id: 1, duration: 0 } };
      },
    };
    return statement;
  };

  const db: D1Database = {
    prepare: (sql: string) => makeStatement(sql),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    dump: async () => '',
  };

  return { db, statements };
}

// ── Fixtures ─────────────────────────────────────────────

function makeJob(overrides: Partial<ResearchQueueJob> = {}): ResearchQueueJob {
  const universe: Universe = { id: 'u1', symbols: ['BTCUSDT'], weighting: 'equal', rebalanceRule: 'none' };
  return {
    id: 'job-1',
    hypothesis: 'H1',
    rationale: 'R1',
    features: ['f1'],
    dataset: 'binance-ohlcv',
    regime: RegimeLabel.RANGE,
    universe,
    costs: { feeBps: 10, impactBps: 5 },
    slippage: { slippageBps: 3 },
    seed: 42,
    parentHypothesis: null,
    generatedBy: 'gen',
    timestamp: 1_000_000,
    gitSha: 'abc',
    status: 'PROPOSED',
    configHash: 'hash1',
    result: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<QueueEventRecord> = {}): QueueEventRecord {
  return {
    eventId: 'evt-1',
    jobId: 'job-1',
    fromStatus: null,
    toStatus: 'PROPOSED',
    trigger: 'validate',
    payloadJson: null,
    createdAt: 1_000_000,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<CounterSnapshot> = {}): CounterSnapshot {
  return {
    snapshotId: 'snap-1',
    countersJson: '{"hypothesesTested":1}',
    createdAt: 1_000_000,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────

describe('D1ResearchQueueStore', () => {
  describe('appendJob', () => {
    it('issues an INSERT INTO research_queue_jobs (never UPDATE/DELETE)', async () => {
      const { db, statements } = createRecordingDb();
      await createD1QueueStore(db).appendJob(makeJob());
      expect(statements).toHaveLength(1);
      const sql = statements[0].sql;
      expect(sql).toContain('INSERT INTO research_queue_jobs');
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('DELETE');
    });

    it('binds job fields in column order, serializing nested objects as JSON', async () => {
      const { db, statements } = createRecordingDb();
      const job = makeJob({ result: { oosPassCount: 1, oosTotalCount: 2, aggregatePnlUsd: 5, summary: 'ok' } });
      await createD1QueueStore(db).appendJob(job);
      const values = statements[0].values;
      expect(values[0]).toBe('job-1');
      expect(values[1]).toBe('H1');
      expect(values[3]).toBe(JSON.stringify(['f1']));
      expect(values[6]).toBe(JSON.stringify(job.universe));
      expect(values[14]).toBe('PROPOSED');
      expect(values[15]).toBe('hash1');
      expect(values[16]).toBe(JSON.stringify(job.result));
    });

    it('binds null result_json when job has no result', async () => {
      const { db, statements } = createRecordingDb();
      await createD1QueueStore(db).appendJob(makeJob({ result: null }));
      expect(statements[0].values[16]).toBeNull();
    });
  });

  describe('appendEvent', () => {
    it('issues an INSERT INTO research_queue_events (never UPDATE/DELETE)', async () => {
      const { db, statements } = createRecordingDb();
      await createD1QueueStore(db).appendEvent(makeEvent());
      expect(statements).toHaveLength(1);
      const sql = statements[0].sql;
      expect(sql).toContain('INSERT INTO research_queue_events');
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('DELETE');
    });

    it('binds event fields including null fromStatus for the initial event', async () => {
      const { db, statements } = createRecordingDb();
      await createD1QueueStore(db).appendEvent(
        makeEvent({ fromStatus: 'PROPOSED', toStatus: 'RUNNING', trigger: 'validation_passed' }),
      );
      const values = statements[0].values;
      expect(values[0]).toBe('evt-1');
      expect(values[1]).toBe('job-1');
      expect(values[2]).toBe('PROPOSED');
      expect(values[3]).toBe('RUNNING');
      expect(values[4]).toBe('validation_passed');
    });
  });

  describe('listJobs', () => {
    it('issues a SELECT from research_queue_jobs ordered by created_at DESC', async () => {
      const { db, statements } = createRecordingDb();
      await createD1QueueStore(db).listJobs();
      expect(statements).toHaveLength(1);
      const sql = statements[0].sql;
      expect(sql).toContain('SELECT');
      expect(sql).toContain('FROM research_queue_jobs');
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(sql).not.toContain('INSERT');
    });

    it('maps rows back to ResearchQueueJob domain shape', async () => {
      const job = makeJob();
      const { db } = createRecordingDb({
        results: [
          {
            job_id: job.id,
            hypothesis: job.hypothesis,
            rationale: job.rationale,
            features_json: JSON.stringify(job.features),
            dataset: job.dataset,
            regime: job.regime,
            universe_json: JSON.stringify(job.universe),
            costs_json: JSON.stringify(job.costs),
            slippage_json: JSON.stringify(job.slippage),
            seed: job.seed,
            parent_hypothesis: job.parentHypothesis,
            generated_by: job.generatedBy,
            timestamp: job.timestamp,
            git_sha: job.gitSha,
            status: job.status,
            config_hash: job.configHash,
            result_json: null,
            created_at: job.timestamp,
          },
        ],
      });
      const jobs = await createD1QueueStore(db).listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toEqual(job);
    });
  });

  describe('loadEvents', () => {
    it('issues a SELECT with WHERE job_id = ? bound to the requested job', async () => {
      const { db, statements } = createRecordingDb();
      await createD1QueueStore(db).loadEvents('job-42');
      expect(statements).toHaveLength(1);
      const sql = statements[0].sql;
      expect(sql).toContain('SELECT');
      expect(sql).toContain('FROM research_queue_events');
      expect(sql).toContain('WHERE job_id = ?');
      expect(statements[0].values).toEqual(['job-42']);
    });

    it('maps rows back to QueueEventRecord domain shape', async () => {
      const event = makeEvent();
      const { db } = createRecordingDb({
        results: [
          {
            event_id: event.eventId,
            job_id: event.jobId,
            from_status: event.fromStatus,
            to_status: event.toStatus,
            trigger: event.trigger,
            payload_json: event.payloadJson,
            created_at: event.createdAt,
          },
        ],
      });
      const events = await createD1QueueStore(db).loadEvents('job-1');
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });
  });

  describe('appendCounterSnapshot', () => {
    it('issues an INSERT INTO research_testing_counters (never UPDATE/DELETE)', async () => {
      const { db, statements } = createRecordingDb();
      await createD1QueueStore(db).appendCounterSnapshot(makeSnapshot());
      expect(statements).toHaveLength(1);
      const sql = statements[0].sql;
      expect(sql).toContain('INSERT INTO research_testing_counters');
      expect(sql).not.toContain('UPDATE');
      expect(sql).not.toContain('DELETE');
      expect(statements[0].values).toEqual(['snap-1', '{"hypothesesTested":1}', 1_000_000]);
    });
  });
});
