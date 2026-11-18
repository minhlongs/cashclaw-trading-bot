// Durable Sync Cursor, Atomic Group Commit Orchestration & Fail-Closed Recovery Helpers.
import { ok, err, type Result } from '@/lib/result';
import type { LifecycleOrderRecord, PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  ZERO_BIGINT, type AtomicLedgerCommitStep, type AtomicOrderStateUpsert, type D1AtomicLedgerBatcher,
  type LedgerAccountBalances, type LedgerSnapshot, type LoadedDurableLedgerState, type MicroDoubleEntryLedger,
} from '../ledger';
import { applyLegsToBalances, createZeroAccountBalances } from '../ledger/double-entry-math';
import { restoreEngineFromDurableState } from './bot-ledger-hydration';
import type { OrderContext } from './bot-order-executor-types';

export interface DurableLedgerSyncCursor {
  initialized: boolean;
  version: number;
  balances: LedgerAccountBalances;
  readonly pendingOrderUpserts: Map<string, AtomicOrderStateUpsert>;
  needsPostDispatchRecovery: boolean;
  haltedError: string | null;
}

const syncCursors = new WeakMap<MicroDoubleEntryLedger, DurableLedgerSyncCursor>();
export const lifecycleAttemptCounters = new WeakMap<PaperOrderLifecycleEngine, number>();

export function getOrCreateSyncCursor(ledger: MicroDoubleEntryLedger): DurableLedgerSyncCursor {
  let cursor = syncCursors.get(ledger);
  if (!cursor) {
    cursor = {
      initialized: false, version: 0, balances: createZeroAccountBalances(),
      pendingOrderUpserts: new Map<string, AtomicOrderStateUpsert>(),
      needsPostDispatchRecovery: false, haltedError: null,
    };
    syncCursors.set(ledger, cursor);
  }
  return cursor;
}

function balancesEqual(a: LedgerAccountBalances, b: LedgerAccountBalances): boolean {
  return (
    a.CASH_AVAILABLE === b.CASH_AVAILABLE && a.MARGIN_RESERVED === b.MARGIN_RESERVED &&
    a.POSITION_MARGIN === b.POSITION_MARGIN && a.REALIZED_PNL === b.REALIZED_PNL &&
    a.FEES_EXPENSE === b.FEES_EXPENSE && a.FUNDING_NET === b.FUNDING_NET &&
    a.INITIAL_CAPITAL === b.INITIAL_CAPITAL
  );
}

export function buildPendingCommitSteps(
  cursor: DurableLedgerSyncCursor, ledger: MicroDoubleEntryLedger,
): Result<AtomicLedgerCommitStep[]> {
  const pending = ledger.getJournalEntries().filter((e) => e.version > cursor.version);
  const steps: AtomicLedgerCommitStep[] = [];
  let runningVersion = cursor.version;
  let runningBalances = cursor.balances;
  for (const entry of pending) {
    if (entry.version !== runningVersion + 1) {
      return err(`LEDGER_RAM_DRIFT_DETECTED: expected version ${runningVersion + 1}, got ${entry.version}`);
    }
    const nextBalances = applyLegsToBalances(runningBalances, entry.legs);
    const cashOutflow = runningBalances.CASH_AVAILABLE - nextBalances.CASH_AVAILABLE;
    steps.push({
      entry, nextBalances, requiredCashMicroUsd: cashOutflow > ZERO_BIGINT ? cashOutflow : ZERO_BIGINT,
    });
    runningVersion = entry.version;
    runningBalances = nextBalances;
  }
  if (runningVersion !== ledger.getVersion() || !balancesEqual(runningBalances, ledger.getAccountBalances())) {
    return err(`LEDGER_RAM_DRIFT_DETECTED: cursor (${runningVersion}) diverged from ledger (${ledger.getVersion()})`);
  }
  return ok(steps);
}

