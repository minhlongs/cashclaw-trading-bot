import type { D1Database } from '@/lib/db/client';
import type { SnapshotRow, EventRow } from './daily-stats-types';

export async function fetchDailyStatsRaw(
  db: D1Database,
  startTimestamp: number,
  userId?: string,
): Promise<{ snapResults: SnapshotRow[]; tradeResults: EventRow[] }> {
  if (userId) {
    const { results: snapResults } = await db
      .prepare(
        `SELECT DISTINCT ON (cs.bot_id) cs.bot_id, cs.total_capital, cs.realized_pnl, cs.max_drawdown_pct
         FROM capital_snapshots cs
         INNER JOIN bots b ON cs.bot_id = b.id
         WHERE cs.created_at >= ? AND b.user_id = ?
         ORDER BY cs.bot_id, cs.created_at DESC`,
      )
      .bind(startTimestamp, userId)
      .all<SnapshotRow>();

    const { results: tradeResults } = await db
      .prepare(
        `SELECT te.id, te.bot_id, te.event_type, te.detail_json, te.created_at
         FROM trade_events te
         INNER JOIN bots b ON te.bot_id = b.id
         WHERE te.created_at >= ?
           AND b.user_id = ?
           AND te.event_type IN ('TRADE_FILLED', 'ORDER_FILLED', 'KILLSWITCH', 'START', 'STOP')
         ORDER BY te.created_at DESC`,
      )
      .bind(startTimestamp, userId)
      .all<EventRow>();

    return { snapResults, tradeResults };
  }

  const { results: snapResults } = await db
    .prepare(
      `SELECT DISTINCT ON (bot_id) bot_id, total_capital, realized_pnl, max_drawdown_pct
       FROM capital_snapshots
       WHERE created_at >= ?
       ORDER BY bot_id, created_at DESC`,
    )
    .bind(startTimestamp)
    .all<SnapshotRow>();

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

  return { snapResults, tradeResults };
}
