/**
 * @file almgren-chriss-trajectory.ts
 * @description Closed-form hyperbolic Almgren-Chriss optimal execution trajectory calculator.
 */

import type { AlmgrenChrissParams } from './almgren-chriss-types';

export function computeKappa(params: AlmgrenChrissParams): number {
  const { riskAversion, volatility, temporaryImpact } = params;
  if (riskAversion <= 0 || volatility <= 0 || temporaryImpact <= 0) return 0;
  return Math.sqrt((riskAversion * volatility * volatility) / temporaryImpact);
}

export function computeInventoryTrajectory(
  params: AlmgrenChrissParams,
  kappa: number
): number[] {
  const { initialInventory, horizonSeconds, numIntervals } = params;
  if (numIntervals <= 0 || initialInventory <= 0) return [0];

  const tau = horizonSeconds / numIntervals;
  const x: number[] = [initialInventory];

  // Pure linear TWAP limit when risk aversion is zero or kappa is negligible
  if (kappa < 1e-8) {
    for (let j = 1; j <= numIntervals; j++) {
      const remaining = initialInventory * (1 - j / numIntervals);
      x.push(j === numIntervals ? 0 : Math.max(0, remaining));
    }
    return x;
  }

  const kappaT = kappa * horizonSeconds;
  const useAsymptotic = kappaT > 50;
  const sinhKappaT = useAsymptotic ? 1 : Math.sinh(kappaT);

  for (let j = 1; j <= numIntervals; j++) {
    if (j === numIntervals) {
      x.push(0);
      continue;
    }
    const tj = j * tau;
    let ratio: number;
    if (useAsymptotic) {
      ratio = Math.exp(-kappa * tj);
    } else {
      ratio = Math.sinh(kappa * (horizonSeconds - tj)) / sinhKappaT;
    }
    const remaining = Math.max(0, Math.min(initialInventory, initialInventory * ratio));
    x.push(remaining);
  }

  return x;
}

export function computeOptimalSlices(
  params: AlmgrenChrissParams,
  trajectory: number[]
): number[] {
  const slices: number[] = [];
  let totalAllocated = 0;

  for (let j = 1; j < trajectory.length; j++) {
    const rawSlice = trajectory[j - 1] - trajectory[j];
    const slice = Math.max(0, rawSlice);
    slices.push(slice);
    totalAllocated += slice;
  }

  // Enforce mass conservation invariant: sum of slices == initialInventory
  const residual = params.initialInventory - totalAllocated;
  if (slices.length > 0 && Math.abs(residual) > 1e-10) {
    slices[slices.length - 1] = Math.max(0, slices[slices.length - 1] + residual);
  }

  return slices;
}
