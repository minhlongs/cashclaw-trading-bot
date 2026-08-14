// D1 Repositories — Users & Bots

import type { D1Database, User, Bot } from './types';

export async function findUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
  return row ?? null;
}

export async function upsertUser(db: D1Database, user: User): Promise<void> {
  await db.prepare(
    `INSERT INTO users (id, email, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`
  ).bind(user.id, user.email, user.display_name, user.created_at, user.updated_at).run();
}

export async function insertBot(db: D1Database, bot: Bot): Promise<void> {
  await db.prepare(
    `INSERT INTO bots (id, user_id, name, strategy, pair, exchange, status, config_json,
       capital_allocated, capital_used, total_pnl, win_count, loss_count,
       max_drawdown, total_trades, started_at, stopped_at, last_error,
       last_tick_at, last_order_at, current_drawdown, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    bot.id, bot.user_id, bot.name, bot.strategy, bot.pair, bot.exchange, bot.status, bot.config_json,
    bot.capital_allocated, bot.capital_used, bot.total_pnl, bot.win_count, bot.loss_count,
    bot.max_drawdown, bot.total_trades, bot.started_at, bot.stopped_at, bot.last_error,
    bot.last_tick_at, bot.last_order_at, bot.current_drawdown, bot.created_at, bot.updated_at,
  ).run();
}

export async function updateBot(db: D1Database, botId: string, patch: Partial<Bot>): Promise<void> {
  const fields = Object.keys(patch).filter(k => k !== 'id' && k !== 'created_at');
  if (fields.length === 0) return;
  const setClauses = fields.map(f => `${f.replace(/([A-Z])/g, '_$1').toLowerCase()} = ?`).join(', ');
  const values = fields.map(f => (patch as Record<string, unknown>)[f]);
  await db.prepare(`UPDATE bots SET ${setClauses} WHERE id = ?`).bind(...values, botId).run();
}

export async function deleteBot(db: D1Database, botId: string): Promise<void> {
  await db.prepare('DELETE FROM bots WHERE id = ?').bind(botId).run();
}

export async function findBotsByUser(db: D1Database, userId: string): Promise<Bot[]> {
  const result = await db.prepare('SELECT * FROM bots WHERE user_id = ?').bind(userId).all<Bot>();
  return result.results ?? [];
}

export async function findBotById(db: D1Database, botId: string): Promise<Bot | null> {
  const row = await db.prepare('SELECT * FROM bots WHERE id = ?').bind(botId).first<Bot>();
  return row ?? null;
}

export async function findAllBots(db: D1Database): Promise<Bot[]> {
  const result = await db.prepare('SELECT * FROM bots').all<Bot>();
  return result.results ?? [];
}
