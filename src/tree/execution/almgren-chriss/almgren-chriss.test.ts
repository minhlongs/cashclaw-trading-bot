/**
 * @file almgren-chriss.test.ts
 * @description Comprehensive test suite for Phase 2 Almgren-Chriss optimal slicing engine & VPIN throttler.
 */

import { describe, expect, it } from 'vitest';
import type { AlmgrenChrissParams } from './almgren-chriss-types';
import {
  computeInventoryTrajectory,
  computeKappa,
  computeOptimalSlices,
} from './almgren-chriss-trajectory';
import {
  evaluateVpinThrottling,
  DEFAULT_VPIN_THROTTLE_CONFIG,
} from './vpin-execution-throttler';
import { generateAlmgrenChrissSchedule } from './optimal-slice-coordinator';

describe('Phase 2: Almgren-Chriss Optimal Slicing & VPIN Throttling', () => {
  const baseParams: AlmgrenChrissParams = {
    initialInventory: 10.0, // e.g. 10 BTC
    horizonSeconds: 300,   // 5 minutes
    numIntervals: 5,       // 1 minute slices
    riskAversion: 1e-4,
    volatility: 0.02,
    temporaryImpact: 0.1,
  };

  it('preserves total inventory mass across all execution slices', () => {
    const schedule = generateAlmgrenChrissSchedule(baseParams, 0.2);
    const totalExecuted = schedule.slices.reduce((acc, s) => acc + s.sliceQuantity, 0);

    expect(Math.abs(totalExecuted - baseParams.initialInventory)).toBeLessThan(1e-6);
    expect(schedule.slices[schedule.slices.length - 1].remainingInventory).toBe(0);
  });

  it('reproduces uniform linear TWAP when risk aversion is zero', () => {
    const twapParams: AlmgrenChrissParams = {
      ...baseParams,
      riskAversion: 0,
    };
    const kappa = computeKappa(twapParams);
    expect(kappa).toBe(0);

    const trajectory = computeInventoryTrajectory(twapParams, kappa);
    const slices = computeOptimalSlices(twapParams, trajectory);

    expect(slices.length).toBe(twapParams.numIntervals);
    const expectedPerSlice = twapParams.initialInventory / twapParams.numIntervals;
    slices.forEach((s) => {
      expect(Math.abs(s - expectedPerSlice)).toBeLessThan(1e-6);
    });
  });

  it('front-loads execution when risk aversion is high', () => {
    const urgentParams: AlmgrenChrissParams = {
      ...baseParams,
      riskAversion: 1.0, // High risk aversion
    };
    const schedule = generateAlmgrenChrissSchedule(urgentParams, 0.1);

    expect(schedule.slices[0].sliceQuantity).toBeGreaterThan(
      schedule.slices[schedule.slices.length - 1].sliceQuantity
    );
  });

  it('handles asymptotic hyperbolic approximation without overflow when kappa * T > 50', () => {
    const extremeParams: AlmgrenChrissParams = {
      ...baseParams,
      riskAversion: 1000,
      volatility: 0.5,
      temporaryImpact: 0.001,
      horizonSeconds: 1000,
    };
    const kappa = computeKappa(extremeParams);
    expect(kappa * extremeParams.horizonSeconds).toBeGreaterThan(50);

    const trajectory = computeInventoryTrajectory(extremeParams, kappa);
    expect(trajectory[0]).toBe(extremeParams.initialInventory);
    expect(trajectory[trajectory.length - 1]).toBe(0);
    expect(Number.isFinite(trajectory[1])).toBe(true);
  });

  it('dynamically throttles horizon and switches to passive maker when VPIN spikes', () => {
    // Normal toxicity
    const normal = evaluateVpinThrottling(300, 0.4, DEFAULT_VPIN_THROTTLE_CONFIG);
    expect(normal.isThrottled).toBe(false);
    expect(normal.adjustedHorizonSeconds).toBe(300);
    expect(normal.preferPassiveMaker).toBe(false);

    // Moderate toxicity: expands horizon
    const moderate = evaluateVpinThrottling(300, 0.90, DEFAULT_VPIN_THROTTLE_CONFIG);
    expect(moderate.isThrottled).toBe(true);
    expect(moderate.adjustedHorizonSeconds).toBeGreaterThan(300);
    expect(moderate.preferPassiveMaker).toBe(false);

    // Critical toxicity: switches to passive maker
    const critical = evaluateVpinThrottling(300, 0.98, DEFAULT_VPIN_THROTTLE_CONFIG);
    expect(critical.isThrottled).toBe(true);
    expect(critical.preferPassiveMaker).toBe(true);

    const criticalSchedule = generateAlmgrenChrissSchedule(baseParams, 0.98);
    expect(criticalSchedule.isThrottled).toBe(true);
    expect(criticalSchedule.slices[0].orderType).toBe('passive_maker');
  });

  it('safely handles edge cases like zero inventory or empty intervals', () => {
    const zeroParams: AlmgrenChrissParams = {
      ...baseParams,
      initialInventory: 0,
      numIntervals: 0,
    };
    const traj = computeInventoryTrajectory(zeroParams, 0);
    expect(traj).toEqual([0]);

    const zeroKappa = computeKappa({ ...baseParams, volatility: 0 });
    expect(zeroKappa).toBe(0);
  });
});
