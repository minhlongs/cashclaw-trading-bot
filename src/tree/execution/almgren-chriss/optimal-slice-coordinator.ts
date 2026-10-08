/**
 * @file optimal-slice-coordinator.ts
 * @description Coordinates Almgren-Chriss trajectory planning with real-time VPIN toxicity throttling.
 */

import type {
  AlmgrenChrissParams,
  AlmgrenChrissSchedule,
  ExecutionSlice,
  OrderExecutionType,
  VpinThrottleConfig,
} from './almgren-chriss-types';
import {
  computeInventoryTrajectory,
  computeKappa,
  computeOptimalSlices,
} from './almgren-chriss-trajectory';
import {
  DEFAULT_VPIN_THROTTLE_CONFIG,
  evaluateVpinThrottling,
} from './vpin-execution-throttler';

export function generateAlmgrenChrissSchedule(
  params: AlmgrenChrissParams,
  vpinCdf = 0.5,
  throttleConfig: VpinThrottleConfig = DEFAULT_VPIN_THROTTLE_CONFIG
): AlmgrenChrissSchedule {
  const throttle = evaluateVpinThrottling(params.horizonSeconds, vpinCdf, throttleConfig);
  const adjustedParams: AlmgrenChrissParams = {
    ...params,
    horizonSeconds: throttle.adjustedHorizonSeconds,
  };

  const kappa = computeKappa(adjustedParams);
  const trajectory = computeInventoryTrajectory(adjustedParams, kappa);
  const rawSlices = computeOptimalSlices(adjustedParams, trajectory);

  const tau = adjustedParams.horizonSeconds / Math.max(1, adjustedParams.numIntervals);
  const orderType: OrderExecutionType = throttle.preferPassiveMaker ? 'passive_maker' : 'aggressive_market';

  const slices: ExecutionSlice[] = [];
  let currentInventory = adjustedParams.initialInventory;
  let totalCostUsd = 0;

  for (let i = 0; i < rawSlices.length; i++) {
    const sliceQty = rawSlices[i];
    currentInventory = Math.max(0, currentInventory - sliceQty);
    // Expected temporary impact cost: eta * (sliceQty / tau)^2 * tau
    const impactCost = tau > 0 ? (adjustedParams.temporaryImpact * (sliceQty * sliceQty)) / tau : 0;
    totalCostUsd += impactCost;

    slices.push({
      sliceIndex: i + 1,
      scheduledTimeSeconds: Math.round((i + 1) * tau * 100) / 100,
      sliceQuantity: Math.round(sliceQty * 1e8) / 1e8,
      remainingInventory: Math.round(currentInventory * 1e8) / 1e8,
      orderType,
      expectedImpactCostUsd: Math.round(impactCost * 1e4) / 1e4,
    });
  }

  return {
    totalInventory: adjustedParams.initialInventory,
    totalDurationSeconds: adjustedParams.horizonSeconds,
    urgencyKappa: Math.round(kappa * 1e6) / 1e6,
    slices,
    totalExpectedCostUsd: Math.round(totalCostUsd * 1e4) / 1e4,
    isThrottled: throttle.isThrottled,
  };
}
