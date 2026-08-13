// GET /api/metrics — returns operational metrics
// Used by monitoring dashboard for real-time stats
import { NextResponse } from 'next/server';
import { getBotManager } from '@/tree/bot';

export async function GET() {
  const manager = getBotManager();
  const bots = manager.getAllBots();

  // Aggregate bot metrics from snapshots
  let totalPnl = 0;
  let totalTrades = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let runningCount = 0;
  let pausedCount = 0;

  for (const bot of bots) {
    const snapshot = bot.getSnapshot();
    totalPnl += snapshot.totalPnl;
    totalTrades += snapshot.totalTrades;
    totalWins += snapshot.winCount;
    totalLosses += snapshot.lossCount;

    if (snapshot.status === 'running') runningCount++;
    if (snapshot.status === 'paused') pausedCount++;
  }

  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

  return NextResponse.json({
    bots: {
      total: bots.length,
      running: runningCount,
      paused: pausedCount,
    },
    performance: {
      totalPnl,
      winRate: Math.round(winRate * 100) / 100,
      totalTrades,
      totalWins,
      totalLosses,
    },
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
}