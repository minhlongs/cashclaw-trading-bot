// Gate G9: Deterministic Durable-Ready Paper Order Lifecycle Engine.

import { ok, err, type Result } from '@/lib/result';
import {
  BPS_SCALE, MicroDoubleEntryLedger, ZERO_BIGINT, computeRequiredMarginMicroUsd,
} from '../../ledger';
import { processOrderFillEvent } from './lifecycle-fill-processor';
import {
  checkOrderSubmissionGuards, evaluateReduceOnlyOrderQty,
  isTerminalOrderState, isUncertainAckState, sumActiveReduceOnlyQty,
} from './lifecycle-helpers';
import {
  evaluatePairedLegExecution, runVenueSnapshotReconciliation, type StoredPairedLegRecord,
} from './lifecycle-reconciliation';
import {
  DEFAULT_CANCEL_UNCERTAINTY_WINDOW_MS,
  DEFAULT_RECONCILE_SAFETY_WINDOW_MS,
  type ApplyFillEventOutcome, LifecycleFillEvent, LifecycleOrderRecord, OrderStatusNotification,
  PairedLegEvaluation, PairedLegRegistration, ReconcileSnapshotOutcome,
  SubmitLifecycleOrderInput, SubmitLifecycleOrderOutcome, VenueOrderSnapshot,
} from './lifecycle-types';

export interface PaperOrderLifecycleEngineOptions {
  readonly botId?: string;
  readonly ledger?: MicroDoubleEntryLedger;
  readonly defaultMarginRateBps?: bigint;
  readonly defaultReconcileWindowMs?: number;
  readonly defaultCancelUncertaintyMs?: number;
}

function resolveInitialAckState(input: SubmitLifecycleOrderInput): 'PENDING_ACK' | 'RECONCILING' | 'open' {
  if (input.enterPendingAckOnly) return 'PENDING_ACK';
  if (input.simulateGatewayTimeout) return 'RECONCILING';
  return 'open';
}

export class PaperOrderLifecycleEngine {
  private readonly ledger: MicroDoubleEntryLedger;
  private readonly orders = new Map<string, LifecycleOrderRecord>();
  private readonly pairs = new Map<string, StoredPairedLegRecord>();
  private readonly defaultMarginRateBps: bigint;
  private readonly defaultReconcileWindowMs: number;
  private readonly defaultCancelUncertaintyMs: number;

  public constructor(options: PaperOrderLifecycleEngineOptions = {}) {
    this.ledger = options.ledger ?? new MicroDoubleEntryLedger(options.botId ?? 'paper-bot');
    this.defaultMarginRateBps = options.defaultMarginRateBps ?? BPS_SCALE;
    this.defaultReconcileWindowMs = options.defaultReconcileWindowMs ?? DEFAULT_RECONCILE_SAFETY_WINDOW_MS;
    this.defaultCancelUncertaintyMs = options.defaultCancelUncertaintyMs ?? DEFAULT_CANCEL_UNCERTAINTY_WINDOW_MS;
  }

  public getLedger(): MicroDoubleEntryLedger { return this.ledger; }
  public getOrder(clientOrderId: string): LifecycleOrderRecord | undefined { return this.orders.get(clientOrderId); }
  public getAllOrders(): readonly LifecycleOrderRecord[] { return Array.from(this.orders.values()); }

  public submitOrder(input: SubmitLifecycleOrderInput): Result<SubmitLifecycleOrderOutcome> {
    const key = input.idempotencyKey.trim();
    const guard = checkOrderSubmissionGuards(this.orders, key, input);
    if (!guard.ok) return guard;
    if (guard.data) return ok({ order: guard.data, deduplicated: true });

    const reduceOnly = Boolean(input.reduceOnly);
    const marginRateBps = input.marginRateBps ?? this.defaultMarginRateBps;
    let effectiveQtyBase = input.quantityBase;
    let clippedByReduceOnly = false;
    if (reduceOnly) {
      const pos = this.ledger.getPosition(input.symbol);
      const roRes = evaluateReduceOnlyOrderQty(
        pos.signedQtyBase, sumActiveReduceOnlyQty(this.orders.values(), input.symbol, input.side), input.side, input.quantityBase,
      );
      if (!roRes.ok) return roRes;
      effectiveQtyBase = roRes.data.effectiveQtyBase;
      clippedByReduceOnly = roRes.data.clipped;
    }

    const reservedMicroUsd = reduceOnly
      ? ZERO_BIGINT
      : computeRequiredMarginMicroUsd(effectiveQtyBase, input.priceMicroUsd, marginRateBps);
    if (reservedMicroUsd > ZERO_BIGINT) {
      const resv = this.ledger.reserveMargin(`reserve_${key}`, reservedMicroUsd, input.nowMs);
      if (!resv.ok) return err(`INSUFFICIENT_FREE_MARGIN: ${resv.error}`);
    }

    const state = resolveInitialAckState(input);
    const windowMs = input.reconcileSafetyWindowMs ?? this.defaultReconcileWindowMs;
    const record: LifecycleOrderRecord = {
      clientOrderId: key, symbol: input.symbol, side: input.side, type: input.type,
      requestedQtyBase: input.quantityBase, effectiveQtyBase, clippedByReduceOnly,
      filledQtyBase: ZERO_BIGINT, remainingQtyBase: effectiveQtyBase, priceMicroUsd: input.priceMicroUsd,
      cumulativeFillNotionalMicroUsd: ZERO_BIGINT, avgFillPriceMicroUsd: ZERO_BIGINT,
      reduceOnly, marginRateBps, initialReservedMicroUsd: reservedMicroUsd, reservedMicroUsd,
      state, appliedFillIds: [], highestAppliedSeq: 0,
      ...(isUncertainAckState(state) ? { reconcileDeadlineMs: input.nowMs + windowMs } : {}),
      createdAtMs: input.nowMs, updatedAtMs: input.nowMs,
    };
    this.orders.set(key, record);
    return ok({ order: record, deduplicated: false });
  }

