// Debate quality tests — forest orchestration over tree-layer pure math.
// Arm comparison emits REDUCE/DISABLE when no edge over baseline.

import { describe, expect, it } from 'vitest';
import {
  evaluateDebateQuality,
  computeArmMetrics,
  type ArmEvaluationInput,
} from './debate-quality';
import type { DebateQualityConfig } from '@/tree/research/tradingagents/debate-quality';
import type { ModelProvenanceRecord } from '@/tree/research/tradingagents';

/** Test config: 3 samples per arm (fixtures are small). */
const TEST_CONFIG: DebateQualityConfig = { minSamplesPerArm: 3, minRelativeImprovement: 0.05 };

function makeProvenance(): ModelProvenanceRecord {
  return {
    agentRole: 'bull-researcher',
    task: 'debate',
    provenance: { providerId: 'Anthropic', modelId: 'fixture-reasoning', tier: 'REASONING', promptTokens: 100, completionTokens: 50, latencyMs: 10 },
  };
}

function makeInput(arm: 'A' | 'B' | 'C' | 'D', oos: number, cost: number, survived: boolean): ArmEvaluationInput {
  return {
    arm,
    researchGoalId: 'goal-1',
    proposalId: 'prop-1',
    oosEvidenceScores: [oos, oos, oos],
    researchCosts: [cost, cost, cost],
    thesisSurvival: [survived, survived, survived],
    modelProvenance: [makeProvenance()],
  };
}

describe('computeArmMetrics', () => {
  it('computes OOS evidence score as mean of injected scores', () => {
    const metrics = computeArmMetrics(makeInput('A', 0.5, 100, true));
    expect(metrics.oosEvidenceScore).toBeCloseTo(0.5);
    expect(metrics.sampleCount).toBe(3);
    expect(metrics.totalTokens).toBe(150);
  });

  it('computes research efficiency as surviving / total cost', () => {
    const metrics = computeArmMetrics(makeInput('A', 0.5, 100, true));
    expect(metrics.researchEfficiency).toBeCloseTo(1 / 100);
  });
});

describe('evaluateDebateQuality', () => {
  it('requires baseline arm A', () => {
    const result = evaluateDebateQuality([makeInput('B', 0.5, 100, true)], TEST_CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes('baseline arm A'))).toBe(true);
    }
  });

  it('rejects duplicate arms', () => {
    const result = evaluateDebateQuality([
      makeInput('A', 0.5, 100, true),
      makeInput('A', 0.6, 100, true),
    ], TEST_CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.some((r) => r.includes('duplicate arm'))).toBe(true);
    }
  });

  it('emits REDUCE when no arm beats baseline', () => {
    const result = evaluateDebateQuality([
      makeInput('A', 0.5, 100, true),
      makeInput('B', 0.51, 100, true),
      makeInput('C', 0.51, 100, true),
      makeInput('D', 0.51, 100, true),
    ], TEST_CONFIG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.overallVerdict).toBe('REDUCE');
    }
  });

  it('emits PASS when an arm beats baseline', () => {
    const result = evaluateDebateQuality([
      makeInput('A', 0.5, 100, true),
      makeInput('B', 0.6, 100, true),
    ], TEST_CONFIG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.overallVerdict).toBe('PASS');
    }
  });

  it('rejects mismatched array lengths', () => {
    const badInput: ArmEvaluationInput = {
      arm: 'A',
      researchGoalId: 'goal-1',
      proposalId: 'prop-1',
      oosEvidenceScores: [0.5, 0.6],
      researchCosts: [100],
      thesisSurvival: [true],
      modelProvenance: [makeProvenance()],
    };
    const result = evaluateDebateQuality([badInput], TEST_CONFIG);
    expect(result.ok).toBe(false);
  });
});