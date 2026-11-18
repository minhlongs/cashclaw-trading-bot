// Gate G10: Parameterized SQL & Safe Integer Helpers for Durable Paper Positions.

import { ok, type Result } from '@/lib/result';
import {
  ZERO_BIGINT,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
  type LedgerPositionRecord,
} from './ledger-types';
import { toSqlIntegers } from './d1-ledger-sql';

export const DELETE_BOT_POSITIONS_GUARDED_SQL = `
  DELETE FROM paper_ledger_positions
   WHERE bot_id = ?1
     AND NOT EXISTS (
       SELECT 1 FROM scheduler_bot_leases l WHERE l.bot_id = ?1 AND l.fencing_token > ?2
     )
`;

export const UPSERT_BOT_POSITION_GUARDED_SQL = `
  INSERT INTO paper_ledger_positions (
    bot_id, symbol, signed_qty_base, open_notional_micro_usd,
    open_margin_micro_usd, fencing_token, updated_at_ms
  )
  SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
   WHERE NOT EXISTS (
     SELECT 1 FROM scheduler_bot_leases l WHERE l.bot_id = ?1 AND l.fencing_token > ?6
   )
  ON CONFLICT(bot_id, symbol) DO UPDATE SET
    signed_qty_base = excluded.signed_qty_base,
    open_notional_micro_usd = excluded.open_notional_micro_usd,
    open_margin_micro_usd = excluded.open_margin_micro_usd,
    fencing_token = excluded.fencing_token,
    updated_at_ms = excluded.updated_at_ms
  WHERE paper_ledger_positions.fencing_token <= excluded.fencing_token
`;

export const SELECT_BOT_POSITIONS_SQL = `
  SELECT symbol, signed_qty_base, open_notional_micro_usd, open_margin_micro_usd
    FROM paper_ledger_positions
   WHERE bot_id = ?1
   ORDER BY symbol ASC
`;

export const CHECK_POSITIONS_TABLE_SQL = `
  SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'paper_ledger_positions'
`;

export function mapPositionRow(r: Record<string, number | string>): LedgerPositionRecord {
  return {
    symbol: String(r.symbol),
    signedQtyBase: BigInt(r.signed_qty_base),
    openNotionalMicroUsd: BigInt(r.open_notional_micro_usd),
    openMarginMicroUsd: BigInt(r.open_margin_micro_usd),
  };
}

export function buildPositionBatchStatements(
  db: D1DatabaseLike,
  botId: string,
  fencingToken: number,
  updatedAtMs: number,
  positions: readonly LedgerPositionRecord[],
): Result<D1PreparedStatementLike[]> {
  const stmts: D1PreparedStatementLike[] = [
    db.prepare(DELETE_BOT_POSITIONS_GUARDED_SQL).bind(botId, fencingToken),
  ];
  for (const pos of positions) {
    if (pos.signedQtyBase === ZERO_BIGINT) continue;
    const nums = toSqlIntegers([pos.signedQtyBase, pos.openNotionalMicroUsd, pos.openMarginMicroUsd]);
    if (!nums.ok) return nums;
    stmts.push(
      db.prepare(UPSERT_BOT_POSITION_GUARDED_SQL).bind(
        botId, pos.symbol, nums.data[0], nums.data[1], nums.data[2], fencingToken, updatedAtMs,
      ),
    );
  }
  return ok(stmts);
}

const positionsTableCache = new WeakMap<D1DatabaseLike, boolean>();

export async function hasPositionsTableInDb(db: D1DatabaseLike): Promise<boolean> {
  const cached = positionsTableCache.get(db);
  if (cached !== undefined) return cached;
  try {
    const hit = await db.prepare(CHECK_POSITIONS_TABLE_SQL).first<{ name: string }>();
    const present = Boolean(hit?.name);
    positionsTableCache.set(db, present);
    return present;
  } catch {
    positionsTableCache.set(db, false);
    return false;
  }
}

export async function loadPositionsIfTablePresent(
  db: D1DatabaseLike,
  botId: string,
): Promise<{ readonly hasTable: boolean; readonly positions?: readonly LedgerPositionRecord[] }> {
  const hasTable = await hasPositionsTableInDb(db);
  if (!hasTable) return { hasTable: false };
  const rows = await db.prepare(SELECT_BOT_POSITIONS_SQL).bind(botId).all<Record<string, number | string>>();
  return { hasTable: true, positions: rows.results.map(mapPositionRow) };
}
