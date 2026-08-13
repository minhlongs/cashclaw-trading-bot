/**
 * GET /api/stats/daily handler
 * Returns daily aggregated metrics from D1.
 *
 * Aggregates from capital_snapshots (latest per bot today)
 * and trade_events (today's trades / fills).
 */

import { createServerClient } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/daily-stats');

export interface DailyStats {
  ok: boolean;
  data?: {
    date: string;
    activeBots: number;
    totalTrades: number;
    totalPnl: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    byStrategy: Record<string, { trades: number; pnl: number }>;
  };
  error?: string;
}

export async function dailyStatsHandler(): Promise<DailyStats> {
  const db = createServerClient();
  if (!db) {
    return { ok: false, error: 'Database not available' };
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startTimestamp = startOfDay.getTime();

  try {
    // Latest snapshot per bot since start of day
    const { results: snapResults } = await db
      .prepare(
        `SELECT DISTINCT ON (bot_id) bot_id, total_capital, realized_pnl, max_drawdown_pct
         FROM capital_snapshots
         WHERE created_at >= ?
         ORDER BY bot_id, created_at DESC`,
      )
      .bind(startTimestamp)
      .all<SnapshotRow>();

    // Today's trade events (trade filled or order filled events)
    const { results: tradeResults } = await db
      .prepare(
        `SELECT id, bot_id, event_type, detail_json, created_at
         FROM trade_events
         WHERE created_at >= ?
           AND event_type IN ('TRADE_FILLED', 'ORDER_FILLED', 'KILLSWITCH', 'START', 'STOP')
         ORDER BY created_at DESC`,
      )
      .bind(startTimestamp)
      .all<EventRow>();

    const botIds = new Set(snapResults.map((s) => s.bot_id));
    const activeBots = botIds.size;

    let totalPnl = 0;
    let totalTrades = 0;
    let winCount = 0;
    let lossCount = 0;
    const byStrategy: Record<string, { trades: number; pnl: number }> = {};

    // Snapshot PnL contribution
    for (const s of snapResults) {
      totalPnl += s.realized_pnl;
    }

    // Event-level counts
    for (const r of tradeResults) {
      totalTrades++;
      let pnl = 0;
      let strategy = 'unknown';

      if (r.detail_json) {
        try {
          const detail = JSON.parse(r.detail_json) as Record<string, unknown>;
          pnl = typeof detail.pnl === 'number' ? detail.pnl : 0;
          if (typeof detail.strategy === 'string') {
            strategy = detail.strategy;
          }
        } catch (error) {
          // keep defaults but log malformed JSON
          log.warn('Malformed trade event detail JSON', { action: 'parseDetail', error: error instanceof Error ? error : new Error(String(error)) });
        }
      }

      if (pnl >= 0) {
        winCount++;
      } else {
        lossCount++;
      }
      totalPnl += pnl;

      if (!byStrategy[strategy]) {
        byStrategy[strategy] = { trades: 0, pnl: 0 };
      }
      byStrategy[strategy].trades++;
      byStrategy[strategy].pnl += pnl;
    }

    return {
      ok: true,
      data: {
        date: startOfDay.toISOString().slice(0, 10),
        activeBots,
        totalTrades,
        totalPnl,
        winCount,
        lossCount,
        winRate: totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0,
        byStrategy,
      },
    };
  } catch (error) {
    log.error('Failed to compute daily stats', error instanceof Error ? error : new Error(String(error)), { action: 'dailyStatsHandler' });
    return { ok: false, error: 'Failed to compute daily stats' };
  }
}

interface SnapshotRow {
  bot_id: string;
  total_capital: number;
  realized_pnl: number;
  max_drawdown_pct: number;
}

interface EventRow {
  id: string;
  bot_id: string;
  event_type: string;
  detail_json: string | null;
  created_at: number;
}
