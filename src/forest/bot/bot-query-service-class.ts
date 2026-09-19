/**
 * Bot Query Service — Service Class
 * Read-only D1 query service for bot data.
 */

import { createServerClient } from '@/lib/db/client';
import { findBotsByUser, findAllBots } from '@/lib/db/repositories';
import type { D1Database } from '@/lib/db/types';
import { createLogger } from '@/lib/logger';
import type { BotMetrics, BotSummary, BotRow } from './bot-query-service-types';
import { rowToBotSummary } from './bot-query-service-mapper';

const log = createLogger('bot-query-service');

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
