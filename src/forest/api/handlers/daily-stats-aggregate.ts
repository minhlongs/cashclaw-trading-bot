import { createLogger } from '@/lib/logger';
import type { SnapshotRow, EventRow, DailyStats } from './daily-stats-types';

const log = createLogger('api/daily-stats-aggregate');

export function aggregateDailyStats(
  startOfDay: Date,
  snapResults: SnapshotRow[],
  tradeResults: EventRow[],
): NonNullable<DailyStats['data']> {
  const activeBots = new Set(snapResults.map((s) => s.bot_id)).size;
  let totalPnl = snapResults.reduce((acc, s) => acc + s.realized_pnl, 0);
  let totalTrades = 0, winCount = 0, lossCount = 0;
  const byStrategy: Record<string, { trades: number; pnl: number }> = {};
  for (const r of tradeResults) {
    totalTrades++;
    let pnl = 0, strategy = 'unknown';
    if (r.detail_json) {
      try {
        const detail = JSON.parse(r.detail_json) as Record<string, unknown>;
        pnl = typeof detail.pnl === 'number' ? detail.pnl : 0;
        if (typeof detail.strategy === 'string') strategy = detail.strategy;
      } catch (error) {
        log.warn('Malformed trade event detail JSON', { action: 'parseDetail', error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
    if (pnl >= 0) winCount++; else lossCount++;
    totalPnl += pnl;
    if (!byStrategy[strategy]) byStrategy[strategy] = { trades: 0, pnl: 0 };
    byStrategy[strategy]!.trades++;
    byStrategy[strategy]!.pnl += pnl;
  }
  const winRate = totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : 0;
  return { date: startOfDay.toISOString().slice(0, 10), activeBots, totalTrades, totalPnl, winCount, lossCount, winRate, byStrategy };
}
