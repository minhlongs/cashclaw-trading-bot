// Debate quality (tree layer) tests — covers compareDebateArms branches.

import { describe, expect, it } from 'vitest';
import {
  compareDebateArms,
  type DebateArmMetrics,
  relativeImprovement,
} from './debate-quality';

const makeArm = (overrides: Partial<DebateArmMetrics> = {}): DebateArmMetrics => ({
  arm: 'A',
  sampleCount: 25,
  oosEvidenceScore: 0.1,
  researchEfficiency: 0.5,
  ...overrides,
});

describe('relativeImprovement', () => {
  it('returns 1 when baseline is 0 and candidate is positive', () => {
    expect(relativeImprovement(0, 0.5)).toBe(1);
  });

  it('returns 0 when baseline is 0 and candidate is 0', () => {
    expect(relativeImprovement(0, 0)).toBe(0);
  });

  it('returns 0 when baseline is 0 and candidate is negative', () => {
    expect(relativeImprovement(0, -0.5)).toBe(0);
  });

  it('computes positive improvement correctly', () => {
    expect(relativeImprovement(0.1, 0.15)).toBeCloseTo(0.5);
  });

  it('computes negative improvement correctly', () => {
    expect(relativeImprovement(0.1, 0.05)).toBe(-0.5);
  });

  it('handles negative baseline correctly', () => {
    // (-0.05 - (-0.1)) / |-0.1| = 0.05 / 0.1 = 0.5
    expect(relativeImprovement(-0.1, -0.05)).toBe(0.5);
  });
});

describe('compareDebateArms — validation', () => {
  it('rejects invalid arm schema', () => {
    const result = compareDebateArms([{ arm: 'X' as never, sampleCount: 25, oosEvidenceScore: 0.1, researchEfficiency: 0.5 }]);
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate arms', () => {
    const arms: DebateArmMetrics[] = [makeArm(), makeArm()];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain("duplicate arm 'A'");
  });

  it('rejects missing baseline arm A', () => {
    const arms: DebateArmMetrics[] = [makeArm({ arm: 'B' })];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain('baseline arm A is required');
  });

  it('rejects arms with insufficient samples', () => {
    const arms: DebateArmMetrics[] = [makeArm(), makeArm({ arm: 'B', sampleCount: 10 })];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toContain('has 10 samples, needs >= 20');
  });

  it('collects ALL reasons when multiple failures', () => {
    const arms: DebateArmMetrics[] = [
      { arm: 'A', sampleCount: 5, oosEvidenceScore: 0.1, researchEfficiency: 0.5 },
      { arm: 'B', sampleCount: 5, oosEvidenceScore: 0.1, researchEfficiency: 0.5 },
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.length).toBe(2);
  });
});

describe('compareDebateArms — verdict logic', () => {
  it('PASS when oosEvidenceScore improves', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.16, researchEfficiency: 0.5 }), // 60% improvement > 5%
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.armVerdicts[0].verdict).toBe('PASS');
  });

  it('PASS when researchEfficiency improves', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.1, researchEfficiency: 0.58 }), // 16% improvement > 5%
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.armVerdicts[0].verdict).toBe('PASS');
  });

  it('DISABLE when both degraded beyond threshold', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.04, researchEfficiency: 0.4 }), // both -60%
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.armVerdicts[0].verdict).toBe('DISABLE');
  });

  it('PASS when oosImproved even if efficiencyDegraded (mixed)', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.12, researchEfficiency: 0.3 }), // oos +20%, efficiency -40%
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // oosImprovement = 0.2 >= 0.05 → oosImproved=true → PASS
    // The logic is: PASS if EITHER metric improves beyond threshold
    expect(result.report.armVerdicts[0].verdict).toBe('PASS');
  });

  it('REDUCE when neither improved nor degraded beyond threshold', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.102, researchEfficiency: 0.51 }), // 2% and 2% improvement
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.armVerdicts[0].verdict).toBe('REDUCE');
  });

  it('computes correct oosImprovement and efficiencyImprovement values', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.15, researchEfficiency: 0.75 }),
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.armVerdicts[0].oosImprovement).toBeCloseTo(0.5);
    expect(result.report.armVerdicts[0].efficiencyImprovement).toBeCloseTo(0.5);
  });
});

describe('computeOverallVerdict (via compareDebateArms)', () => {
  it('PASS when at least one arm passes', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.16, researchEfficiency: 0.5 }), // PASS
      makeArm({ arm: 'C', oosEvidenceScore: 0.04, researchEfficiency: 0.4 }), // DISABLE
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.overallVerdict).toBe('PASS');
  });

  it('DISABLE when every non-baseline arm is DISABLE', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.04, researchEfficiency: 0.4 }),
      makeArm({ arm: 'C', oosEvidenceScore: 0.04, researchEfficiency: 0.4 }),
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.overallVerdict).toBe('DISABLE');
  });

  it('REDUCE when no arm passes and not all disabled', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.102, researchEfficiency: 0.51 }), // REDUCE
      makeArm({ arm: 'C', oosEvidenceScore: 0.102, researchEfficiency: 0.51 }), // REDUCE
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.overallVerdict).toBe('REDUCE');
  });

  it('INCONCLUSIVE when only baseline arm provided', () => {
    const arms: DebateArmMetrics[] = [makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 })];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.overallVerdict).toBe('INCONCLUSIVE');
  });
});

describe('compareDebateArms — multiple arms', () => {
  it('evaluates all non-baseline arms independently', () => {
    const arms: DebateArmMetrics[] = [
      makeArm({ arm: 'A', oosEvidenceScore: 0.1, researchEfficiency: 0.5 }),
      makeArm({ arm: 'B', oosEvidenceScore: 0.16, researchEfficiency: 0.5 }), // PASS
      makeArm({ arm: 'C', oosEvidenceScore: 0.102, researchEfficiency: 0.51 }), // REDUCE
      makeArm({ arm: 'D', oosEvidenceScore: 0.04, researchEfficiency: 0.4 }), // DISABLE
    ];
    const result = compareDebateArms(arms);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.armVerdicts.map((v) => v.arm)).toEqual(['B', 'C', 'D']);
    expect(result.report.armVerdicts.map((v) => v.verdict)).toEqual(['PASS', 'REDUCE', 'DISABLE']);
  });
});