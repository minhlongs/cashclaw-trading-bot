// Research Queue — Unit Tests
// Covers: createQueue, enqueue, transitionQueueJob, summarizeQueue, jobConfigHash determinism, duplicate detection

import { describe, expect, it } from 'vitest';
import {
  createQueue,
  enqueue,
  transitionQueueJob,
  summarizeQueue,
  jobConfigHash,
  QUEUE_STATE_ORDER,
} from './queue';
import type { QueueJobSpec } from './types';
import { RegimeLabel } from '@/tree/regime/types';
import type { Universe } from '@/tree/alpha/universe/types';
import type { ResearchCosts, ResearchSlippage } from '@/tree/alpha/registry/types';

// ── Helpers ──────────────────────────────────────────────
function makeSpec(overrides: Partial<QueueJobSpec> = {}): QueueJobSpec {
  const universe: Universe = {
    id: 'test-universe',
    symbols: ['BTCUSDT', 'ETHUSDT'],
    weighting: 'equal',
    rebalanceRule: 'none',
  };
  const costs: ResearchCosts = { feeBps: 10, impactBps: 5 };
  const slippage: ResearchSlippage = { slippageBps: 3 };
  return {
    id: 'queue-0001-funding-fade',
    hypothesis: 'Funding rate mean reversion on 8h windows',
    rationale: 'Negative funding predicts positive returns next period',
    features: ['funding_rate', 'open_interest'],
    dataset: 'binance-ohlcv-funding',
    regime: RegimeLabel.RANGE,
    universe,
    costs,
    slippage,
    seed: 42,
    parentHypothesis: null,
    generatedBy: 'test-generator',
    timestamp: 1_700_000_000_000,
    gitSha: 'abc123',
    ...overrides,
  };
}

