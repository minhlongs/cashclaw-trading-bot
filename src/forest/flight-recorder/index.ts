// Flight Recorder — D1-backed persistence for bot lifecycle events
// Records: bot start, fills (trades), ticks/events
// Uses createServerClient() from @/lib/db/client

import { createServerClient } from '@/lib/db/client';
import type { D1Database } from '@/lib/db/types';

// ── Types matching D1 schema ──────────────────────────────────────

export interface BotRecord {
  id: string;
  user_id: string;
  name: string;
  strategy: string;
  pair: string;
  exchange: string;
  status: string;
  config_json: string;
  capital_allocated: number;
  capital_used: number;
  total_pnl: number;
  win_count: number;
  loss_count: number;
  max_drawdown: number;
  created_at: number;
  updated_at: number;
}

export interface TradeRecord {
  id: string;
  bot_id: string;
  pair: string;
  side: 'buy' | 'sell';
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  pnl: number | null;
  fee: number;
  status: string;
  exchange_order_id: string | null;
  error_message: string | null;
  opened_at: number;
  closed_at: number | null;
  created_at: number;
}

export interface TradeEventRecord {
  id: string;
  bot_id: string;
  event_type: string;
  detail_json: string | null;
  created_at: number;
}

// ── Input types ────────────────────────────────────────────────────

export interface RecordBotStartInput {
  id: string;
  userId: string;
  name: string;
  strategy: 'grid' | 'mean_reversion';
  pair: string;
  exchange: 'binance' | 'bybit' | 'okx';
  configJson: string;
  capitalAllocated: number;
  capitalUsed?: number;
  totalPnl?: number;
}

export interface RecordTradeInput {
  id: string;
  botId: string;
  pair: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  pnl?: number;
  fee?: number;
  status?: string;
  exchangeOrderId?: string;
  errorMessage?: string;
}

export interface RecordEventInput {
  botId: string;
  eventType: string;
  detail: Record<string, unknown>;
}

// ── SQL Statements ─────────────────────────────────────────────────

const INSERT_BOT = `INSERT INTO bots
  (id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, capital_used, total_pnl, win_count, loss_count, max_drawdown, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_TRADE = `INSERT INTO trades
  (id, bot_id, pair, side, entry_price, exit_price, quantity, pnl, fee, status, exchange_order_id, error_message, opened_at, closed_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const INSERT_EVENT = `INSERT INTO trade_events
  (id, bot_id, event_type, detail_json, created_at)
  VALUES (?, ?, ?, ?, ?)`;

// ── Class ─────────────────────────────────────────────────────────

export class FlightRecorder {
  private db: D1Database | null;
  private ready: boolean;

  constructor() {
    this.db = null;
    this.ready = false;
  }

  private ensureDb(): D1Database | null {
    if (this.ready) return this.db;
    this.db = createServerClient();
    this.ready = true;
    return this.db;
  }

  // ── RECORD ────────────────────────────────────────────────────

  async recordBotStart(input: RecordBotStartInput): Promise<boolean> {
    const db = this.ensureDb();
    if (!db) return false;

    const now = Date.now();
    const status = 'live_running';

    await db.prepare(INSERT_BOT).bind(
      input.id,
      input.userId,
      input.name,
      input.strategy,
      input.pair,
      input.exchange,
      status,
      input.configJson,
      input.capitalAllocated,
      input.capitalUsed ?? 0,
      input.totalPnl ?? 0,
      0,
      0,
      0,
      now,
      now,
    ).run();
    return true;
  }

  async recordTrade(input: RecordTradeInput): Promise<boolean> {
    const db = this.ensureDb();
    if (!db) return false;

    const now = Date.now();
    const status = input.status ?? 'filled';

    await db.prepare(INSERT_TRADE).bind(
      input.id,
      input.botId,
      input.pair,
      input.side,
      input.entryPrice,
      input.exitPrice ?? null,
      input.quantity,
      input.pnl ?? null,
      input.fee ?? 0,
      status,
      input.exchangeOrderId ?? null,
      input.errorMessage ?? null,
      now,
      null,
      now,
    ).run();
    return true;
  }

  async recordEvent(input: RecordEventInput): Promise<boolean> {
    const db = this.ensureDb();
    if (!db) return false;

    const id = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    await db.prepare(INSERT_EVENT).bind(
      id,
      input.botId,
      input.eventType,
      JSON.stringify(input.detail ?? null),
      now,
    ).run();
    return true;
  }

  // ── READ ──────────────────────────────────────────────────────
  // Minimal: just bot state snapshot. Add more queries as needed.

  async getBotState(botId: string): Promise<BotRecord | null> {
    const db = this.ensureDb();
    if (!db) return null;

    const row = await db.prepare(
      'SELECT id, user_id, name, strategy, pair, exchange, status, config_json, capital_allocated, capital_used, total_pnl, win_count, loss_count, max_drawdown, created_at, updated_at FROM bots WHERE id = ?'
    ).bind(botId).first<BotRecord>();
    return row ?? null;
  }
}

// ── Singleton ──────────────────────────────────────────────────────

let recorderInstance: FlightRecorder | null = null;

export function getFlightRecorder(): FlightRecorder {
  if (!recorderInstance) {
    recorderInstance = new FlightRecorder();
  }
  return recorderInstance;
}

export function resetFlightRecorder(): void {
  recorderInstance = null;
}
