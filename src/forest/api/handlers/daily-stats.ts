import { createServerClient } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import type { DailyStats } from './daily-stats-types';
import { fetchDailyStatsRaw } from './daily-stats-query';
import { aggregateDailyStats } from './daily-stats-aggregate';

export type { DailyStats, SnapshotRow, EventRow } from './daily-stats-types';

const log = createLogger('api/daily-stats');

export async function dailyStatsHandler(): Promise<DailyStats> {
  const db = createServerClient();
  if (!db) return { ok: false, error: 'Database not available' };
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  try {
    const { snapResults, tradeResults } = await fetchDailyStatsRaw(db, startOfDay.getTime());
    return { ok: true, data: aggregateDailyStats(startOfDay, snapResults, tradeResults) };
  } catch (error) {
    log.error('Failed to compute daily stats', error instanceof Error ? error : new Error(String(error)), { action: 'dailyStatsHandler' });
    return { ok: false, error: 'Failed to compute daily stats' };
  }
}
