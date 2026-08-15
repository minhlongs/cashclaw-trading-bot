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

    // Read daily state from D1 settings (persisted by Killswitch callback)
    let dailyPnl = 0;
    let consecutiveLosses = 0;
    let peakCapital = 0;
    if (settings?.killswitch_daily_json) {
      try {
        const dailyState = JSON.parse(settings.killswitch_daily_json) as Record<string, unknown>;
        if (typeof dailyState.dailyPnl === 'number') dailyPnl = dailyState.dailyPnl;
        if (typeof dailyState.consecutiveLosses === 'number') consecutiveLosses = dailyState.consecutiveLosses;
        if (typeof dailyState.peakCapital === 'number') peakCapital = dailyState.peakCapital;
      } catch { /* ignore parse errors */ }
    }

    // Compute current drawdown from peak capital
    const currentDrawdown = peakCapital > 0
      ? ((peakCapital - (peakCapital + dailyPnl)) / peakCapital) * -100
      : 0;

    return NextResponse.json({
      enabled,
      halted,
      haltReason,
      haltedAt,
      dailyPnl,
      consecutiveLosses,
      currentDrawdown: Math.abs(currentDrawdown),
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