  public markGatewayTimeout(clientOrderId: string, nowMs: number, safetyWindowMs?: number): Result<LifecycleOrderRecord> {
    const ord = this.orders.get(clientOrderId);
    if (!ord) return err(`ORDER_NOT_FOUND: ${clientOrderId}`);
    if (isTerminalOrderState(ord.state)) return err(`TERMINAL_ORDER_IMMUTABLE: ${ord.state}`);
    const updated: LifecycleOrderRecord = {
      ...ord, state: 'RECONCILING',
      reconcileDeadlineMs: nowMs + (safetyWindowMs ?? this.defaultReconcileWindowMs),
      updatedAtMs: nowMs,
    };
    this.orders.set(clientOrderId, updated);
    return ok(updated);
  }

  public applyFillEvent(event: LifecycleFillEvent): Result<ApplyFillEventOutcome> {
    return processOrderFillEvent(this.orders, this.ledger, event);
  }

  public applyOrderStatusEvent(ev: OrderStatusNotification): Result<LifecycleOrderRecord> {
    const ord = this.orders.get(ev.clientOrderId);
    if (!ord) return err(`ORDER_NOT_FOUND: ${ev.clientOrderId}`);
    if (isTerminalOrderState(ord.state)) return ok(ord);
    if (ev.status === 'cancelled' || ev.status === 'rejected' || ev.status === 'expired') {
      return this.terminateOrder(ev.clientOrderId, ev.status, ev.timestampMs);
    }
    if ((ev.status === 'open' && ord.filledQtyBase > ZERO_BIGINT) || ev.seq < ord.highestAppliedSeq) {
      return ok(ord);
    }
    const next: LifecycleOrderRecord = { ...ord, state: ev.status, highestAppliedSeq: ev.seq, updatedAtMs: ev.timestampMs };
    this.orders.set(ev.clientOrderId, next);
    return ok(next);
  }

  private terminateOrder(
    clientOrderId: string, target: 'cancelled' | 'rejected' | 'expired', nowMs: number, uncertaintyMs?: number,
  ): Result<LifecycleOrderRecord> {
    const ord = this.orders.get(clientOrderId);
    if (!ord) return err(`ORDER_NOT_FOUND: ${clientOrderId}`);
    if (isTerminalOrderState(ord.state)) return ok(ord);
    if (ord.reservedMicroUsd > ZERO_BIGINT) {
      const rel = this.ledger.releaseMargin(`release_${target}_${clientOrderId}`, ord.reservedMicroUsd, nowMs);
      if (!rel.ok) return err(rel.error);
    }
    const updated: LifecycleOrderRecord = {
      ...ord, state: target, reservedMicroUsd: ZERO_BIGINT, reconcileDeadlineMs: undefined,
      ...(target === 'cancelled' ? { cancelUncertaintyUntilMs: nowMs + (uncertaintyMs ?? this.defaultCancelUncertaintyMs) } : {}),
      updatedAtMs: nowMs,
    };
    this.orders.set(clientOrderId, updated);
    return ok(updated);
  }

  public cancelOrder(clientOrderId: string, nowMs: number, uncertaintyMs?: number): Result<LifecycleOrderRecord> {
    return this.terminateOrder(clientOrderId, 'cancelled', nowMs, uncertaintyMs);
  }
  public expireOrder(clientOrderId: string, nowMs: number): Result<LifecycleOrderRecord> {
    return this.terminateOrder(clientOrderId, 'expired', nowMs);
  }
  public rejectOrder(clientOrderId: string, nowMs: number): Result<LifecycleOrderRecord> {
    return this.terminateOrder(clientOrderId, 'rejected', nowMs);
  }

  public reconcileWithVenueSnapshot(venueOrders: readonly VenueOrderSnapshot[], nowMs: number): Result<ReconcileSnapshotOutcome> {
    return runVenueSnapshotReconciliation(
      {
        getOrdersValues: () => this.orders.values(),
        setOrder: (rec) => { this.orders.set(rec.clientOrderId, rec); },
        applyFillEvent: (ev) => this.applyFillEvent(ev),
        terminateAndReleaseMargin: (id, st, t) => this.terminateOrder(id, st, t),
      },
      venueOrders, nowMs,
    );
  }

  public registerPairedLegs(reg: PairedLegRegistration): Result<PairedLegRegistration> {
    if (!reg.pairId.trim()) return err('INVALID_ORDER_PARAMS: pairId required');
    const normalized: Required<PairedLegRegistration> = {
      ...reg, maxLegDelayMs: reg.maxLegDelayMs ?? 3_000, maxAdverseMoveBps: reg.maxAdverseMoveBps ?? BigInt(500),
    };
    this.pairs.set(reg.pairId, { registration: normalized, state: 'ACTIVE' });
    return ok(normalized);
  }

  public evaluatePairedLegs(pairId: string, currentMarkPriceMicroUsd: bigint, nowMs: number): Result<PairedLegEvaluation> {
    const pair = this.pairs.get(pairId);
    if (!pair) return err(`PAIR_NOT_FOUND: ${pairId}`);
    return evaluatePairedLegExecution(
      pair, this.orders.get(pair.registration.legAClientOrderId),
      this.orders.get(pair.registration.legBClientOrderId), currentMarkPriceMicroUsd, nowMs,
    );
  }
}