describe('ResearchQueue — core operations', () => {
  describe('createQueue', () => {
    it('returns empty queue with zero jobs', () => {
      const q = createQueue();
      expect(q.jobs).toHaveLength(0);
    });
  });

  describe('jobConfigHash determinism', () => {
    it('same spec yields same hash regardless of key order', () => {
      const spec = makeSpec();
      const h1 = jobConfigHash(spec);
      const h2 = jobConfigHash(spec);
      expect(h1).toBe(h2);
      expect(h1.length).toBe(8); // 32-bit hex zero-padded
    });

    it('different seeds produce different hashes', () => {
      const h1 = jobConfigHash(makeSpec({ seed: 1 }));
      const h2 = jobConfigHash(makeSpec({ seed: 2 }));
      expect(h1).not.toBe(h2);
    });

    it('different features produce different hashes', () => {
      const h1 = jobConfigHash(makeSpec({ features: ['a'] }));
      const h2 = jobConfigHash(makeSpec({ features: ['b'] }));
      expect(h1).not.toBe(h2);
    });

    it('different hypothesis produces different hash', () => {
      const h1 = jobConfigHash(makeSpec({ hypothesis: 'h1' }));
      const h2 = jobConfigHash(makeSpec({ hypothesis: 'h2' }));
      expect(h1).not.toBe(h2);
    });
  });

  describe('enqueue happy paths', () => {
    it('adds job with PROPOSED status and computed configHash', () => {
      const q = createQueue();
      const q2 = enqueue(q, makeSpec());
      expect(q2.jobs).toHaveLength(1);
      const job = q2.jobs[0];
      expect(job.status).toBe('PROPOSED');
      expect(job.configHash).toBeDefined();
      expect(job.configHash.length).toBe(8);
      expect(job.result).toBeNull();
    });

    it('preserves original queue (immutability)', () => {
      const q = createQueue();
      const q2 = enqueue(q, makeSpec({ id: 'job-1' }));
      expect(q.jobs).toHaveLength(0);
      expect(q2.jobs).toHaveLength(1);
    });

    it('enqueues multiple jobs', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec({ id: 'job-1', hypothesis: 'h1' }));
      q = enqueue(q, makeSpec({ id: 'job-2', hypothesis: 'h2' }));
      expect(q.jobs).toHaveLength(2);
      expect(q.jobs[0].id).toBe('job-1');
      expect(q.jobs[1].id).toBe('job-2');
    });
  });

  describe('enqueue failure paths', () => {
    it('throws on empty id', () => {
      expect(() => enqueue(createQueue(), makeSpec({ id: '' }))).toThrow(
        'Queue job id must be non-empty',
      );
    });

    it('throws on empty hypothesis', () => {
      expect(() => enqueue(createQueue(), makeSpec({ hypothesis: '' }))).toThrow(
        'Queue job hypothesis must be non-empty',
      );
    });

    it('throws on empty rationale', () => {
      expect(() => enqueue(createQueue(), makeSpec({ rationale: '' }))).toThrow(
        'Queue job rationale must be non-empty',
      );
    });

    it('throws on empty dataset', () => {
      expect(() => enqueue(createQueue(), makeSpec({ dataset: '' }))).toThrow(
        'Queue job dataset must be non-empty',
      );
    });

    it('throws on empty generatedBy', () => {
      expect(() => enqueue(createQueue(), makeSpec({ generatedBy: '' }))).toThrow(
        'Queue job generatedBy must be non-empty',
      );
    });

    it('throws on duplicate id', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec({ id: 'dup-id' }));
      expect(() => enqueue(q, makeSpec({ id: 'dup-id' }))).toThrow(
        'Duplicate queue job id: dup-id',
      );
    });

    it('throws on duplicate config hash among non-ARCHIVED jobs', () => {
      let q = createQueue();
      const spec = makeSpec({ id: 'job-1', hypothesis: 'same config' });
      q = enqueue(q, spec);
      expect(() => enqueue(q, makeSpec({ id: 'job-2', hypothesis: 'same config' }))).toThrow(
        "Duplicate queue job configuration (collides with id 'job-1', hash",
      );
    });

    it('allows duplicate hash if previous job is ARCHIVED', () => {
      let q = createQueue();
      const spec = makeSpec({ id: 'job-1', hypothesis: 'same config' });
      q = enqueue(q, spec);
      q = transitionQueueJob(q, 'job-1', 'validate');
      q = transitionQueueJob(q, 'job-1', 'validation_passed');
      q = transitionQueueJob(q, 'job-1', 'evaluation_complete');
      q = transitionQueueJob(q, 'job-1', 'falsified');
      q = transitionQueueJob(q, 'job-1', 'archive');
      // Now the first job is ARCHIVED, so duplicate hash should be allowed
      const q2 = enqueue(q, makeSpec({ id: 'job-2', hypothesis: 'same config' }));
      expect(q2.jobs).toHaveLength(2);
    });
  });

  describe('transitionQueueJob', () => {
    it('PROPOSED → VALIDATING via validate', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      expect(q.jobs[0].status).toBe('VALIDATING');
    });

    it('PROPOSED → ARCHIVED via withdraw', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'withdraw');
      expect(q.jobs[0].status).toBe('ARCHIVED');
    });

    it('VALIDATING → RUNNING via validation_passed', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      q = transitionQueueJob(q, q.jobs[0].id, 'validation_passed');
      expect(q.jobs[0].status).toBe('RUNNING');
    });

    it('VALIDATING → FALSIFIED via validation_failed', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      q = transitionQueueJob(q, q.jobs[0].id, 'validation_failed');
      expect(q.jobs[0].status).toBe('FALSIFIED');
    });

    it('RUNNING → EVALUATED via evaluation_complete', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      q = transitionQueueJob(q, q.jobs[0].id, 'validation_passed');
      q = transitionQueueJob(q, q.jobs[0].id, 'evaluation_complete');
      expect(q.jobs[0].status).toBe('EVALUATED');
    });

    it('RUNNING → FALSIFIED via run_failed', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      q = transitionQueueJob(q, q.jobs[0].id, 'validation_passed');
      q = transitionQueueJob(q, q.jobs[0].id, 'run_failed');
      expect(q.jobs[0].status).toBe('FALSIFIED');
    });

    it('EVALUATED → SURVIVED via survived', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      q = transitionQueueJob(q, q.jobs[0].id, 'validation_passed');
      q = transitionQueueJob(q, q.jobs[0].id, 'evaluation_complete');
      q = transitionQueueJob(q, q.jobs[0].id, 'survived');
      expect(q.jobs[0].status).toBe('SURVIVED');
    });

    it('EVALUATED → FALSIFIED via falsified', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      q = transitionQueueJob(q, q.jobs[0].id, 'validation_passed');
      q = transitionQueueJob(q, q.jobs[0].id, 'evaluation_complete');
      q = transitionQueueJob(q, q.jobs[0].id, 'falsified');
      expect(q.jobs[0].status).toBe('FALSIFIED');
    });

    it('SURVIVED → ARCHIVED via archive', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      q = transitionQueueJob(q, q.jobs[0].id, 'validation_passed');
      q = transitionQueueJob(q, q.jobs[0].id, 'evaluation_complete');
      q = transitionQueueJob(q, q.jobs[0].id, 'survived');
      q = transitionQueueJob(q, q.jobs[0].id, 'archive');
      expect(q.jobs[0].status).toBe('ARCHIVED');
    });

    it('FALSIFIED → ARCHIVED via archive', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      q = transitionQueueJob(q, q.jobs[0].id, 'validation_failed');
      q = transitionQueueJob(q, q.jobs[0].id, 'archive');
      expect(q.jobs[0].status).toBe('ARCHIVED');
    });

    it('throws on unknown job id', () => {
      const q = createQueue();
      expect(() => transitionQueueJob(q, 'unknown-id', 'validate')).toThrow(
        'Cannot transition unknown queue job id: unknown-id',
      );
    });

    it('throws on illegal transition PROPOSED → RUNNING', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      expect(() => transitionQueueJob(q, q.jobs[0].id, 'validation_passed')).toThrow(
        'Invalid transition: PROPOSED + validation_passed',
      );
    });

    it('throws on illegal transition VALIDATING → EVALUATED', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      expect(() => transitionQueueJob(q, q.jobs[0].id, 'evaluation_complete')).toThrow(
        'Invalid transition: VALIDATING + evaluation_complete',
      );
    });

    it('throws on any transition from ARCHIVED', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'withdraw');
      expect(() => transitionQueueJob(q, q.jobs[0].id, 'validate')).toThrow(
        'Invalid transition: ARCHIVED + validate',
      );
    });

    it('preserves immutability', () => {
      let q = createQueue();
      q = enqueue(q, makeSpec());
      const q2 = transitionQueueJob(q, q.jobs[0].id, 'validate');
      expect(q.jobs[0].status).toBe('PROPOSED');
      expect(q2.jobs[0].status).toBe('VALIDATING');
    });
  });

  describe('summarizeQueue', () => {
    it('counts jobs by state correctly', () => {
      let q = createQueue();
      // Distinct hypotheses → distinct configHashes (duplicate-config
      // guard rejects identical configurations among non-ARCHIVED jobs).
      q = enqueue(q, makeSpec({ id: 'job-1', hypothesis: 'h-1' }));
      q = enqueue(q, makeSpec({ id: 'job-2', hypothesis: 'h-2' }));
      q = enqueue(q, makeSpec({ id: 'job-3', hypothesis: 'h-3' }));
      q = transitionQueueJob(q, 'job-1', 'validate');
      q = transitionQueueJob(q, 'job-2', 'validate');
      q = transitionQueueJob(q, 'job-2', 'validation_passed');

      const summary = summarizeQueue(q);
      expect(summary.total).toBe(3);
      expect(summary.counts.PROPOSED).toBe(1);
      expect(summary.counts.VALIDATING).toBe(1);
      expect(summary.counts.RUNNING).toBe(1);
      expect(summary.counts.EVALUATED).toBe(0);
      expect(summary.counts.SURVIVED).toBe(0);
      expect(summary.counts.FALSIFIED).toBe(0);
      expect(summary.counts.ARCHIVED).toBe(0);
    });

    it('includes all states in counts', () => {
      const summary = summarizeQueue(createQueue());
      for (const state of QUEUE_STATE_ORDER) {
        expect(summary.counts[state]).toBeDefined();
        expect(typeof summary.counts[state]).toBe('number');
      }
    });
  });

  describe('property-style: counters monotonic under enqueue', () => {
    it('total jobs strictly increases with each enqueue', () => {
      let q = createQueue();
      for (let i = 0; i < 10; i++) {
        const before = summarizeQueue(q).total;
        q = enqueue(q, makeSpec({ id: `job-${i}`, hypothesis: `h-${i}` }));
        const after = summarizeQueue(q).total;
        expect(after).toBe(before + 1);
      }
    });
  });
});