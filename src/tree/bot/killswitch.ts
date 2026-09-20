// Killswitch — Global circuit breaker for all trading bots
// Triggers on: daily loss limit, consecutive losses, manual halt, system error

import type { KillswitchCallbacks, KillswitchConfig, KillswitchState } from './killswitch-types';
import type { OrderResult } from '@/tree/exchange/types';
import { computeDrawdown, evaluateOrderRisk } from './killswitch-evaluator';
import { recordKillswitchHaltAudit } from './killswitch-audit';
import {
  makeInitialKillswitchState,
  resetKillswitchDailyState,
  getMillisUntilMidnight,
  type BotStateSummary,
} from './killswitch-reset';

export type { KillswitchCallbacks, KillswitchConfig, KillswitchState };

export class Killswitch {
  private callbacks: KillswitchCallbacks;
  private config: KillswitchConfig;
  private state: KillswitchState = makeInitialKillswitchState();
  private botStates = new Map<string, BotStateSummary>();
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly auditEnabled: boolean;

  constructor(callbacks: KillswitchCallbacks, config: Partial<KillswitchConfig> = {}, auditEnabled = true) {
    this.callbacks = callbacks;
    this.auditEnabled = auditEnabled;
    this.config = {
      maxDailyLossPct: config.maxDailyLossPct ?? 10,
      maxConsecutiveLosses: config.maxConsecutiveLosses ?? 5,
      maxDrawdownPct: config.maxDrawdownPct ?? 15,
      cooldownMinutes: config.cooldownMinutes ?? 30,
    };
    this.scheduleDailyReset();
  }

  registerBot(botId: string, capital: number): void {
    this.botStates.set(botId, { dailyPnl: 0, consecutiveLosses: 0, capital });
    if (capital > this.state.peakCapital) {
      this.state.peakCapital = capital;
      this.emitDailyState();
    }
  }

  unregisterBot(botId: string): void { this.botStates.delete(botId); }
  disable(): void { this.state.enabled = false; }
  enable(): void {
    this.state.enabled = true;
    this.state.halted = false;
    this.state.cooldownUntil = null;
  }
  manualHalt(reason: string): void { this.halt(`Manual halt: ${reason}`); }
  manualResume(): void { if (this.state.halted) this.resume(); }

  onOrderPlaced(order: { id: string; symbol?: string }): void {
    if (this.state.enabled) this.callbacks.onOrderPlaced(order as unknown as OrderResult);
  }

  onOrderFilled(order: { id: string; pnl?: number; symbol?: string }): void {
    if (!this.state.enabled) return;
    this.callbacks.onOrderFilled(order as unknown as OrderResult);
    if (this.state.halted) return;
    const res = evaluateOrderRisk(this.state, order.pnl ?? 0, this.config);
    this.state.dailyPnl = res.dailyPnl;
    this.state.consecutiveLosses = res.consecutiveLosses;
    this.state.currentDrawdown = res.currentDrawdown;
    if (res.haltReason) this.halt(res.haltReason);
    this.emitDailyState();
  }

  updateDailyPnl(_pnl: number): void { /* Kept for API compatibility */ }

  updatePeakCapital(capital: number): void {
    this.state.peakCapital = Math.max(this.state.peakCapital, capital);
    this.state.currentDrawdown = computeDrawdown(this.state.peakCapital, capital);
  }

  reset(): void { this.state = makeInitialKillswitchState(); this.botStates.clear(); this.emitDailyState(); }
  recordError(error: Error, context: string): void { this.callbacks.onError(error, context); }
  get haltReason(): string | null { return this.state.haltReason; }
  isHalted(): boolean { return this.state.halted; }
  isManualHalt(): boolean { return this.state.halted && this.state.haltReason?.startsWith('Manual') === true; }
  getHaltReason(): string | null { return this.state.haltReason; }
  getState(): KillswitchState { return { ...this.state }; }

  isTradingEnabled(): boolean {
    if (!this.state.enabled) return false;
    if (!this.state.halted) return true;
    if (this.state.cooldownUntil && Date.now() >= this.state.cooldownUntil) { this.resume(); return true; }
    return false;
  }

  private resume(): void { this.state.halted = false; this.state.haltReason = null; this.state.cooldownUntil = null; this.callbacks.onResume(); }

  private halt(reason: string): void {
    if (this.state.halted) return;
    this.state.halted = true;
    this.state.haltReason = reason;
    this.state.haltTimestamp = Date.now();
    this.state.cooldownUntil = Date.now() + this.config.cooldownMinutes * 60_000;
    this.callbacks.onHalt(reason);
    if (this.auditEnabled) {
      const botId = this.botStates.keys().next().value ?? undefined;
      recordKillswitchHaltAudit({ reason, dailyPnl: this.state.dailyPnl, botId });
    }
  }

  private emitDailyState(): void {
    this.callbacks.onDailyStateChange?.({ dailyPnl: this.state.dailyPnl, consecutiveLosses: this.state.consecutiveLosses, peakCapital: this.state.peakCapital, dailyStartTime: this.state.dailyStartTime });
  }

  private scheduleDailyReset(): void {
    this.resetTimer = setTimeout(() => { this.dailyReset(); this.scheduleDailyReset(); }, getMillisUntilMidnight());
  }

  private dailyReset(): void { resetKillswitchDailyState(this.state, this.botStates); this.emitDailyState(); }
}
