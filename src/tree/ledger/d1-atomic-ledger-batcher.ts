// Gate G10: Cloudflare D1 db.batch() Atomic Double-Entry Commit Adapter.

import { ok, err, type Result } from '@/lib/result';
import {
  type AtomicLedgerCommitInput,
  type AtomicLedgerGroupCommitInput,
  type AtomicOrderStateUpsert,
  type D1DatabaseLike,
} from './ledger-types';
import {
  INIT_BOT_ACCOUNT_SQL,
  SELECT_ACCOUNT_ROW_SQL,
  SELECT_EVENT_HASHES_SQL,
  SELECT_ORDER_INTENTS_SQL,
  mapOrderIntentRow,
  type LoadedDurableLedgerState,
} from './d1-ledger-sql';
import {
  ASSERT_POSITION_FENCING_SQL,
  hasPositionsTableInDb,
  loadPositionsIfTablePresent,
} from './d1-positions-sql';
import {
  bindOrderUpsertStmt,
  buildGroupCommitPlan,
  classifyBatchError,
} from './d1-atomic-batch-builder';

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
      const hasPositionsTable = await hasPositionsTableInDb(this.db);
      if (hasPositionsTable) {
        const batchRes = await this.db.batch([
          this.db.prepare(ASSERT_POSITION_FENCING_SQL).bind(botId, fencingToken),
          stmtRes.data,
        ]);
        if (batchRes[1]?.meta?.changes === 0) return err('STALE_FENCING_TOKEN_ON_INTENT');
        return ok(true);
      }
      const res = await stmtRes.data.run();
      if (res.meta.changes === 0) return err('STALE_FENCING_TOKEN_ON_INTENT');
      return ok(true);
    } catch (e) {
      return err(classifyBatchError(e));
    }
  }

  public async commitAtomicGroup(
    input: AtomicLedgerGroupCommitInput,
  ): Promise<Result<{ readonly committedVersion: number; readonly eventHashes: readonly string[] }>> {
    for (let i = 0; i < input.steps.length; i++) {
      const expectedStepVersion = input.expectedVersion + i + 1;
      if (input.steps[i]!.entry.version !== expectedStepVersion) {
        return err(
          `NON_CONTIGUOUS_JOURNAL_VERSION: expected ${expectedStepVersion}, got ${input.steps[i]!.entry.version}`,
        );
      }
    }
    return this.executeGroupPlan(input);
  }

  public async commitAtomicBatch(
    input: AtomicLedgerCommitInput,
  ): Promise<Result<{ readonly committedVersion: number; readonly eventHash: string }>> {
    const groupRes = await this.executeGroupPlan({
      botId: input.botId,
      expectedVersion: input.expectedVersion,
      fencingToken: input.fencingToken,
      steps: [
        {
          entry: input.entry,
          nextBalances: input.nextBalances,
          requiredCashMicroUsd: input.requiredCashMicroUsd,
        },
      ],
      ...(input.orderUpsert ? { orderUpserts: [input.orderUpsert] } : {}),
      ...(input.positions !== undefined ? { positions: input.positions } : {}),
    });
    if (!groupRes.ok) return groupRes;
    return ok({ committedVersion: groupRes.data.committedVersion, eventHash: input.entry.eventHash });
  }

  private async executeGroupPlan(
    input: AtomicLedgerGroupCommitInput,
  ): Promise<Result<{ readonly committedVersion: number; readonly eventHashes: readonly string[] }>> {
    const planRes = await buildGroupCommitPlan(this.db, input);
    if (!planRes.ok) return planRes;
    const { statements, accountUpdateIndices, orderUpsertIndices } = planRes.data;

    try {
      const batchRes = await this.db.batch(statements);
      for (const idx of accountUpdateIndices) {
        if (batchRes[idx]?.meta?.changes === 0) {
          return err('OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED: 0 account rows updated');
        }
      }
      if (accountUpdateIndices.length === 0) {
        for (const idx of orderUpsertIndices) {
          if (batchRes[idx]?.meta?.changes === 0) return err('STALE_FENCING_TOKEN_ON_INTENT');
        }
      }
      return ok({
        committedVersion: input.expectedVersion + input.steps.length,
        eventHashes: input.steps.map((s) => s.entry.eventHash),
      });
    } catch (e) {
      return err(classifyBatchError(e));
    }
  }

  public async loadDurableBotState(botId: string): Promise<LoadedDurableLedgerState | null> {
    const row = await this.db.prepare(SELECT_ACCOUNT_ROW_SQL).bind(botId).first<Record<string, number | string>>();
    if (!row) return null;
    const hashRows = await this.db.prepare(SELECT_EVENT_HASHES_SQL).bind(botId).all<{ event_hash: string }>();
    const orderRows = await this.db.prepare(SELECT_ORDER_INTENTS_SQL).bind(botId).all<Record<string, number | string>>();
    const posState = await loadPositionsIfTablePresent(this.db, botId);
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
      hasDurablePositionsTable: posState.hasTable,
      ...(posState.positions !== undefined ? { positions: posState.positions } : {}),
    };
  }
}
