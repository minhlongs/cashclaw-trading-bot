// Gate G10: Parameterized SQL Statements & Safe Integer Binding for D1 Ledger Batcher.

import { ok, err, type Result } from '@/lib/result';
import type { DurableOrderLifecycleState, LedgerAccountBalances } from './ledger-types';

export interface DurableOrderIntentRow {
  readonly clientOrderId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly orderType: 'market' | 'limit';
  readonly quantityBase: bigint;
  readonly filledQtyBase: bigint;
  readonly limitPriceMicroUsd: bigint;
  readonly reservedMarginMicroUsd: bigint;
  readonly reduceOnly: boolean;
  readonly lifecycleState: DurableOrderLifecycleState;
  readonly fencingToken: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface LoadedDurableLedgerState {
  readonly botId: string;
  readonly version: number;
  readonly fencingToken: number;
  readonly balances: LedgerAccountBalances;
  readonly processedEventHashes: readonly string[];
  readonly orderIntents: readonly DurableOrderIntentRow[];
}

export function mapOrderIntentRow(r: Record<string, number | string>): DurableOrderIntentRow {
  return {
    clientOrderId: String(r.client_order_id),
    symbol: String(r.symbol),
    side: r.side as 'buy' | 'sell',
    orderType: r.order_type as 'market' | 'limit',
    quantityBase: BigInt(r.quantity_base),
    filledQtyBase: BigInt(r.filled_qty_base),
    limitPriceMicroUsd: BigInt(r.limit_price_micro_usd),
    reservedMarginMicroUsd: BigInt(r.reserved_margin_micro_usd),
    reduceOnly: Number(r.reduce_only) === 1,
    lifecycleState: r.lifecycle_state as DurableOrderLifecycleState,
    fencingToken: Number(r.fencing_token),
    createdAtMs: Number(r.created_at_ms),
    updatedAtMs: Number(r.updated_at_ms),
  };
}

const MIN_SQL_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SQL_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function toSqlInteger(value: bigint): Result<number> {
  if (value < MIN_SQL_SAFE || value > MAX_SQL_SAFE) {
    return err(`INTEGER_OVERFLOW: value ${value.toString()} exceeds D1 safe integer range`);
  }
  return ok(Number(value));
}

export function toSqlIntegers(values: readonly bigint[]): Result<number[]> {
  const out: number[] = [];
  for (const val of values) {
    const converted = toSqlInteger(val);
    if (!converted.ok) return converted;
    out.push(converted.data);
  }
  return ok(out);
}

export const INIT_BOT_ACCOUNT_SQL = `
  INSERT OR IGNORE INTO paper_ledger_accounts (
    bot_id, cash_micro_usd, margin_reserved_micro_usd, position_margin_micro_usd,
    realized_pnl_micro_usd, fees_expense_micro_usd, funding_net_micro_usd,
    initial_capital_micro_usd, version, fencing_token, updated_at_ms
  ) VALUES (?1, 0, 0, 0, 0, 0, 0, 0, 0, ?2, ?3)
`;

export const INSERT_PROCESSED_EVENT_HASH_SQL = `
  INSERT INTO processed_event_hashes (
    bot_id, event_hash, event_type, account_version, processed_at_ms
  ) VALUES (?1, ?2, ?3, ?4, ?5)
`;

export const UPDATE_ACCOUNT_BALANCES_OPTIMISTIC_SQL = `
  UPDATE paper_ledger_accounts
     SET cash_micro_usd = ?1,
         margin_reserved_micro_usd = ?2,
         position_margin_micro_usd = ?3,
         realized_pnl_micro_usd = ?4,
         fees_expense_micro_usd = ?5,
         funding_net_micro_usd = ?6,
         initial_capital_micro_usd = ?7,
         version = version + 1,
         fencing_token = ?8,
         updated_at_ms = ?9
   WHERE bot_id = ?10
     AND version = ?11
     AND cash_micro_usd >= ?12
     AND fencing_token <= ?8
     AND NOT EXISTS (
       SELECT 1 FROM scheduler_bot_leases l WHERE l.bot_id = ?10 AND l.fencing_token > ?8
     )
`;

export const INSERT_FIRST_JOURNAL_LEG_GUARDED_SQL = `
  INSERT INTO paper_journal_entries (
    entry_id, bot_id, event_hash, leg_index, account_code,
    direction, amount_micro_usd, account_version, created_at_ms
  ) VALUES (
    ?1, ?2, ?3, ?4, ?5, ?6, ?7,
    CASE WHEN changes() = 1 THEN ?8 ELSE NULL END,
    ?9
  )
`;

export const INSERT_SUBSEQUENT_JOURNAL_LEG_SQL = `
  INSERT INTO paper_journal_entries (
    entry_id, bot_id, event_hash, leg_index, account_code,
    direction, amount_micro_usd, account_version, created_at_ms
  ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
`;

export const UPSERT_ORDER_STATE_SQL = `
  INSERT INTO paper_order_intents (
    bot_id, client_order_id, symbol, side, order_type, quantity_base,
    filled_qty_base, limit_price_micro_usd, reserved_margin_micro_usd,
    reduce_only, lifecycle_state, fencing_token, created_at_ms, updated_at_ms
  )
  SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
   WHERE NOT EXISTS (
     SELECT 1 FROM scheduler_bot_leases l WHERE l.bot_id = ?1 AND l.fencing_token > ?12
   )
  ON CONFLICT(bot_id, client_order_id) DO UPDATE SET
    filled_qty_base = excluded.filled_qty_base,
    reserved_margin_micro_usd = excluded.reserved_margin_micro_usd,
    lifecycle_state = excluded.lifecycle_state,
    fencing_token = excluded.fencing_token,
    updated_at_ms = excluded.updated_at_ms
  WHERE paper_order_intents.fencing_token <= excluded.fencing_token
`;

export const SELECT_ACCOUNT_ROW_SQL = `
  SELECT bot_id, cash_micro_usd, margin_reserved_micro_usd, position_margin_micro_usd,
         realized_pnl_micro_usd, fees_expense_micro_usd, funding_net_micro_usd,
         initial_capital_micro_usd, version, fencing_token, updated_at_ms
    FROM paper_ledger_accounts
   WHERE bot_id = ?1
`;

export const SELECT_EVENT_HASHES_SQL = `
  SELECT event_hash FROM processed_event_hashes WHERE bot_id = ?1 ORDER BY account_version ASC
`;

export const SELECT_ORDER_INTENTS_SQL = `
  SELECT client_order_id, symbol, side, order_type, quantity_base, filled_qty_base,
         limit_price_micro_usd, reserved_margin_micro_usd, reduce_only,
         lifecycle_state, fencing_token, created_at_ms, updated_at_ms
    FROM paper_order_intents
   WHERE bot_id = ?1
   ORDER BY created_at_ms ASC, client_order_id ASC
`;
