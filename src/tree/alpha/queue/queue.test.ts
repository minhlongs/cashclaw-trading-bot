// Research Queue — Core Unit Tests
// Covers: createQueue, enqueue, jobConfigHash determinism, duplicate detection

import { describe, expect, it } from 'vitest';
import {
  createQueue,
  enqueue,
  transitionQueueJob,
  jobConfigHash,
} from './queue';
import type { QueueJobSpec } from './types';
import { RegimeLabel } from '@/tree/regime/types';
import type { Universe } from '@/tree/alpha/universe/types';
import type { ResearchCosts, ResearchSlippage } from '@/tree/alpha/registry/types';

export function makeQueueSpec(overrides: Partial<QueueJobSpec> = {}): QueueJobSpec {
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

describe('ResearchQueue — createQueue, jobConfigHash & enqueue', () => {
  describe('createQueue & jobConfigHash determinism', () => {
    it('returns empty queue with zero jobs', () => {
      expect(createQueue().jobs).toHaveLength(0);
    });

    it('same spec yields same 8-char hash and distinct specs yield distinct hashes', () => {
      const spec = makeQueueSpec();
      expect(jobConfigHash(spec)).toBe(jobConfigHash(spec));
      expect(jobConfigHash(spec).length).toBe(8);
      expect(jobConfigHash(makeQueueSpec({ seed: 1 }))).not.toBe(jobConfigHash(makeQueueSpec({ seed: 2 })));
      expect(jobConfigHash(makeQueueSpec({ features: ['a'] }))).not.toBe(jobConfigHash(makeQueueSpec({ features: ['b'] })));
      expect(jobConfigHash(makeQueueSpec({ hypothesis: 'h1' }))).not.toBe(jobConfigHash(makeQueueSpec({ hypothesis: 'h2' })));
    });
  });

  describe('enqueue happy paths', () => {
    it('adds job with PROPOSED status, computed configHash, and preserves immutability', () => {
      const q = createQueue();
      const q2 = enqueue(q, makeQueueSpec({ id: 'job-1' }));
      expect(q.jobs).toHaveLength(0);
      expect(q2.jobs).toHaveLength(1);
      expect(q2.jobs[0].status).toBe('PROPOSED');
      expect(q2.jobs[0].configHash.length).toBe(8);
      expect(q2.jobs[0].result).toBeNull();
    });

    it('enqueues multiple distinct jobs in order', () => {
      let q = createQueue();
      q = enqueue(q, makeQueueSpec({ id: 'job-1', hypothesis: 'h1' }));
      q = enqueue(q, makeQueueSpec({ id: 'job-2', hypothesis: 'h2' }));
      expect(q.jobs.map((j) => j.id)).toEqual(['job-1', 'job-2']);
    });
  });

  describe('enqueue failure paths', () => {
    it('throws on empty required string fields', () => {
      expect(() => enqueue(createQueue(), makeQueueSpec({ id: '' }))).toThrow('Queue job id must be non-empty');
      expect(() => enqueue(createQueue(), makeQueueSpec({ hypothesis: '' }))).toThrow('Queue job hypothesis must be non-empty');
      expect(() => enqueue(createQueue(), makeQueueSpec({ rationale: '' }))).toThrow('Queue job rationale must be non-empty');
      expect(() => enqueue(createQueue(), makeQueueSpec({ dataset: '' }))).toThrow('Queue job dataset must be non-empty');
      expect(() => enqueue(createQueue(), makeQueueSpec({ generatedBy: '' }))).toThrow('Queue job generatedBy must be non-empty');
    });

    it('throws on duplicate id or duplicate config hash among non-ARCHIVED jobs', () => {
      let q = createQueue();
      q = enqueue(q, makeQueueSpec({ id: 'dup-id', hypothesis: 'same config' }));
      expect(() => enqueue(q, makeQueueSpec({ id: 'dup-id' }))).toThrow('Duplicate queue job id: dup-id');
      expect(() => enqueue(q, makeQueueSpec({ id: 'job-2', hypothesis: 'same config' }))).toThrow(
        "Duplicate queue job configuration (collides with id 'dup-id', hash",
      );
    });

    it('allows duplicate hash if previous job is ARCHIVED', () => {
      let q = createQueue();
      q = enqueue(q, makeQueueSpec({ id: 'job-1', hypothesis: 'same config' }));
      q = transitionQueueJob(q, 'job-1', 'validate');
      q = transitionQueueJob(q, 'job-1', 'validation_passed');
      q = transitionQueueJob(q, 'job-1', 'evaluation_complete');
      q = transitionQueueJob(q, 'job-1', 'falsified');
      q = transitionQueueJob(q, 'job-1', 'archive');
      const q2 = enqueue(q, makeQueueSpec({ id: 'job-2', hypothesis: 'same config' }));
      expect(q2.jobs).toHaveLength(2);
    });
  });
});
