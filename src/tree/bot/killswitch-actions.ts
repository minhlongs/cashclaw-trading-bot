import type { KillswitchCallbacks, KillswitchConfig, KillswitchState } from './killswitch-types';
import type { BotStateSummary } from './killswitch-reset';
import { recordKillswitchHaltAudit } from './killswitch-audit';

export interface HaltOptions {
  state: KillswitchState;
  config: KillswitchConfig;
  callbacks: KillswitchCallbacks;
  auditEnabled: boolean;
  botStates: Map<string, BotStateSummary>;
  reason: string;
}

export function executeKillswitchHalt(opt: HaltOptions): void {
  if (opt.state.halted) return;
  opt.state.halted = true;
  opt.state.haltReason = opt.reason;
  opt.state.haltTimestamp = Date.now();
  opt.state.cooldownUntil = Date.now() + opt.config.cooldownMinutes * 60_000;
  opt.callbacks.onHalt(opt.reason);
  if (opt.auditEnabled) {
    const botId = opt.botStates.keys().next().value ?? undefined;
    recordKillswitchHaltAudit({ reason: opt.reason, dailyPnl: opt.state.dailyPnl, botId });
  }
}

export function executeKillswitchResume(state: KillswitchState, callbacks: KillswitchCallbacks): void {
  state.halted = false;
  state.haltReason = null;
  state.cooldownUntil = null;
  callbacks.onResume();
}
