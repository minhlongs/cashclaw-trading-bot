// CashClaw Alpha Research OS — Seam Integration Tests
// Master Mission §10 / R4 & Layering Contract
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { RegimeLabel } from '@/tree/regime/types';
import type { ResearchQueueJob } from '@/tree/alpha/queue/types';
import type { SurvivalVerdict } from '@/forest/alpha/multiple-testing/types';
import { validateJobSpec } from '@/tree/alpha/queue/validation';
import { ResearchAgent } from '../agent';
import { DeterministicMockLLMProvider } from '../mock-provider';
import {
  diagnoseQueueJobFailure,
  recommendQueueFollowUp,
  createFollowUpJobSpec,
} from '../seam';

function makeMockJob(overrides: Partial<ResearchQueueJob> = {}): ResearchQueueJob {
  return {
    id: 'queue-job-101',
    hypothesis: 'Funding rate mean reversion on perpetual futures',
    rationale: 'Extreme negative funding rates precede price rebounds within 8 hours',
    features: ['funding_rate', 'rsi'],
    dataset: 'binance-perps-1h',
    regime: RegimeLabel.RANGE,
    universe: {
      id: 'top-10-perps',
      symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      weighting: 'equal',
      rebalanceRule: 'none',
    },
    costs: { feeBps: 10, impactBps: 6 },
    slippage: { slippageBps: 5 },
    seed: 42,
    parentHypothesis: null,
    generatedBy: 'human-researcher',
    timestamp: 1727190000000,
    gitSha: 'abcdef1234567890',
    status: 'FALSIFIED',
    configHash: 'hash-101',
    result: {
      oosPassCount: 1,
      oosTotalCount: 5,
      aggregatePnlUsd: -1250.50,
      summary: 'Wiped out by fee drag and 4 out of 5 negative OOS periods',
    },
    ...overrides,
  };
}

function makeMockVerdict(overrides: Partial<SurvivalVerdict> = {}): SurvivalVerdict {
  return {
    verdict: 'falsified',
    reasons: ['Bootstrap CI lower <= 0 (-0.012)', 'Walk-forward sign flips 3 exceeds threshold 2'],
    ...overrides,
  };
}

