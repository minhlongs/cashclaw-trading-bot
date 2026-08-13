// GET /api/killswitch-status — returns killswitch state
// Used by monitoring dashboard for safety status
import { NextResponse } from 'next/server';
import { getBotManager } from '@/tree/bot';

export async function GET() {
  const manager = getBotManager();
  const killswitch = manager.getKillswitch();
  const state = killswitch.getState();

  return NextResponse.json({
    enabled: state.enabled,
    halted: state.halted,
    haltReason: state.haltReason,
    haltedAt: state.haltTimestamp,
    dailyPnl: state.dailyPnl,
    consecutiveLosses: state.consecutiveLosses,
    currentDrawdown: state.currentDrawdown,
    timestamp: Date.now(),
  });
}