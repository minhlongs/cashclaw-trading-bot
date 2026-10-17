// Research Queue — State Transitions & Summary Unit Tests

import { describe, expect, it } from 'vitest';
import {
  createQueue,
  enqueue,
  transitionQueueJob,
  summarizeQueue,
  QUEUE_STATE_ORDER,
} from './queue';
import { makeQueueSpec } from './queue.test';

describe('ResearchQueue — transitionQueueJob & summarizeQueue', () => {
  describe('transitionQueueJob', () => {
    it('supports all valid lifecycle transitions to SURVIVED and ARCHIVED', () => {
      let q = enqueue(createQueue(), makeQueueSpec());
      q = transitionQueueJob(q, q.jobs[0].id, 'validate');
      expect(q.jobs[0].status).toBe('VALIDATING');

      q = transitionQueueJob(q, q.jobs[0].id, 'validation_passed');
      expect(q.jobs[0].status).toBe('RUNNING');

      q = transitionQueueJob(q, q.jobs[0].id, 'evaluation_complete');
      expect(q.jobs[0].status).toBe('EVALUATED');

      q = transitionQueueJob(q, q.jobs[0].id, 'survived');
      expect(q.jobs[0].status).toBe('SURVIVED');

      q = transitionQueueJob(q, q.jobs[0].id, 'archive');
      expect(q.jobs[0].status).toBe('ARCHIVED');
    });

    it('supports withdraw, validation_failed, run_failed, and falsified → archive transitions', () => {
      let qWithdraw = enqueue(createQueue(), makeQueueSpec());
      qWithdraw = transitionQueueJob(qWithdraw, qWithdraw.jobs[0].id, 'withdraw');
      expect(qWithdraw.jobs[0].status).toBe('ARCHIVED');

      let qValFail = enqueue(createQueue(), makeQueueSpec());
      qValFail = transitionQueueJob(qValFail, qValFail.jobs[0].id, 'validate');
      qValFail = transitionQueueJob(qValFail, qValFail.jobs[0].id, 'validation_failed');
      expect(qValFail.jobs[0].status).toBe('FALSIFIED');
      qValFail = transitionQueueJob(qValFail, qValFail.jobs[0].id, 'archive');
      expect(qValFail.jobs[0].status).toBe('ARCHIVED');

      let qRunFail = enqueue(createQueue(), makeQueueSpec());
      qRunFail = transitionQueueJob(qRunFail, qRunFail.jobs[0].id, 'validate');
      qRunFail = transitionQueueJob(qRunFail, qRunFail.jobs[0].id, 'validation_passed');
      qRunFail = transitionQueueJob(qRunFail, qRunFail.jobs[0].id, 'run_failed');
      expect(qRunFail.jobs[0].status).toBe('FALSIFIED');

      let qFalsified = enqueue(createQueue(), makeQueueSpec());
      qFalsified = transitionQueueJob(qFalsified, qFalsified.jobs[0].id, 'validate');
      qFalsified = transitionQueueJob(qFalsified, qFalsified.jobs[0].id, 'validation_passed');
      qFalsified = transitionQueueJob(qFalsified, qFalsified.jobs[0].id, 'evaluation_complete');
      qFalsified = transitionQueueJob(qFalsified, qFalsified.jobs[0].id, 'falsified');
      expect(qFalsified.jobs[0].status).toBe('FALSIFIED');
    });

    it('throws on unknown job id or illegal transitions and preserves immutability', () => {
      const empty = createQueue();
      expect(() => transitionQueueJob(empty, 'unknown-id', 'validate')).toThrow(
        'Cannot transition unknown queue job id: unknown-id',
      );

      const q = enqueue(empty, makeQueueSpec());
      expect(() => transitionQueueJob(q, q.jobs[0].id, 'validation_passed')).toThrow(
        'Invalid transition: PROPOSED + validation_passed',
      );

      const qVal = transitionQueueJob(q, q.jobs[0].id, 'validate');
      expect(q.jobs[0].status).toBe('PROPOSED');
      expect(qVal.jobs[0].status).toBe('VALIDATING');
      expect(() => transitionQueueJob(qVal, qVal.jobs[0].id, 'evaluation_complete')).toThrow(
        'Invalid transition: VALIDATING + evaluation_complete',
      );

      const qArch = transitionQueueJob(q, q.jobs[0].id, 'withdraw');
      expect(() => transitionQueueJob(qArch, qArch.jobs[0].id, 'validate')).toThrow(
        'Invalid transition: ARCHIVED + validate',
      );
    });
  });

  describe('summarizeQueue & monotonic counters', () => {
    it('counts jobs by state and includes all states in counts', () => {
      let q = createQueue();
      q = enqueue(q, makeQueueSpec({ id: 'job-1', hypothesis: 'h-1' }));
      q = enqueue(q, makeQueueSpec({ id: 'job-2', hypothesis: 'h-2' }));
      q = enqueue(q, makeQueueSpec({ id: 'job-3', hypothesis: 'h-3' }));
      q = transitionQueueJob(q, 'job-1', 'validate');
      q = transitionQueueJob(q, 'job-2', 'validate');
      q = transitionQueueJob(q, 'job-2', 'validation_passed');

      const summary = summarizeQueue(q);
      expect(summary.total).toBe(3);
      expect(summary.counts.PROPOSED).toBe(1);
      expect(summary.counts.VALIDATING).toBe(1);
      expect(summary.counts.RUNNING).toBe(1);

      const emptySummary = summarizeQueue(createQueue());
      for (const state of QUEUE_STATE_ORDER) {
        expect(typeof emptySummary.counts[state]).toBe('number');
      }
    });

    it('total jobs strictly increases with each enqueue', () => {
      let q = createQueue();
      for (let i = 0; i < 10; i++) {
        const before = summarizeQueue(q).total;
        q = enqueue(q, makeQueueSpec({ id: `job-${i}`, hypothesis: `h-${i}` }));
        expect(summarizeQueue(q).total).toBe(before + 1);
      }
    });
  });
});
