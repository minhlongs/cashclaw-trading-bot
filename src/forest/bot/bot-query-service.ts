/**
 * Bot Query Service
 * Reads bot data directly from D1 — no BotManager, no pre-hydration.
 * Used by read-only call sites (dashboard, bot-list, bot-detail, health check).
 */

import { createServerClient } from '@/lib/db/client';
import { findBotsByUser, findAllBots } from '@/lib/db/repositories';
import type { BotConfig, BotStatus } from '@/tree/bot/types';
import type { D1Database } from '@/lib/db/types';
import { createLogger } from '@/lib/logger';
import { toBotStatus } from '@/forest/bot/d1-hydration';

const log = createLogger('bot-query-service');

// ── Types ───────────────────────────────────────────────────────
export interface BotSummary {
  id: string;
  name: string;
  status: BotStatus;
  pair: string;
  strategy: string;
  exchange: string;
  mode: 'paper' | 'live';
  config: BotConfig;
  metrics: BotMetrics;
  createdAt: number;
  updatedAt: number;
}

export interface BotMetrics {
  totalPnl: number;
  winCount: number;
  lossCount: number;
  maxDrawdown: number;
  currentDrawdown: number;
  totalTrades: number;
  startedAt: number | null;
  stoppedAt: number | null;
  lastTickAt: number | null;
  lastOrderAt: number | null;
  lastError: string | null;
}

// ── Status mapping ──────────────────────────────────────────────
// Imported from d1-hydration.ts (shared utility)

// ── Row → BotSummary ───────────────────────────────────────────
interface BotRow {
  id: string;
  user_id: string;
  name: string;
  config_json: string;
  status: string;
  total_pnl: number;
  win_count: number;
  loss_count: number;
  max_drawdown: number;
  current_drawdown: number;
  total_trades: number;
  started_at: number | null;
  stopped_at: number | null;
  last_tick_at: number | null;
  last_order_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

function rowToBotSummary(row: BotRow): BotSummary {
  const config = JSON.parse(row.config_json) as BotConfig;
  return {
    id: row.id,
    name: row.name,
    status: toBotStatus(row.status),
    pair: config.symbol,
    strategy: config.strategy,
    exchange: config.exchange ?? 'paper',
    mode: config.mode ?? 'paper',
    config,
    metrics: {
      totalPnl: row.total_pnl,
      winCount: row.win_count,
      lossCount: row.loss_count,
      maxDrawdown: row.max_drawdown,
      currentDrawdown: row.current_drawdown,
      totalTrades: row.total_trades,
      startedAt: row.started_at,
      stoppedAt: row.stopped_at,
      lastTickAt: row.last_tick_at,
      lastOrderAt: row.last_order_at,
      lastError: row.last_error,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Service ─────────────────────────────────────────────────────
export class BotQueryService {
  private db: D1Database | null;

  constructor(db?: D1Database | null) {
    this.db = db ?? createServerClient();
  }

  /** Fetch a single bot by ID. Returns null if not found or DB unavailable. */
  async getBot(id: string): Promise<BotSummary | null> {
    if (!this.db) return null;
    try {
      const row = await this.db
        .prepare('SELECT * FROM bots WHERE id = ?')
        .bind(id)
        .first<BotRow>();
      if (!row) return null;
      return rowToBotSummary(row);
    } catch (error) {
      log.error('Failed to fetch bot', error instanceof Error ? error : new Error(String(error)), {
        action: 'getBot',
        botId: id,
      });
      return null;
    }
  }

  /** Fetch all bots, optionally filtered by userId. */
  async listBots(userId?: string): Promise<BotSummary[]> {
    if (!this.db) return [];
    try {
      const rows = userId
        ? await findBotsByUser(this.db, userId)
        : await findAllBots(this.db);
      return rows.map((row) =>
        rowToBotSummary(row as unknown as BotRow),
      );
    } catch (error) {
      log.error('Failed to list bots', error instanceof Error ? error : new Error(String(error)), {
        action: 'listBots',
      });
      return [];
    }
  }

  /** Fetch just the metrics for a bot. */
  async getBotMetrics(id: string): Promise<BotMetrics | null> {
    if (!this.db) return null;
    try {
      const row = await this.db
        .prepare('SELECT * FROM bots WHERE id = ?')
        .bind(id)
        .first<BotRow>();
      if (!row) return null;
      return {
        totalPnl: row.total_pnl,
        winCount: row.win_count,
        lossCount: row.loss_count,
        maxDrawdown: row.max_drawdown,
        currentDrawdown: row.current_drawdown,
        totalTrades: row.total_trades,
        startedAt: row.started_at,
        stoppedAt: row.stopped_at,
        lastTickAt: row.last_tick_at,
        lastOrderAt: row.last_order_at,
        lastError: row.last_error,
      };
    } catch (error) {
      log.error('Failed to fetch bot metrics', error instanceof Error ? error : new Error(String(error)), {
        action: 'getBotMetrics',
        botId: id,
      });
      return null;
    }
  }
}
