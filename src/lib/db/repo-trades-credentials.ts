// D1 Repositories — Trades, Credentials, Events, Snapshots, Audit

import type { D1Database, Trade, ApiCredential, TradeEvent, CapitalSnapshot, AuditLog } from './types';

export async function insertTrade(db: D1Database, trade: Trade): Promise<void> {
  await db.prepare(
    `INSERT INTO trades (id, bot_id, pair, side, entry_price, exit_price, quantity, pnl, fee, status, exchange_order_id, error_message, opened_at, closed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    trade.id, trade.bot_id, trade.pair, trade.side, trade.entry_price, trade.exit_price,
    trade.quantity, trade.pnl, trade.fee, trade.status, trade.exchange_order_id, trade.error_message,
    trade.opened_at, trade.closed_at, trade.created_at,
  ).run();
}

export async function findTradesByBot(db: D1Database, botId: string, limit = 50): Promise<Trade[]> {
  const result = await db.prepare(
    'SELECT * FROM trades WHERE bot_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(botId, limit).all<Trade>();
  return result.results ?? [];
}

export async function upsertCredential(db: D1Database, cred: ApiCredential): Promise<void> {
  await db.prepare(
    `INSERT INTO api_credentials (id, user_id, exchange, api_key_encrypted, api_secret_encrypted, is_testnet, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       api_key_encrypted = excluded.api_key_encrypted,
       api_secret_encrypted = excluded.api_secret_encrypted,
       is_testnet = excluded.is_testnet,
       updated_at = excluded.updated_at`
  ).bind(cred.id, cred.user_id, cred.exchange, cred.api_key_encrypted, cred.api_secret_encrypted, cred.is_testnet, cred.created_at, cred.updated_at).run();
}

export async function insertTradeEvent(db: D1Database, event: TradeEvent): Promise<void> {
  await db.prepare(
    `INSERT INTO trade_events (id, bot_id, event_type, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(event.id, event.bot_id, event.event_type, event.detail_json, event.created_at).run();
}

export async function insertCapitalSnapshot(db: D1Database, snap: CapitalSnapshot): Promise<void> {
  await db.prepare(
    `INSERT INTO capital_snapshots (id, bot_id, total_capital, realized_pnl, unrealized_pnl, max_drawdown_pct, win_count, loss_count, total_trades, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(snap.id, snap.bot_id, snap.total_capital, snap.realized_pnl, snap.unrealized_pnl, snap.max_drawdown_pct, snap.win_count, snap.loss_count, snap.total_trades, snap.created_at).run();
}

export async function insertAudit(db: D1Database, entry: AuditLog): Promise<void> {
  await db.prepare(
    `INSERT INTO audit_log (id, user_id, bot_id, action, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(entry.id, entry.user_id, entry.bot_id, entry.action, entry.detail_json, entry.created_at).run();
}
