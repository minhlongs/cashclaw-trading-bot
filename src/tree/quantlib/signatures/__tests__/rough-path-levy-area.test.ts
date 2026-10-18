import { describe, it, expect } from 'vitest';
import { computeRoughPathLevySignature } from '../rough-path-levy-area';

describe('Lyons Rough Path Truncated Signature S^(2)(X) & Lévy Area Lead-Lag Classifier', () => {
  const LEADER_PATH = [0.0, 0.04, 0.09, 0.12, 0.08, 0.03, 0.0] as const;
  const FOLLOWER_PATH = [0.0, 0.0, 0.04, 0.09, 0.12, 0.08, 0.03] as const;

  it('computes strictly positive Lévy area A^{1,2} when Path 1 leads Path 2', () => {
    const res = computeRoughPathLevySignature({
      path1: LEADER_PATH,
      path2: FOLLOWER_PATH,
    });

    expect(res.levyArea12).toBeGreaterThan(0);
    expect(res.verdict).toBe('ASSET1_LEADS_MOMENTUM');
    expect(res.signatureNorm).toBeGreaterThan(0);
    expect(res.steps).toHaveLength(LEADER_PATH.length);
  });

  it('satisfies antisymmetry A^{1,2} = -A^{2,1} when swapping channels', () => {
    const forward = computeRoughPathLevySignature({
      path1: LEADER_PATH,
      path2: FOLLOWER_PATH,
    });
    const swapped = computeRoughPathLevySignature({
      path1: FOLLOWER_PATH,
      path2: LEADER_PATH,
    });

    expect(forward.levyArea12).toBeCloseTo(-swapped.levyArea12, 6);
    expect(swapped.verdict).toBe('ASSET2_LEADS_REVERSAL');
    expect(forward.s2_12).toBeCloseTo(swapped.s2_21, 6);
  });

  it('returns zero Lévy area and NEUTRAL_DIFFUSION on identical paths', () => {
    const identical = computeRoughPathLevySignature({
      path1: LEADER_PATH,
      path2: LEADER_PATH,
    });

    expect(identical.levyArea12).toBeCloseTo(0, 6);
    expect(identical.verdict).toBe('NEUTRAL_DIFFUSION');
    expect(identical.s2_11).toBeCloseTo(0.5 * identical.s1Channel1 ** 2, 6);
  });
});
