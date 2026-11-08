// GET /api/metrics — returns operational metrics from D1
// Used by monitoring dashboard for real-time stats
import { NextResponse } from 'next/server';
import { createServerClient, type D1Database } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('metrics');

interface TradeAggRow {
  total_trades: number;
  total_pnl: number;
  wins: number;
  losses: number;
}

interface BotCounts {
  total: number;
  running: number;
  paused: number;
}

const EMPTY_METRICS = {
  bots: { total: 0, running: 0, paused: 0 },
  performance: { totalPnl: 0, winRate: 0, totalTrades: 0, totalWins: 0, totalLosses: 0 },
  uptime: 0,
  timestamp: Date.now(),
};

function emptyMetrics() {
  return { ...EMPTY_METRICS, timestamp: Date.now() };
}

/** Bot totals per status. A session user id scopes the count to that tenant's bots. */
async function countBots(db: D1Database, userId?: string): Promise<BotCounts> {
  const result = userId
    ? await db
        .prepare('SELECT status, COUNT(*) as count FROM bots WHERE user_id = ? GROUP BY status')
        .bind(userId)
        .all<{ status: string; count: number }>()
    : await db
        .prepare('SELECT status, COUNT(*) as count FROM bots GROUP BY status')
        .all<{ status: string; count: number }>();

  const counts: BotCounts = { total: 0, running: 0, paused: 0 };
  for (const row of result.results ?? []) {
    counts.total += row.count;
    if (row.status === 'live_running') counts.running += row.count;
    if (row.status === 'paused' || row.status === 'paper_test') counts.paused += row.count;
  }
  return counts;
}

/** Filled-trade aggregates. A session user id scopes them through that tenant's bots. */
async function aggregateTrades(db: D1Database, userId?: string): Promise<TradeAggRow | null> {
  return userId
    ? await db
        .prepare(`SELECT
          COUNT(*) as total_trades,
          COALESCE(SUM(t.pnl), 0) as total_pnl,
          SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END) as losses
        FROM trades t INNER JOIN bots b ON t.bot_id = b.id
        WHERE t.status = ? AND b.user_id = ?`)
        .bind('filled', userId)
        .first<TradeAggRow>()
    : await db
        .prepare(`SELECT
          COUNT(*) as total_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses
        FROM trades WHERE status = ?`)
        .bind('filled')
        .first<TradeAggRow>();
}

function toMetricsPayload(bots: BotCounts, agg: TradeAggRow | null) {
  const totalTrades = agg?.total_trades ?? 0;
  const wins = agg?.wins ?? 0;
  const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 10000) / 100 : 0;

  return {
    bots,
    performance: {
      totalPnl: agg?.total_pnl ?? 0,
      winRate,
      totalTrades,
      totalWins: wins,
      totalLosses: agg?.losses ?? 0,
    },
    uptime: 0,
    timestamp: Date.now(),
  };
}

export async function GET(req?: Request) {
  const db = createServerClient();
  if (!db) return NextResponse.json(emptyMetrics());

  try {
    const userId = req?.headers?.get?.('x-user-id')?.trim() || undefined;
    const [bots, agg] = await Promise.all([countBots(db, userId), aggregateTrades(db, userId)]);
    return NextResponse.json(toMetricsPayload(bots, agg));
  } catch (e) {
    log.error('Failed to read metrics', e instanceof Error ? e : new Error(String(e)), { action: 'metrics' });
    return NextResponse.json(emptyMetrics());
  }
}
