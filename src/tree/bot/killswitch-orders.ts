import type { KillswitchCallbacks, KillswitchConfig, KillswitchState } from './killswitch-types';
import type { OrderResult } from '@/tree/exchange/types';
import type { BotStateSummary } from './killswitch-reset';
import { evaluateOrderRisk } from './killswitch-evaluator';
import { executeKillswitchHalt } from './killswitch-actions';

export function handleOrderPlaced(state: KillswitchState, callbacks: KillswitchCallbacks, order: { id: string; symbol?: string }): void {
  if (state.enabled) callbacks.onOrderPlaced(order as unknown as OrderResult);
}

export function handleOrderFilled(
  state: KillswitchState,
  config: KillswitchConfig,
  callbacks: KillswitchCallbacks,
  botStates: Map<string, BotStateSummary>,
  auditEnabled: boolean,
  order: { id: string; pnl?: number; symbol?: string },
  emitDailyState: () => void,
): void {
  if (!state.enabled) return;
  callbacks.onOrderFilled(order as unknown as OrderResult);
  if (state.halted) return;
  const res = evaluateOrderRisk(state, order.pnl ?? 0, config);
  state.dailyPnl = res.dailyPnl;
  state.consecutiveLosses = res.consecutiveLosses;
  state.currentDrawdown = res.currentDrawdown;
  if (res.haltReason) executeKillswitchHalt({ state, config, callbacks, auditEnabled, botStates, reason: res.haltReason });
  emitDailyState();
}