async function executeRawAtomicWrite(
  botId: string, ledger: MicroDoubleEntryLedger, batcher: D1AtomicLedgerBatcher,
  expectedVersion: number, steps: readonly AtomicLedgerCommitStep[], upserts: readonly AtomicOrderStateUpsert[],
): Promise<Result<true>> {
  if (steps.length === 0 && upserts.length === 0) return ok(true);
  if (steps.length === 0 && upserts.length === 1) {
    return batcher.writePendingOrderIntent(botId, ledger.getFencingToken(), upserts[0]!);
  }
  const groupRes = await batcher.commitAtomicGroup({
    botId, expectedVersion, fencingToken: ledger.getFencingToken(), steps, orderUpserts: upserts,
    ...(steps.length > 0 ? { positions: ledger.getAllPositions() } : {}),
  });
  return groupRes.ok ? ok(true) : groupRes;
}

async function probeAndReconcilePreAck(
  batcher: D1AtomicLedgerBatcher, botId: string, ledger: MicroDoubleEntryLedger,
  cursor: DurableLedgerSyncCursor, steps: readonly AtomicLedgerCommitStep[], upserts: readonly AtomicOrderStateUpsert[],
): Promise<{ reconciled: boolean; durableState: LoadedDurableLedgerState | null }> {
  let loaded: LoadedDurableLedgerState | null = null;
  try {
    loaded = await batcher.loadDurableBotState(botId);
  } catch {
    return { reconciled: false, durableState: null };
  }
  if (!loaded) return { reconciled: false, durableState: null };
  const hashSet = new Set(loaded.processedEventHashes);
  const intentMap = new Map(loaded.orderIntents.map((o) => [o.clientOrderId, o]));
  const allStepsCommitted = steps.every((s) => hashSet.has(s.entry.eventHash));
  const allUpsertsCommitted = upserts.every((u) => {
    const row = intentMap.get(u.clientOrderId);
    return Boolean(row && row.lifecycleState === u.lifecycleState && row.filledQtyBase === u.filledQtyBase);
  });
  if (
    allStepsCommitted && allUpsertsCommitted &&
    loaded.version === cursor.version + steps.length &&
    balancesEqual(loaded.balances, ledger.getAccountBalances())
  ) {
    cursor.version = loaded.version;
    cursor.balances = { ...loaded.balances };
    cursor.pendingOrderUpserts.clear();
    cursor.needsPostDispatchRecovery = false;
    return { reconciled: true, durableState: loaded };
  }
  return { reconciled: false, durableState: loaded };
}

