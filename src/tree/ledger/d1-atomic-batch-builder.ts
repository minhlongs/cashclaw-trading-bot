// Gate G10: Atomic Group Batch Statement Builders for D1 Double-Entry Commits.

import { ok, err, type Result } from '@/lib/result';
import {
  ZERO_BIGINT,
  type AtomicLedgerCommitStep,
  type AtomicLedgerGroupCommitInput,
  type AtomicOrderStateUpsert,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from './ledger-types';
import { computeBalanceSheet, validateBalancedLegs } from './double-entry-math';
import {
  INSERT_FIRST_JOURNAL_LEG_GUARDED_SQL,
  INSERT_PROCESSED_EVENT_HASH_SQL,
  INSERT_SUBSEQUENT_JOURNAL_LEG_SQL,
  UPDATE_ACCOUNT_BALANCES_OPTIMISTIC_SQL,
  UPSERT_ORDER_STATE_SQL,
  toSqlInteger,
  toSqlIntegers,
} from './d1-ledger-sql';
import { buildPositionBatchStatements, hasPositionsTableInDb } from './d1-positions-sql';

export function classifyBatchError(rawError: unknown): string {
  const msg = rawError instanceof Error ? rawError.message : String(rawError);
  if (msg.includes('UNIQUE') && msg.includes('processed_event_hashes')) {
    return `DUPLICATE_EVENT_HASH: ${msg}`;
  }
  if (msg.includes('paper_journal_entries.account_version') || msg.includes('CHECK constraint')) {
    return `OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED: ${msg}`;
  }
  return `BATCH_ABORTED: ${msg}`;
}

export function bindOrderUpsertStmt(
  db: D1DatabaseLike,
  botId: string,
  fencingToken: number,
  ord: AtomicOrderStateUpsert,
): Result<D1PreparedStatementLike> {
  const numsRes = toSqlIntegers([
    ord.quantityBase,
    ord.filledQtyBase,
    ord.limitPriceMicroUsd,
    ord.reservedMarginMicroUsd,
  ]);
  if (!numsRes.ok) return numsRes;
  const nums = numsRes.data;
  return ok(
    db.prepare(UPSERT_ORDER_STATE_SQL).bind(
      botId, ord.clientOrderId, ord.symbol, ord.side, ord.orderType,
      nums[0], nums[1], nums[2], nums[3],
      ord.reduceOnly ? 1 : 0, ord.lifecycleState, fencingToken, ord.createdAtMs, ord.updatedAtMs,
    ),
  );
}

function validateCommitStep(step: AtomicLedgerCommitStep): Result<true> {
  const legValid = validateBalancedLegs(step.entry.legs);
  if (!legValid.ok) return legValid;
  if (!computeBalanceSheet(step.nextBalances).balanced) {
    return err('UNBALANCED_JOURNAL_ENTRY: target balance sheet violates Assets === Liabilities + Equity');
  }
  if (step.nextBalances.CASH_AVAILABLE < ZERO_BIGINT) {
    return err('INSUFFICIENT_AVAILABLE_CASH: target cash balance is negative');
  }
  return ok(true);
}

function appendStepStatements(
  db: D1DatabaseLike,
  botId: string,
  fencingToken: number,
  expectedVersion: number,
  step: AtomicLedgerCommitStep,
  statements: D1PreparedStatementLike[],
  accountUpdateIndices: number[],
): Result<true> {
  const b = step.nextBalances;
  const valsRes = toSqlIntegers([
    b.CASH_AVAILABLE, b.MARGIN_RESERVED, b.POSITION_MARGIN, b.REALIZED_PNL,
    b.FEES_EXPENSE, b.FUNDING_NET, b.INITIAL_CAPITAL, step.requiredCashMicroUsd,
  ]);
  if (!valsRes.ok) return valsRes;
  const vals = valsRes.data;
  const nextVersion = expectedVersion + 1;

  statements.push(
    db.prepare(INSERT_PROCESSED_EVENT_HASH_SQL).bind(
      botId, step.entry.eventHash, step.entry.eventType, nextVersion, step.entry.timestampMs,
    ),
  );
  accountUpdateIndices.push(statements.length);
  statements.push(
    db.prepare(UPDATE_ACCOUNT_BALANCES_OPTIMISTIC_SQL).bind(
      vals[0], vals[1], vals[2], vals[3], vals[4], vals[5], vals[6],
      fencingToken, step.entry.timestampMs, botId, expectedVersion, vals[7],
    ),
  );

  for (let i = 0; i < step.entry.legs.length; i++) {
    const leg = step.entry.legs[i]!;
    const amt = toSqlInteger(leg.amountMicroUsd);
    if (!amt.ok) return amt;
    const sql = i === 0 ? INSERT_FIRST_JOURNAL_LEG_GUARDED_SQL : INSERT_SUBSEQUENT_JOURNAL_LEG_SQL;
    statements.push(
      db.prepare(sql).bind(
        step.entry.entryId, botId, step.entry.eventHash, i,
        leg.account, leg.direction, amt.data, nextVersion, step.entry.timestampMs,
      ),
    );
  }
  return ok(true);
}

export interface BuiltGroupCommitPlan {
  readonly statements: D1PreparedStatementLike[];
  readonly accountUpdateIndices: readonly number[];
  readonly orderUpsertIndices: readonly number[];
}

export async function buildGroupCommitPlan(
  db: D1DatabaseLike,
  input: AtomicLedgerGroupCommitInput,
): Promise<Result<BuiltGroupCommitPlan>> {
  const upserts = input.orderUpserts ?? [];
  if (input.steps.length === 0 && upserts.length === 0 && input.positions === undefined) {
    return err('EMPTY_ATOMIC_COMMIT_GROUP: no journal steps, order upserts, or positions supplied');
  }

  const statements: D1PreparedStatementLike[] = [];
  const accountUpdateIndices: number[] = [];
  const orderUpsertIndices: number[] = [];

  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i]!;
    const expectedPrev = input.expectedVersion + i;
    const valid = validateCommitStep(step);
    if (!valid.ok) return valid;
    const stepRes = appendStepStatements(
      db, input.botId, input.fencingToken, expectedPrev, step, statements, accountUpdateIndices,
    );
    if (!stepRes.ok) return stepRes;
  }

  for (const ord of upserts) {
    const ordStmt = bindOrderUpsertStmt(db, input.botId, input.fencingToken, ord);
    if (!ordStmt.ok) return ordStmt;
    orderUpsertIndices.push(statements.length);
    statements.push(ordStmt.data);
  }

  if (input.positions !== undefined && (await hasPositionsTableInDb(db))) {
    const updatedAtMs = input.steps.at(-1)?.entry.timestampMs ?? upserts.at(-1)?.updatedAtMs ?? Date.now();
    const posRes = buildPositionBatchStatements(db, input.botId, input.fencingToken, updatedAtMs, input.positions);
    if (!posRes.ok) return posRes;
    statements.push(...posRes.data);
  }

  return ok({ statements, accountUpdateIndices, orderUpsertIndices });
}
