/**
 * D1 Repositories — typed data access layer
 * Each repository wraps D1 queries for one entity.
 * All functions return `null` when DB is unavailable (local dev SSR).
 */

import type { D1Database } from './types';
import type { User, Bot, Trade, ApiCredential, TradeEvent, CapitalSnapshot, AuditLog } from './types';

// ──────────────────────────────────────────────
// Users
// ──────────────────────────────────────────────

export async function findUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  return row ?? null;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
  return row ?? null;
}

export async function createUser(db: D1Database, user: User): Promise<void> {
  await db.prepare(
    `INSERT INTO users (id, email, display_name, locale, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(user.id, user.email, user.display_name, user.locale, user.created_at, user.updated_at).run();
}

export async function updateUser(db: D1Database, id: string, patch: Partial<User>): Promise<void> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id') continue;
    fields.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(id);
  if (fields.length) {
    await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  }
}

// ──────────────────────────────────────────────
// Bots
// ──────────────────────────────────────────────

export async function findBotById(db: D1Database, id: string): Promise<Bot | null> {
  const row = await db.prepare('SELECT * FROM bots WHERE id = ?').bind(id).first<Bot>();
  return row ?? null;
}

export async function findBotsByUser(db: D1Database, userId: string): Promise<Bot[]> {
  const { results } = await db.prepare('SELECT * FROM bots WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all<Bot>();
  return results;
}

export async function findAllBots(db: D1Database): Promise<Bot[]> {
  const { results } = await db.prepare('SELECT * FROM bots ORDER BY created_at DESC').all<Bot>();
  return results;
}

export async function findRunningBots(db: D1Database): Promise<Bot[]> {
  const { results } = await db.prepare(
    "SELECT * FROM bots WHERE status IN ('live_running', 'paper_test', 'running')"
  ).all<Bot>();
  return results;
}

export async function insertBot(db: D1Database, bot: Bot): Promise<void> {
  await db.prepare(
    `INSERT INTO bots (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, capital_used, total_pnl, win_count, loss_count, max_drawdown, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    bot.id, bot.user_id, bot.name, bot.strategy, bot.pair, bot.exchange, bot.status,
    bot.config_json, bot.capital_allocated, bot.capital_used, bot.total_pnl,
    bot.win_count, bot.loss_count, bot.max_drawdown,
    bot.created_at, bot.updated_at
  ).run();
}

export async function updateBot(db: D1Database, id: string, patch: Partial<Bot>): Promise<void> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id') continue;
    fields.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(id);
  if (fields.length) {
    await db.prepare(`UPDATE bots SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  }
}

export async function deleteBot(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM bots WHERE id = ?').bind(id).run();
}

// ──────────────────────────────────────────────
// Trades
// ──────────────────────────────────────────────

export async function findTradesByBot(db: D1Database, botId: string, limit = 100): Promise<Trade[]> {
  const { results } = await db.prepare(
    'SELECT * FROM trades WHERE bot_id = ? ORDER BY opened_at DESC LIMIT ?'
  ).bind(botId, limit).all<Trade>();
  return results;
}

export async function insertTrade(db: D1Database, trade: Trade): Promise<void> {
  await db.prepare(
    `INSERT INTO trades (id, bot_id, pair, side, entry_price, exit_price, quantity, pnl, fee, status, exchange_order_id, error_message, opened_at, closed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    trade.id, trade.bot_id, trade.pair, trade.side, trade.entry_price, trade.exit_price,
    trade.quantity, trade.pnl, trade.fee, trade.status, trade.exchange_order_id,
    trade.error_message, trade.opened_at, trade.closed_at, trade.created_at
  ).run();
}

export async function updateTrade(db: D1Database, id: string, patch: Partial<Trade>): Promise<void> {
  const fields: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id') continue;
    fields.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(id);
  if (fields.length) {
    await db.prepare(`UPDATE trades SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  }
}

// ──────────────────────────────────────────────
// API Credentials (encrypted)
// ──────────────────────────────────────────────

export async function findCredential(db: D1Database, userId: string, exchange: string): Promise<ApiCredential | null> {
  const row = await db.prepare(
    'SELECT * FROM api_credentials WHERE user_id = ? AND exchange = ?'
  ).bind(userId, exchange).first<ApiCredential>();
  return row ?? null;
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
  ).bind(
    cred.id, cred.user_id, cred.exchange, cred.api_key_encrypted,
    cred.api_secret_encrypted, cred.is_testnet, cred.created_at, cred.updated_at
  ).run();
}

// ──────────────────────────────────────────────
// Telemetry
// ──────────────────────────────────────────────

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
  ).bind(
    snap.id, snap.bot_id, snap.total_capital, snap.realized_pnl, snap.unrealized_pnl,
    snap.max_drawdown_pct, snap.win_count, snap.loss_count, snap.total_trades, snap.created_at
  ).run();
}

// ──────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────

export interface SettingsRow {
  id: string;
  user_id: string | null;
  exchange_creds_json: string;
  risk_limits_json: string;
  killswitch_enabled: number;
  killswitch_reason: string | null;
  killswitch_triggered_at: number | null;
  updated_at: number;
}

export async function findSettingsByUser(db: D1Database, _userId: string | null): Promise<SettingsRow | null> {
  const row = await db.prepare('SELECT * FROM settings LIMIT 1').first<SettingsRow>();
  return row ?? null;
}

export async function upsertSettings(db: D1Database, row: SettingsRow): Promise<void> {
  await db.prepare(
    `INSERT INTO settings (id, user_id, exchange_creds_json, risk_limits_json, killswitch_enabled, killswitch_reason, killswitch_triggered_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       exchange_creds_json = excluded.exchange_creds_json,
       risk_limits_json = excluded.risk_limits_json,
       killswitch_enabled = excluded.killswitch_enabled,
       killswitch_reason = excluded.killswitch_reason,
       killswitch_triggered_at = excluded.killswitch_triggered_at,
       updated_at = excluded.updated_at`
  ).bind(
    row.id, row.user_id, row.exchange_creds_json, row.risk_limits_json,
    row.killswitch_enabled, row.killswitch_reason, row.killswitch_triggered_at,
    row.updated_at,
  ).run();
}

// ──────────────────────────────────────────────
// Audit
// ──────────────────────────────────────────────

export async function insertAudit(db: D1Database, entry: AuditLog): Promise<void> {
  await db.prepare(
    `INSERT INTO audit_log (id, user_id, bot_id, action, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(entry.id, entry.user_id, entry.bot_id, entry.action, entry.detail_json, entry.created_at).run();
}
