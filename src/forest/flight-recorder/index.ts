// Flight Recorder — D1-backed persistence for bot lifecycle events
// Records: bot start, fills (trades), ticks/events
// Types in flight-recorder-types.ts, formatting in flight-recorder-helpers.ts.

import { createServerClient } from '@/lib/db/client';
import type { D1Database } from '@/lib/db/types';

export { appendAudit, ensureAuditLedgerSchema } from './audit-ledger';
export type { AuditEntry, LedgerTail } from './audit-ledger';
 
import type { BotRecord, NewBotInput, NewTickInput, NewFillInput } from './flight-recorder-types';
import { formatBotRow } from './flight-recorder-helpers';

const INSERT_BOT = `INSERT INTO bots
  (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, capital_used, total_pnl, win_count, loss_count, max_drawdown, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_TRADE = `INSERT INTO trades
  (id, bot_id, pair, side, entry_price, exit_price, quantity, pnl, fee, status, exchange_order_id, error_message, opened_at, closed_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_EVENT = `INSERT INTO trade_events
  (id, bot_id, event_type, detail_json, created_at)
  VALUES (?, ?, ?, ?, ?)`;

export class FlightRecorder {
  private db: D1Database | null = null;
  private ready = false;

  private ensureDb(): D1Database | null {
    if (this.ready) return this.db;
    this.db = createServerClient();
    this.ready = true;
    return this.db;
  }

  async recordBotStart(input: NewBotInput): Promise<boolean> {
    const db = this.ensureDb();
    if (!db) return false;
    const now = Date.now();
    await db.prepare(INSERT_BOT).bind(
      input.id, input.userId, input.name, input.strategy, input.pair,
      input.exchange, input.status ?? 'live_running', '{}', 0, 0, 0, 0, 0, 0, now, now,
    ).run();
    return true;
  }

  async recordTrade(input: NewFillInput): Promise<boolean> {
    const db = this.ensureDb();
    if (!db) return false;
    const now = Date.now();
    await db.prepare(INSERT_TRADE).bind(
      input.id, input.botId, input.pair, input.side, input.entryPrice,
      input.exitPrice, input.quantity, input.pnl, input.fee,
      input.status, input.exchangeOrderId, input.errorMessage ?? null,
      now, null, now,
    ).run();
    return true;
  }

  async recordEvent(input: NewTickInput): Promise<boolean> {
    const db = this.ensureDb();
    if (!db) return false;
    const id = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await db.prepare(INSERT_EVENT).bind(id, input.botId, input.eventType, input.data, Date.now()).run();
    return true;
  }

  async getBotState(botId: string): Promise<BotRecord | null> {
    const db = this.ensureDb();
    if (!db) return null;
    const row = await db.prepare('SELECT * FROM bots WHERE id = ?').bind(botId).first();
    return row ? formatBotRow(row as Record<string, unknown>) : null;
  }
}

let recorderInstance: FlightRecorder | null = null;

export function getFlightRecorder(): FlightRecorder {
  if (!recorderInstance) recorderInstance = new FlightRecorder();
  return recorderInstance;
}

export function resetFlightRecorder(): void {
  recorderInstance = null;
}
