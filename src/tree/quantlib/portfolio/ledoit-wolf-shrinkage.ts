import type { LedoitWolfShrinkageResult } from '../microstructure/hawkes-jump-types';

function computeConstantCorrelationTarget(S: number[][], p: number, variances: number[]): number[][] {
  let avgCorr = 0;
  let corrCount = 0;
  for (let j = 0; j < p; j++) {
    for (let k = j + 1; k < p; k++) {
      const stdJ = Math.sqrt(Math.max(1e-12, variances[j]!));
      const stdK = Math.sqrt(Math.max(1e-12, variances[k]!));
      avgCorr += S[j]![k]! / (stdJ * stdK);
      corrCount++;
    }
  }
  const rBar = corrCount > 0 ? avgCorr / corrCount : 0;

  const F: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < p; k++) {
      if (j === k) {
        F[j]![k] = variances[j]!;
      } else {
        const stdJ = Math.sqrt(Math.max(1e-12, variances[j]!));
        const stdK = Math.sqrt(Math.max(1e-12, variances[k]!));
        F[j]![k] = rBar * stdJ * stdK;
      }
    }
  }
  return F;
}

export class LedoitWolfShrinkageEngine {
  computeShrinkageCovariance(returnsMatrix: readonly (readonly number[])[]): LedoitWolfShrinkageResult {
    const n = returnsMatrix.length;
    if (n < 4) throw new Error('Ledoit-Wolf shrinkage requires at least 4 return observations.');
    const p = returnsMatrix[0]?.length ?? 0;
    if (p < 2) throw new Error('Ledoit-Wolf shrinkage requires at least 2 assets.');

    // 1. Calculate sample means
    const means: number[] = Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        means[j] += returnsMatrix[i]![j]! / n;
      }
    }

    // 2. Sample covariance S
    const S: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < p; k++) {
          const devJ = returnsMatrix[i]![j]! - means[j]!;
          const devK = returnsMatrix[i]![k]! - means[k]!;
          S[j]![k]! += (devJ * devK) / (n - 1);
        }
      }
    }

    // 3. Constant correlation target F
    const variances = S.map((row, idx) => row[idx]!);
    const F = computeConstantCorrelationTarget(S, p, variances);

    // 4. Optimal Shrinkage Intensity delta* (Ledoit-Wolf 2004 estimator proxy)
    const deltaStar = Math.max(0.05, Math.min(0.95, 1 / (1 + n / p)));

    // 5. Blended Sigma* = (1 - delta*) S + delta* F
    const sigmaStar: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        sigmaStar[j]![k] = Number(((1 - deltaStar) * S[j]![k]! + deltaStar * F[j]![k]!).toFixed(6));
      }
    }

    return {
      shrinkageIntensity: Number(deltaStar.toFixed(4)),
      covarianceMatrix: sigmaStar,
      conditionNumber: Number((Math.max(...variances) / (Math.min(...variances) + 1e-12)).toFixed(2)),
    };
  }
}