export async function flushPreDispatchAtomic(args: {
  ctx: OrderContext; lifecycleEngine: PaperOrderLifecycleEngine; batcher: D1AtomicLedgerBatcher;
  order: LifecycleOrderRecord; upsert: AtomicOrderStateUpsert; preSubmitSnapshot: LedgerSnapshot; nowMs: number;
}): Promise<void> {
  const { ctx, lifecycleEngine, batcher, order, upsert, preSubmitSnapshot, nowMs } = args;
  const ledger = lifecycleEngine.getLedger();
  const cursor = getOrCreateSyncCursor(ledger);
  const stepsRes = buildPendingCommitSteps(cursor, ledger);
  if (!stepsRes.ok) {
    ledger.restoreSnapshot(preSubmitSnapshot);
    cursor.haltedError = stepsRes.error;
    ctx.emitTelemetry('error', { error: stepsRes.error, context: 'bot.ledgerBatcher' });
    throw new Error(`Durable ledger commit failed: ${stepsRes.error}`);
  }
  const steps = stepsRes.data;
  const writeRes = await executeRawAtomicWrite(ctx.botId, ledger, batcher, cursor.version, steps, [upsert]);
  if (writeRes.ok) {
    cursor.version += steps.length;
    cursor.balances = { ...ledger.getAccountBalances() };
    return;
  }
  const probe = await probeAndReconcilePreAck(batcher, ctx.botId, ledger, cursor, steps, [upsert]);
  if (probe.reconciled) return;

  ledger.restoreSnapshot(preSubmitSnapshot);
  lifecycleEngine.hydrateOrderRecord({
    ...order, state: 'rejected', reservedMicroUsd: ZERO_BIGINT,
    remainingQtyBase: ZERO_BIGINT, reconcileDeadlineMs: undefined, updatedAtMs: nowMs,
  });
  if (probe.durableState && probe.durableState.fencingToken > preSubmitSnapshot.fencingToken) {
    restoreEngineFromDurableState(lifecycleEngine, probe.durableState);
    cursor.version = probe.durableState.version;
    cursor.balances = { ...probe.durableState.balances };
    cursor.haltedError = `STALE_FENCING_TOKEN: superseded by ${probe.durableState.fencingToken}`;
  } else if (probe.durableState && probe.durableState.version > cursor.version) {
    const maxSeq = restoreEngineFromDurableState(lifecycleEngine, probe.durableState);
    if (maxSeq > (lifecycleAttemptCounters.get(lifecycleEngine) ?? 0)) lifecycleAttemptCounters.set(lifecycleEngine, maxSeq);
    cursor.version = probe.durableState.version;
    cursor.balances = { ...probe.durableState.balances };
  }
  ctx.emitTelemetry('error', { error: writeRes.error, context: 'bot.ledgerBatcher' });
  throw new Error(`${steps.length === 0 ? 'Durable pending order intent failed' : 'Durable ledger commit failed'}: ${writeRes.error}`);
}

export async function flushOrRecoverPostDispatch(args: {
  ctx: OrderContext; ledger: MicroDoubleEntryLedger; batcher: D1AtomicLedgerBatcher;
  upsert?: AtomicOrderStateUpsert; zeroStepErrorPrefix: string; ledgerStepErrorPrefix: string;
}): Promise<void> {
  const { ctx, ledger, batcher, upsert, zeroStepErrorPrefix, ledgerStepErrorPrefix } = args;
  const cursor = getOrCreateSyncCursor(ledger);
  const stepsRes = buildPendingCommitSteps(cursor, ledger);
  if (!stepsRes.ok) {
    cursor.haltedError = stepsRes.error;
    ctx.emitTelemetry('error', { error: stepsRes.error, context: 'bot.ledgerBatcher' });
    throw new Error(`${ledgerStepErrorPrefix}: ${stepsRes.error}`);
  }
  const merged = new Map(cursor.pendingOrderUpserts);
  if (upsert) merged.set(upsert.clientOrderId, upsert);
  const upserts = Array.from(merged.values());
  const steps = stepsRes.data;
  const writeRes = await executeRawAtomicWrite(ctx.botId, ledger, batcher, cursor.version, steps, upserts);
  if (writeRes.ok) {
    cursor.version += steps.length;
    cursor.balances = { ...ledger.getAccountBalances() };
    cursor.pendingOrderUpserts.clear();
    cursor.needsPostDispatchRecovery = false;
    return;
  }
  const probe = await probeAndReconcilePreAck(batcher, ctx.botId, ledger, cursor, steps, upserts);
  if (probe.reconciled) return;

  for (const u of upserts) cursor.pendingOrderUpserts.set(u.clientOrderId, u);
  const fenced = Boolean(probe.durableState && probe.durableState.fencingToken > ledger.getFencingToken());
  if (fenced || !writeRes.error.startsWith('BATCH_ABORTED')) cursor.haltedError = writeRes.error;
  else cursor.needsPostDispatchRecovery = true;
  ctx.emitTelemetry('error', { error: writeRes.error, context: 'bot.ledgerBatcher' });
  throw new Error(`${steps.length === 0 ? zeroStepErrorPrefix : ledgerStepErrorPrefix}: ${writeRes.error}`);
}
