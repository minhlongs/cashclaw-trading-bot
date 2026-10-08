// Runtime Execution Contracts — Smart Coordination & Risk Interception
import type { UrgencyMode, SorAllocation } from '../smart/smart-execution-types';

export interface ParentOrderExecutionRequest {
  readonly clientOrderId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly totalQuantity: number;
  readonly sliceCount: number;
  readonly durationMinutes: number;
  readonly jitterRatio?: number;
}

export interface CoordinatedSlicePlan {
  readonly sliceIndex: number;
  readonly scheduledDelayMs: number;
  readonly executionUrgency: UrgencyMode;
  readonly targetQuantity: number;
  readonly venueAllocations: readonly SorAllocation[];
}

export interface CoordinatedExecutionPlan {
  readonly parentOrderId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly totalPlannedQuantity: number;
  readonly slices: readonly CoordinatedSlicePlan[];
}

export interface RiskInterceptionDecision {
  readonly allowed: boolean;
  readonly action: 'execute' | 'throttle_half_size' | 'block_emergency_pause';
  readonly adjustedQuantity: number;
  readonly reason: string | null;
}
