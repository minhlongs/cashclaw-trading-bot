export type RoughPathLeadLagVerdict =
  | 'ASSET1_LEADS_MOMENTUM'
  | 'ASSET2_LEADS_REVERSAL'
  | 'NEUTRAL_DIFFUSION';

export interface RoughPathLevyParams {
  readonly path1: readonly number[];
  readonly path2: readonly number[];
  readonly leadThreshold?: number;
}

export interface RoughPathSignatureStep {
  readonly stepIndex: number;
  readonly x1Normalized: number;
  readonly x2Normalized: number;
  readonly cumulativeLevyArea: number;
}

export interface RoughPathSignatureResult {
  readonly s1Channel1: number;
  readonly s1Channel2: number;
  readonly s2_11: number;
  readonly s2_12: number;
  readonly s2_21: number;
  readonly s2_22: number;
  readonly levyArea12: number;
  readonly signatureNorm: number;
  readonly verdict: RoughPathLeadLagVerdict;
  readonly steps: readonly RoughPathSignatureStep[];
}

export function computeRoughPathLevySignature(params: RoughPathLevyParams): RoughPathSignatureResult {
  const n = Math.min(params.path1.length, params.path2.length);
  if (n < 2) {
    return {
      s1Channel1: 0, s1Channel2: 0, s2_11: 0, s2_12: 0, s2_21: 0, s2_22: 0,
      levyArea12: 0, signatureNorm: 0, verdict: 'NEUTRAL_DIFFUSION', steps: [],
    };
  }

  const x10 = params.path1[0]!;
  const x20 = params.path2[0]!;
  let s2_11 = 0;
  let s2_12 = 0;
  let s2_21 = 0;
  let s2_22 = 0;
  const steps: RoughPathSignatureStep[] = [
    { stepIndex: 0, x1Normalized: 0, x2Normalized: 0, cumulativeLevyArea: 0 },
  ];

  for (let t = 1; t < n; t++) {
    const prev1 = params.path1[t - 1]! - x10;
    const curr1 = params.path1[t]! - x10;
    const prev2 = params.path2[t - 1]! - x20;
    const curr2 = params.path2[t]! - x20;
    const dx1 = curr1 - prev1;
    const dx2 = curr2 - prev2;

    s2_11 += 0.5 * (prev1 + curr1) * dx1;
    s2_12 += 0.5 * (prev1 + curr1) * dx2;
    s2_21 += 0.5 * (prev2 + curr2) * dx1;
    s2_22 += 0.5 * (prev2 + curr2) * dx2;

    steps.push({
      stepIndex: t,
      x1Normalized: Number(curr1.toFixed(6)),
      x2Normalized: Number(curr2.toFixed(6)),
      cumulativeLevyArea: Number((0.5 * (s2_12 - s2_21)).toFixed(6)),
    });
  }

  const s1_1 = params.path1[n - 1]! - x10;
  const s1_2 = params.path2[n - 1]! - x20;
  const levy = 0.5 * (s2_12 - s2_21);
  const norm = Math.sqrt(s1_1 ** 2 + s1_2 ** 2 + s2_11 ** 2 + s2_12 ** 2 + s2_21 ** 2 + s2_22 ** 2);
  const threshold = params.leadThreshold ?? 1e-4;
  const verdict: RoughPathLeadLagVerdict =
    levy > threshold ? 'ASSET1_LEADS_MOMENTUM' : levy < -threshold ? 'ASSET2_LEADS_REVERSAL' : 'NEUTRAL_DIFFUSION';

  return {
    s1Channel1: Number(s1_1.toFixed(6)),
    s1Channel2: Number(s1_2.toFixed(6)),
    s2_11: Number(s2_11.toFixed(6)),
    s2_12: Number(s2_12.toFixed(6)),
    s2_21: Number(s2_21.toFixed(6)),
    s2_22: Number(s2_22.toFixed(6)),
    levyArea12: Number(levy.toFixed(6)),
    signatureNorm: Number(norm.toFixed(6)),
    verdict,
    steps,
  };
}
