// Killswitch Reset Helpers
// Pure functions and state constructors for Killswitch daily reset and timer computation.

import type { KillswitchState } from './killswitch-types';

export interface BotStateSummary {
  dailyPnl: number;
  consecutiveLosses: number;
  capital: number;
}

export function makeInitialKillswitchState(): KillswitchState {
  return {
    enabled: true,
    halted: false,
    haltReason: null,
    haltTimestamp: null,
    dailyPnl: 0,
    consecutiveLosses: 0,
    peakCapital: 0,
    currentDrawdown: 0,
    cooldownUntil: null,
    dailyStartTime: Date.now(),
  };
}

export function resetKillswitchDailyState(
  state: KillswitchState,
  botStates: Map<string, BotStateSummary>,
): void {
  state.dailyPnl = 0;
  state.consecutiveLosses = 0;
  state.dailyStartTime = Date.now();
  state.peakCapital = 0;
  state.currentDrawdown = 0;
  for (const bot of botStates.values()) {
    bot.dailyPnl = 0;
    bot.consecutiveLosses = 0;
  }
}

export function getMillisUntilMidnight(): number {
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  return tomorrow.getTime() - Date.now();
}
