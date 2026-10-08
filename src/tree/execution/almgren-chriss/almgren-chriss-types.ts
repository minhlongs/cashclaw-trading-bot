/**
 * @file almgren-chriss-types.ts
 * @description Type definitions for Almgren-Chriss optimal order slicing and Continuous VPIN throttling.
 */

export interface AlmgrenChrissParams {
  /** Initial inventory to liquidate or acquire (positive float) */
  initialInventory: number;
  /** Total planned execution horizon in seconds (T) */
  horizonSeconds: number;
  /** Number of discrete execution intervals (N) */
  numIntervals: number;
  /** Trader risk aversion parameter lambda >= 0 */
  riskAversion: number;
  /** Asset volatility sigma > 0 */
  volatility: number;
  /** Temporary market impact parameter eta > 0 */
  temporaryImpact: number;
}

export type OrderExecutionType = 'aggressive_market' | 'passive_maker';

export interface ExecutionSlice {
  sliceIndex: number;
  scheduledTimeSeconds: number;
  sliceQuantity: number;
  remainingInventory: number;
  orderType: OrderExecutionType;
  expectedImpactCostUsd: number;
}

export interface AlmgrenChrissSchedule {
  totalInventory: number;
  totalDurationSeconds: number;
  urgencyKappa: number;
  slices: ExecutionSlice[];
  totalExpectedCostUsd: number;
  isThrottled: boolean;
}

export interface VpinThrottleConfig {
  /** CDF threshold triggering horizon expansion (default: 0.85) */
  toxicityCdfThreshold: number;
  /** Horizon dilation multiplier factor (default: 2.0) */
  dilationFactor: number;
  /** Critical toxicity threshold triggering complete passive switch (default: 0.95) */
  criticalCdfThreshold: number;
}

export interface ThrottleResult {
  adjustedHorizonSeconds: number;
  dilationMultiplier: number;
  preferPassiveMaker: boolean;
  isThrottled: boolean;
}
