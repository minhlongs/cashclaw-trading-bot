// Gate G9: Paper Order Lifecycle State Machine Contracts (Pure Open-Core).

export const DEFAULT_RECONCILE_SAFETY_WINDOW_MS = 5_000;
export const DEFAULT_CANCEL_UNCERTAINTY_WINDOW_MS = 2_000;

export type PaperLifecycleOrderState =
  | 'PENDING_ACK'
  | 'RECONCILING'
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired';

export type LifecycleErrorCode =
  | 'INVALID_ORDER_PARAMS'
  | 'IDEMPOTENCY_PAYLOAD_MISMATCH'
  | 'INSUFFICIENT_FREE_MARGIN'
  | 'REDUCE_ONLY_REJECTED'
  | 'RECONCILIATION_REQUIRED'
  | 'OVERFILL_GUARD'
  | 'ORDER_NOT_FOUND'
  | 'TERMINAL_ORDER_IMMUTABLE'
  | 'PAIR_NOT_FOUND';

export interface SubmitLifecycleOrderInput {
  readonly idempotencyKey: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly type: 'market' | 'limit';
  readonly quantityBase: bigint;
  readonly priceMicroUsd: bigint;
  readonly reduceOnly?: boolean;
  readonly marginRateBps?: bigint;
  readonly simulateGatewayTimeout?: boolean;
  readonly enterPendingAckOnly?: boolean;
  readonly reconcileSafetyWindowMs?: number;
  readonly replacesClientOrderId?: string;
  readonly nowMs: number;
}

export interface LifecycleOrderRecord {
  readonly clientOrderId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly type: 'market' | 'limit';
  readonly requestedQtyBase: bigint;
  readonly effectiveQtyBase: bigint;
  readonly clippedByReduceOnly: boolean;
  readonly filledQtyBase: bigint;
  readonly remainingQtyBase: bigint;
  readonly priceMicroUsd: bigint;
  readonly cumulativeFillNotionalMicroUsd: bigint;
  readonly avgFillPriceMicroUsd: bigint;
  readonly reduceOnly: boolean;
  readonly marginRateBps: bigint;
  readonly initialReservedMicroUsd: bigint;
  readonly reservedMicroUsd: bigint;
  readonly state: PaperLifecycleOrderState;
  readonly appliedFillIds: readonly string[];
  readonly highestAppliedSeq: number;
  readonly firstFillAtMs?: number;
  readonly reconcileDeadlineMs?: number;
  readonly cancelUncertaintyUntilMs?: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface SubmitLifecycleOrderOutcome {
  readonly order: LifecycleOrderRecord;
  readonly deduplicated: boolean;
}

export interface LifecycleFillEvent {
  readonly fillEventId: string;
  readonly clientOrderId: string;
  readonly seq: number;
  readonly fillQtyBase: bigint;
  readonly fillPriceMicroUsd: bigint;
  readonly feeMicroUsd?: bigint;
  readonly timestampMs: number;
}

export interface ApplyFillEventOutcome {
  readonly order: LifecycleOrderRecord;
  readonly duplicateIgnored: boolean;
  readonly lateCancelReconciled: boolean;
  readonly releasedReservationMicroUsd: bigint;
}

export interface OrderStatusNotification {
  readonly clientOrderId: string;
  readonly status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'expired';
  readonly seq: number;
  readonly timestampMs: number;
}

export interface VenueOrderSnapshot {
  readonly clientOrderId: string;
  readonly status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'expired';
  readonly filledQtyBase: bigint;
  readonly avgFillPriceMicroUsd?: bigint;
  readonly feeMicroUsd?: bigint;
  readonly fills?: readonly LifecycleFillEvent[];
}

export interface ReconcileSnapshotOutcome {
  readonly reconciledOrders: readonly LifecycleOrderRecord[];
  readonly expiredAbsentOrderIds: readonly string[];
  readonly stillReconcilingOrderIds: readonly string[];
}

export type PairedLegStrategyState =
  | 'ACTIVE'
  | 'HEDGED'
  | 'UNWINDING_BROKEN_LEG'
  | 'SUSPENDED_BROKEN_LEG';

export interface PairedLegRegistration {
  readonly pairId: string;
  readonly symbol: string;
  readonly legAClientOrderId: string;
  readonly legBClientOrderId: string;
  readonly maxLegDelayMs?: number;
  readonly maxAdverseMoveBps?: bigint;
}

export interface PairedLegUnwindIntent {
  readonly unwindClientOrderId: string;
  readonly pairId: string;
  readonly brokenLegOrderId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly type: 'market';
  readonly quantityBase: bigint;
  readonly reduceOnly: true;
  readonly reason: string;
}

export interface PairedLegEvaluation {
  readonly pairId: string;
  readonly state: PairedLegStrategyState;
  readonly unhedgedQtyBase: bigint;
  readonly adverseMoveExceeded: boolean;
  readonly unwindIntent?: PairedLegUnwindIntent;
}
