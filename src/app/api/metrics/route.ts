// GET /api/metrics — returns operational metrics from D1
// Used by monitoring dashboard for real-time stats
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('metrics');

export async function GET() {
  const db = createServerClient();

  if (!db) {
    return NextResponse.json({
      bots: { total: 0, running: 0, paused: 0 },
      performance: { totalPnl: 0, winRate: 0, totalTrades: 0, totalWins: 0, totalLosses: 0 },
      uptime: 0,
      timestamp: Date.now(),
    });
  }

  try {
    // Bot count and status from D1
    const botsResult = await db
      .prepare('SELECT status, COUNT(*) as count FROM bots GROUP BY status')
      .all<{ status: string; count: number }>();

    let total = 0;
    let running = 0;
    let paused = 0;
    for (const row of botsResult.results ?? []) {
      total += row.count;
      if (row.status === 'live_running') running += row.count;
      if (row.status === 'paused' || row.status === 'paper_test') paused += row.count;
    }

    // Trade aggregates from D1
    const aggResult = await db
      .prepare(`SELECT
        COUNT(*) as total_trades,
        COALESCE(SUM(pnl), 0) as total_pnl,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses
      FROM trades WHERE status = ?`)
      .bind('filled')
      .first<{ total_trades: number; total_pnl: number; wins: number; losses: number }>();

    const totalTrades = aggResult?.total_trades ?? 0;
    const totalPnl = aggResult?.total_pnl ?? 0;
    const wins = aggResult?.wins ?? 0;
    const losses = aggResult?.losses ?? 0;
    const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 10000) / 100 : 0;

    return NextResponse.json({
      bots: { total, running, paused },
      performance: { totalPnl, winRate, totalTrades, totalWins: wins, totalLosses: losses },
      uptime: 0,
      timestamp: Date.now(),
    });
  } catch (e) {
    log.error('Failed to read metrics', e instanceof Error ? e : new Error(String(e)), { action: 'metrics' });
    return NextResponse.json({
      bots: { total: 0, running: 0, paused: 0 },
      performance: { totalPnl: 0, winRate: 0, totalTrades: 0, totalWins: 0, totalLosses: 0 },
      uptime: 0,
      timestamp: Date.now(),
    });
  }
}
