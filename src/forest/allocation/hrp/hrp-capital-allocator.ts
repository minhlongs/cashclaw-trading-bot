/**
 * @file hrp-capital-allocator.ts
 * @description Inverse-variance recursive bisection capital allocation along the dendrogram.
 */

import type { HrpAllocation } from './hrp-types';

function computeClusterVariance(
  items: readonly number[],
  covMatrix: readonly number[][]
): number {
  if (items.length === 0) return 0;
  
  // Weights are inversely proportional to diagonal variance for the naive cluster vol
  const invVars = items.map(idx => 1.0 / covMatrix[idx][idx]);
  const sumInvVars = invVars.reduce((a, b) => a + b, 0);
  const weights = invVars.map(iv => iv / sumInvVars);

  let clusterVar = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      clusterVar += weights[i] * weights[j] * covMatrix[items[i]][items[j]];
    }
  }
  return clusterVar;
}

export function allocateRecursiveBisection(
  orderedLeaves: readonly number[],
  covMatrix: readonly number[][]
): number[] {
  // Initialize weights all at 1.0
  const weights: number[] = Array(covMatrix.length).fill(1.0);
  
  // Recursion stack [subset]
  const subsets: number[][] = [ [...orderedLeaves] ];
  
  while (subsets.length > 0) {
    const items = subsets.shift()!;
    if (items.length <= 1) continue;
    
    // Split into left half and right half
    const mid = Math.floor(items.length / 2);
    const leftSub = items.slice(0, mid);
    const rightSub = items.slice(mid);
    
    const vLeft = computeClusterVariance(leftSub, covMatrix);
    const vRight = computeClusterVariance(rightSub, covMatrix);
    
    // Split factor inversely proportional to variance
    const alphaLeft = vRight / (vLeft + vRight);
    const alphaRight = 1.0 - alphaLeft;
    
    for (const idx of leftSub) {
      weights[idx] *= alphaLeft;
    }
    for (const idx of rightSub) {
      weights[idx] *= alphaRight;
    }
    
    subsets.push(leftSub);
    subsets.push(rightSub);
  }
  
  return weights;
}

export function generateHrpPortfolio(
  assets: readonly string[],
  weights: readonly number[]
): HrpAllocation[] {
  return assets.map((asset, i) => ({
    asset,
    weight: Math.round(weights[i] * 10000) / 10000
  }));
}
