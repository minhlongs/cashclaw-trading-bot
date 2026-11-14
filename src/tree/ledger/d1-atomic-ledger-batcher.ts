// Gate G10: Cloudflare D1 db.batch() Atomic Double-Entry Commit Adapter.

import { ok, err, type Result } from '@/lib/result';
import {
  ZERO_BIGINT,
  type AtomicLedgerCommitInput,
  type AtomicOrderStateUpsert,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from './ledger-types';
import { computeBalanceSheet, validateBalancedLegs } from './double-entry-math';
import {
  INIT_BOT_ACCOUNT_SQL,
  INSERT_FIRST_JOURNAL_LEG_GUARDED_SQL,
  INSERT_PROCESSED_EVENT_HASH_SQL,
  INSERT_SUBSEQUENT_JOURNAL_LEG_SQL,
  SELECT_ACCOUNT_ROW_SQL,
  SELECT_EVENT_HASHES_SQL,
  SELECT_ORDER_INTENTS_SQL,
  UPDATE_ACCOUNT_BALANCES_OPTIMISTIC_SQL,
  UPSERT_ORDER_STATE_SQL,
  mapOrderIntentRow,
  toSqlInteger,
  toSqlIntegers,
  type LoadedDurableLedgerState,
} from './d1-ledger-sql';

function classifyBatchError(rawError: unknown): string {
  const msg = rawError instanceof Error ? rawError.message : String(rawError);
  if (msg.includes('UNIQUE') && msg.includes('processed_event_hashes')) {
    return `DUPLICATE_EVENT_HASH: ${msg}`;
  }
  if (msg.includes('paper_journal_entries.account_version') || msg.includes('CHECK constraint')) {
    return `OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED: ${msg}`;
  }
  return `BATCH_ABORTED: ${msg}`;
}

function bindOrderUpsertStmt(
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

function buildBatchStatements(
  db: D1DatabaseLike,
  input: AtomicLedgerCommitInput,
): Result<D1PreparedStatementLike[]> {
  const b = input.nextBalances;
  const valsRes = toSqlIntegers([
    b.CASH_AVAILABLE, b.MARGIN_RESERVED, b.POSITION_MARGIN, b.REALIZED_PNL,
    b.FEES_EXPENSE, b.FUNDING_NET, b.INITIAL_CAPITAL, input.requiredCashMicroUsd,
  ]);
  if (!valsRes.ok) return valsRes;
  const vals = valsRes.data;

  const nextVersion = input.expectedVersion + 1;
  const statements: D1PreparedStatementLike[] = [
    db.prepare(INSERT_PROCESSED_EVENT_HASH_SQL).bind(
      input.botId, input.entry.eventHash, input.entry.eventType, nextVersion, input.entry.timestampMs,
    ),
    db.prepare(UPDATE_ACCOUNT_BALANCES_OPTIMISTIC_SQL).bind(
      vals[0], vals[1], vals[2], vals[3], vals[4], vals[5], vals[6],
      input.fencingToken, input.entry.timestampMs, input.botId, input.expectedVersion, vals[7],
    ),
  ];

  for (let i = 0; i < input.entry.legs.length; i++) {
    const leg = input.entry.legs[i];
    const amt = toSqlInteger(leg.amountMicroUsd);
    if (!amt.ok) return amt;
    const sql = i === 0 ? INSERT_FIRST_JOURNAL_LEG_GUARDED_SQL : INSERT_SUBSEQUENT_JOURNAL_LEG_SQL;
    statements.push(
      db.prepare(sql).bind(
        input.entry.entryId, input.botId, input.entry.eventHash, i,
        leg.account, leg.direction, amt.data, nextVersion, input.entry.timestampMs,
      ),
    );
  }

  if (input.orderUpsert) {
    const ordStmt = bindOrderUpsertStmt(db, input.botId, input.fencingToken, input.orderUpsert);
    if (!ordStmt.ok) return ordStmt;
    statements.push(ordStmt.data);
  }
  return ok(statements);
}

export class D1AtomicLedgerBatcher {
  private readonly db: D1DatabaseLike;

  public constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  public async initializeBotAccount(botId: string, nowMs: number, fencingToken = 0): Promise<void> {
    await this.db.prepare(INIT_BOT_ACCOUNT_SQL).bind(botId, fencingToken, nowMs).run();
  }

  public async writePendingOrderIntent(
    botId: string,
    fencingToken: number,
    intent: AtomicOrderStateUpsert,
  ): Promise<Result<true>> {
    const stmtRes = bindOrderUpsertStmt(this.db, botId, fencingToken, intent);
    if (!stmtRes.ok) return stmtRes;
    try {
      const res = await stmtRes.data.run();
      if (res.meta.changes === 0) return err('STALE_FENCING_TOKEN_ON_INTENT');
      return ok(true);
    } catch (e) {
      return err(classifyBatchError(e));
    }
  }

  public async commitAtomicBatch(
    input: AtomicLedgerCommitInput,
  ): Promise<Result<{ readonly committedVersion: number; readonly eventHash: string }>> {
    const legValid = validateBalancedLegs(input.entry.legs);
    if (!legValid.ok) return legValid;
    if (!computeBalanceSheet(input.nextBalances).balanced) {
      return err('UNBALANCED_JOURNAL_ENTRY: target balance sheet violates Assets === Liabilities + Equity');
    }
    if (input.nextBalances.CASH_AVAILABLE < ZERO_BIGINT) {
      return err('INSUFFICIENT_AVAILABLE_CASH: target cash balance is negative');
    }
    const stmtsRes = buildBatchStatements(this.db, input);
    if (!stmtsRes.ok) return stmtsRes;

    try {
      const batchRes = await this.db.batch(stmtsRes.data);
      if (batchRes[1]?.meta?.changes === 0) {
        return err('OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED: 0 account rows updated');
      }
      return ok({ committedVersion: input.expectedVersion + 1, eventHash: input.entry.eventHash });
    } catch (e) {
      return err(classifyBatchError(e));
    }
  }

  public async loadDurableBotState(botId: string): Promise<LoadedDurableLedgerState | null> {
    const row = await this.db.prepare(SELECT_ACCOUNT_ROW_SQL).bind(botId).first<Record<string, number | string>>();
    if (!row) return null;
    const hashRows = await this.db.prepare(SELECT_EVENT_HASHES_SQL).bind(botId).all<{ event_hash: string }>();
    const orderRows = await this.db.prepare(SELECT_ORDER_INTENTS_SQL).bind(botId).all<Record<string, number | string>>();
    return {
      botId,
      version: Number(row.version),
      fencingToken: Number(row.fencing_token),
      balances: {
        CASH_AVAILABLE: BigInt(row.cash_micro_usd),
        MARGIN_RESERVED: BigInt(row.margin_reserved_micro_usd),
        POSITION_MARGIN: BigInt(row.position_margin_micro_usd),
        REALIZED_PNL: BigInt(row.realized_pnl_micro_usd),
        FEES_EXPENSE: BigInt(row.fees_expense_micro_usd),
        FUNDING_NET: BigInt(row.funding_net_micro_usd),
        INITIAL_CAPITAL: BigInt(row.initial_capital_micro_usd),
      },
      processedEventHashes: hashRows.results.map((h) => h.event_hash),
      orderIntents: orderRows.results.map(mapOrderIntentRow),
    };
  }
}