describe('ResearchAgent Integration Seam (seam.ts)', () => {
  const agent = new ResearchAgent({ provider: new DeterministicMockLLMProvider() });

  describe('diagnoseQueueJobFailure', () => {
    it('diagnoses a falsified job with explicit SurvivalVerdict', async () => {
      const diagnosis = await diagnoseQueueJobFailure(agent, makeMockJob(), makeMockVerdict());
      expect(diagnosis.jobId).toBe('queue-job-101');
      expect(diagnosis.primaryFailureReason).toBeDefined();
      expect(diagnosis.recommendations.length).toBeGreaterThan(0);
    });

    it('synthesizes failure reasons from job.result.summary when verdict is omitted', async () => {
      const diagnosis = await diagnoseQueueJobFailure(agent, makeMockJob());
      expect(diagnosis.jobId).toBe('queue-job-101');
    });

    it('falls back to default reason when verdict and result are absent', async () => {
      const diagnosis = await diagnoseQueueJobFailure(agent, makeMockJob({ result: null }));
      expect(diagnosis.jobId).toBe('queue-job-101');
    });

    it('extracts quantitative metrics and passes them to agent', async () => {
      const spy = vi.spyOn(agent, 'explainFailure');
      await diagnoseQueueJobFailure(agent, makeMockJob());
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0].metrics).toMatchObject({
        oosPassCount: 1, oosTotalCount: 5, aggregatePnlUsd: -1250.50, totalCostBps: 16,
      });
      spy.mockRestore();
    });

    it('throws fail-closed error if job status or verdict is SURVIVED', async () => {
      await expect(diagnoseQueueJobFailure(agent, makeMockJob({ status: 'SURVIVED' }))).rejects.toThrow(/status SURVIVED/);
      await expect(
        diagnoseQueueJobFailure(agent, makeMockJob(), makeMockVerdict({ verdict: 'survived', reasons: [] })),
      ).rejects.toThrow(/verdict for job '.*' is 'survived'/);
    });

    it('throws fail-closed error on incomplete job states (PROPOSED, VALIDATING, RUNNING)', async () => {
      for (const status of ['PROPOSED', 'VALIDATING', 'RUNNING'] as const) {
        await expect(diagnoseQueueJobFailure(agent, makeMockJob({ status }))).rejects.toThrow(
          new RegExp(`Cannot diagnose failure for incomplete job '.*' in state '${status}'`),
        );
      }
    });
  });

  describe('recommendQueueFollowUp', () => {
    it('recommends follow-up for falsified or survived jobs', async () => {
      const specFalsified = await recommendQueueFollowUp(agent, makeMockJob(), makeMockVerdict());
      expect(specFalsified.parentJobId).toBe('queue-job-101');

      const specSurvived = await recommendQueueFollowUp(
        agent,
        makeMockJob({ status: 'SURVIVED' }),
        makeMockVerdict({ verdict: 'survived', reasons: [] }),
      );
      expect(specSurvived.parentJobId).toBe('queue-job-101');
    });

    it('throws fail-closed error on incomplete job states (PROPOSED, VALIDATING, RUNNING)', async () => {
      for (const status of ['PROPOSED', 'VALIDATING', 'RUNNING'] as const) {
        await expect(recommendQueueFollowUp(agent, makeMockJob({ status }))).rejects.toThrow(
          new RegExp(`Cannot recommend follow-up for incomplete job '.*' in state '${status}'`),
        );
      }
    });

    it('throws error when agent returns zero recommendations', async () => {
      const emptyAgent = new ResearchAgent({ provider: new DeterministicMockLLMProvider() });
      vi.spyOn(emptyAgent, 'recommendNextExperiments').mockResolvedValueOnce([]);
      await expect(recommendQueueFollowUp(emptyAgent, makeMockJob())).rejects.toThrow(/no recommendations/);
    });
  });

  describe('createFollowUpJobSpec', () => {
    it('converts NextExperimentSpec into valid QueueJobSpec passing validateJobSpec', () => {
      const job = makeMockJob();
      const spec = {
        hypothesisId: 'h-next-1',
        title: 'Microstructure conditioning on funding rate',
        proposedParameters: { features: ['funding_rate', 'order_book_imbalance'], dataset: 'binance-l2-1h' },
        targetRegime: RegimeLabel.RANGE,
        rationale: 'Adding order book depth prevents false signals during shock periods',
      };
      const followUp = createFollowUpJobSpec(job, spec);
      expect(followUp.parentHypothesis).toBe(job.id);
      expect(followUp.features).toEqual(['funding_rate', 'order_book_imbalance']);
      expect(validateJobSpec(followUp, []).ok).toBe(true);
    });

    it('applies custom option overrides correctly', () => {
      const followUp = createFollowUpJobSpec(makeMockJob(), {
        hypothesisId: 'h-1', title: 'T', proposedParameters: {}, rationale: 'R',
      }, {
        id: 'custom-id', generatedBy: 'custom-gen', gitSha: 'sha-999',
      });
      expect(followUp.id).toBe('custom-id');
      expect(followUp.generatedBy).toBe('custom-gen');
      expect(followUp.gitSha).toBe('sha-999');
    });
  });

  describe('Tree Layer Purity (Invariant Verification)', () => {
    it('verifies zero files in src/tree/ import from research-agent', () => {
      const treeDir = path.resolve(__dirname, '../../../../tree');
      const violations: string[] = [];
      function checkDir(dir: string): void {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) checkDir(full);
          else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            const content = fs.readFileSync(full, 'utf-8');
            if (content.includes('research-agent')) violations.push(path.relative(treeDir, full));
          }
        }
      }
      checkDir(treeDir);
      expect(violations).toEqual([]);
    });
  });
});
