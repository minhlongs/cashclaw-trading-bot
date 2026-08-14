// Forest layer — Capital snapshot queries from D1
// Fetches historical capital snapshots for a given bot.

'use server';

import { createServerClient } from '@/lib/db/client';
import type { CapitalSnapshot } from '@/tree/telemetry';
import { createLogger } from '@/lib/logger';

const log = createLogger('dashboard-actions');
const MAX_SNAPSHOTS = 90;

// ── Internal types ──────────────────────────────────────────────
interface SnapshotRow {
  id: string;
  bot_id: string;
  total_capital: number;
  realized_pnl: number;
  unrealized_pnl: number;
  max_drawdown_pct: number;
  win_count: number;
  loss_count: number;
  total_trades: number;
  created_at: number;
}

// ── Server Actions ──────────────────────────────────────────────
export async function getCapitalSnapshots(botId: string, limit = 30): Promise<CapitalSnapshot[]> {
  const db = createServerClient();
  if (!db) return [];

  try {
    const { results } = await db
      .prepare(
        `SELECT id, bot_id, total_capital, realized_pnl, unrealized_pnl,
                max_drawdown_pct, win_count, loss_count, total_trades, created_at
         FROM capital_snapshots
         WHERE bot_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(botId, Math.min(limit, MAX_SNAPSHOTS))
      .all<SnapshotRow>();

    return results.map((r) => ({
      id: r.id,
      botId: r.bot_id,
      totalCapital: r.total_capital,
      realizedPnl: r.realized_pnl,
      unrealizedPnl: r.unrealized_pnl,
      maxDrawdownPct: r.max_drawdown_pct,
      winCount: r.win_count,
      lossCount: r.loss_count,
      totalTrades: r.total_trades,
      timestamp: r.created_at,
    }));
  } catch (error) {
    log.error('Failed to fetch capital snapshots', error instanceof Error ? error : new Error(String(error)), { action: 'getCapitalSnapshots' });
    return [];
  }
}
