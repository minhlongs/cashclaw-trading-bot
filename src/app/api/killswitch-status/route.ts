// GET /api/killswitch-status — returns killswitch state from D1
// Used by monitoring dashboard for safety status
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { findSettingsByUser } from '@/lib/db/repositories';
import { createLogger } from '@/lib/logger';

const log = createLogger('killswitch-status');

export async function GET() {
  const db = createServerClient();

  if (!db) {
    return NextResponse.json({
      enabled: true,
      halted: false,
      haltReason: null,
      haltedAt: null,
      dailyPnl: 0,
      consecutiveLosses: 0,
      currentDrawdown: 0,
      timestamp: Date.now(),
    });
  }

  try {
    // Read killswitch state from D1 settings
    const settings = await findSettingsByUser(db, null);
    const enabled = settings ? settings.killswitch_enabled === 1 : true;
    const halted = !enabled;
    const haltReason = settings?.killswitch_reason ?? null;
    const haltedAt = settings?.killswitch_triggered_at ?? null;

    // Compute daily PnL from today's closed trades
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTs = Math.floor(todayStart.getTime() / 1000);

    const dailyResult = await db
      .prepare('SELECT COALESCE(SUM(pnl), 0) as daily_pnl FROM trades WHERE closed_at >= ? AND status = ?')
      .bind(todayTs, 'filled')
      .first<{ daily_pnl: number }>();
    const dailyPnl = dailyResult?.daily_pnl ?? 0;

    // Count consecutive losses from most recent closed trades
    const recentTrades = await db
      .prepare('SELECT pnl FROM trades WHERE status = ? ORDER BY closed_at DESC LIMIT 20')
      .bind('filled')
      .all<{ pnl: number }>();
    let consecutiveLosses = 0;
    for (const trade of recentTrades.results ?? []) {
      if (trade.pnl < 0) consecutiveLosses++;
      else break;
    }

    // Current drawdown from latest capital snapshot
    const snapshot = await db
      .prepare('SELECT max_drawdown_pct FROM capital_snapshots ORDER BY created_at DESC LIMIT 1')
      .bind()
      .first<{ max_drawdown_pct: number }>();
    const currentDrawdown = snapshot?.max_drawdown_pct ?? 0;

    return NextResponse.json({
      enabled,
      halted,
      haltReason,
      haltedAt,
      dailyPnl,
      consecutiveLosses,
      currentDrawdown,
      timestamp: Date.now(),
    });
  } catch (e) {
    log.error('Failed to read killswitch status', e instanceof Error ? e : new Error(String(e)), { action: 'killswitch-status' });
    return NextResponse.json({
      enabled: true,
      halted: false,
      haltReason: null,
      haltedAt: null,
      dailyPnl: 0,
      consecutiveLosses: 0,
      currentDrawdown: 0,
      timestamp: Date.now(),
    });
  }
}
