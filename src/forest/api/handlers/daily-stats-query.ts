import type { D1Database } from '@/lib/db/client';
import type { SnapshotRow, EventRow } from './daily-stats-types';

export async function fetchDailyStatsRaw(
  db: D1Database,
  startTimestamp: number,
): Promise<{ snapResults: SnapshotRow[]; tradeResults: EventRow[] }> {
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
