// Debate quality harness tests (task §J): compare arms A/B/C/D.
// Multi-agent is NOT assumed better — no passing arm means REDUCE/DISABLE.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEBATE_QUALITY_CONFIG,
  compareDebateArms,
  relativeImprovement,
  type DebateArmMetrics,
} from './debate-quality';

const BASELINE: DebateArmMetrics = {
  arm: 'A',
  sampleCount: 100,
  oosEvidenceScore: 0.5,
  researchEfficiency: 0.4,
};

function arm(arm: string, oos: number, eff: number, samples = 100): DebateArmMetrics {
  return { arm: arm as 'B', sampleCount: samples, oosEvidenceScore: oos, researchEfficiency: eff };
}

describe('relativeImprovement', () => {
  it('returns the relative improvement over a non-zero baseline', () => {
    expect(relativeImprovement(0.5, 0.6)).toBeCloseTo(0.2);
    expect(relativeImprovement(0.5, 0.4)).toBeCloseTo(-0.2);
  });

  it('is zero-safe: any positive candidate over a zero baseline is 1', () => {
    expect(relativeImprovement(0, 0.1)).toBe(1);
    expect(relativeImprovement(0, 0)).toBe(0);
    expect(relativeImprovement(0, -0.1)).toBe(0);
  });
});

describe('compareDebateArms — happy path', () => {
  it('PASSes an arm that improves both metrics', () => {
    const result = compareDebateArms([BASELINE, arm('B', 0.6, 0.5)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.baseline.arm).toBe('A');
    expect(result.report.armVerdicts).toHaveLength(1);
    expect(result.report.armVerdicts[0].verdict).toBe('PASS');
    expect(result.report.overallVerdict).toBe('PASS');
  });

  it('REDUCEs an arm that improves neither metric but does not degrade', () => {
    // -2% / -2.5% relative: below the +5% improvement bar, above the -5%
    // degradation bar → REDUCE, not DISABLE.
    const result = compareDebateArms([BASELINE, arm('B', 0.49, 0.39)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.armVerdicts[0].verdict).toBe('REDUCE');
    expect(result.report.overallVerdict).toBe('REDUCE');
  });

  it('DISABLEs an arm that degrades both metrics', () => {
    const result = compareDebateArms([BASELINE, arm('B', 0.3, 0.2)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.armVerdicts[0].verdict).toBe('DISABLE');
    expect(result.report.overallVerdict).toBe('DISABLE');
  });

  it('PASSes overall when at least one arm passes', () => {
    const result = compareDebateArms([
      BASELINE,
      arm('B', 0.45, 0.35),
      arm('C', 0.6, 0.5),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.overallVerdict).toBe('PASS');
  });

  it('REDUCES overall when all arms reduce (no passing arm)', () => {
    const result = compareDebateArms([
      BASELINE,
      arm('B', 0.49, 0.39),
      arm('C', 0.48, 0.38),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.overallVerdict).toBe('REDUCE');
  });
});

describe('compareDebateArms — fail-closed', () => {
  it('rejects when baseline arm A is missing', () => {
    const result = compareDebateArms([arm('B', 0.6, 0.5)]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons[0]).toContain('baseline arm A is required');
  });

  it('rejects duplicate arms', () => {
    const result = compareDebateArms([BASELINE, arm('B', 0.6, 0.5), arm('B', 0.6, 0.5)]);
    expect(result.ok).toBe(false);
  });

  it('rejects an arm below minSamplesPerArm', () => {
    const result = compareDebateArms([BASELINE, arm('B', 0.6, 0.5, 5)]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.some((r) => r.includes('needs >='))).toBe(true);
  });

  it('rejects invalid arm metrics', () => {
    const result = compareDebateArms([BASELINE, { arm: 'B', sampleCount: 100, oosEvidenceScore: Number.NaN, researchEfficiency: 0.5 }]);
    expect(result.ok).toBe(false);
  });

  it('honors a custom minRelativeImprovement threshold', () => {
    const result = compareDebateArms(
      [BASELINE, arm('B', 0.52, 0.42)],
      { minSamplesPerArm: 20, minRelativeImprovement: 0.1 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.armVerdicts[0].verdict).toBe('REDUCE');
  });
});

describe('DEFAULT_DEBATE_QUALITY_CONFIG', () => {
  it('requires >= 20 samples and >= 5% relative improvement', () => {
    expect(DEFAULT_DEBATE_QUALITY_CONFIG.minSamplesPerArm).toBe(20);
    expect(DEFAULT_DEBATE_QUALITY_CONFIG.minRelativeImprovement).toBe(0.05);
  });
});