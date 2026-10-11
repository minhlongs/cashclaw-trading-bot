import type { KillswitchCallbacks, KillswitchConfig, KillswitchState } from './killswitch-types';
import { computeDrawdown } from './killswitch-evaluator';
import { makeInitialKillswitchState, resetKillswitchDailyState, getMillisUntilMidnight, type BotStateSummary } from './killswitch-reset';
import { executeKillswitchHalt, executeKillswitchResume } from './killswitch-actions';
import { handleOrderPlaced, handleOrderFilled } from './killswitch-orders';
export type { KillswitchCallbacks, KillswitchConfig, KillswitchState };

export class Killswitch {
  private callbacks: KillswitchCallbacks; private config: KillswitchConfig;
  private state: KillswitchState = makeInitialKillswitchState();
  private botStates = new Map<string, BotStateSummary>(); private resetTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(callbacks: KillswitchCallbacks, config: Partial<KillswitchConfig> = {}, private readonly auditEnabled = true) {
    this.callbacks = callbacks;
    this.config = { maxDailyLossPct: config.maxDailyLossPct ?? 10, maxConsecutiveLosses: config.maxConsecutiveLosses ?? 5, maxDrawdownPct: config.maxDrawdownPct ?? 15, cooldownMinutes: config.cooldownMinutes ?? 30 };
    this.scheduleDailyReset();
  }
  registerBot(botId: string, capital: number): void { this.botStates.set(botId, { dailyPnl: 0, consecutiveLosses: 0, capital }); if (capital > this.state.peakCapital) { this.state.peakCapital = capital; this.emitDailyState(); } }
  unregisterBot(botId: string): void { this.botStates.delete(botId); }
  disable(): void { this.state.enabled = false; }
  enable(): void { this.state.enabled = true; this.state.halted = false; this.state.cooldownUntil = null; }
  manualHalt(reason: string): void { executeKillswitchHalt({ state: this.state, config: this.config, callbacks: this.callbacks, auditEnabled: this.auditEnabled, botStates: this.botStates, reason: `Manual halt: ${reason}` }); }
  manualResume(): void { if (this.state.halted) executeKillswitchResume(this.state, this.callbacks); }
  onOrderPlaced(order: { id: string; symbol?: string }): void { handleOrderPlaced(this.state, this.callbacks, order); }
  onOrderFilled(order: { id: string; pnl?: number; symbol?: string }): void { handleOrderFilled(this.state, this.config, this.callbacks, this.botStates, this.auditEnabled, order, () => this.emitDailyState()); }
  updateDailyPnl(_pnl: number): void {}
  updatePeakCapital(capital: number): void { this.state.peakCapital = Math.max(this.state.peakCapital, capital); this.state.currentDrawdown = computeDrawdown(this.state.peakCapital, capital); }
  reset(): void { this.state = makeInitialKillswitchState(); this.botStates.clear(); this.emitDailyState(); }
  recordError(error: Error, context: string): void { this.callbacks.onError(error, context); }
  get haltReason(): string | null { return this.state.haltReason; }
  isHalted(): boolean { return this.state.halted; }
  isManualHalt(): boolean { return this.state.halted && this.state.haltReason?.startsWith('Manual') === true; }
  getHaltReason(): string | null { return this.state.haltReason; }
  getState(): KillswitchState { return { ...this.state }; }
  isTradingEnabled(): boolean { if (!this.state.enabled) return false; if (!this.state.halted) return true; if (this.state.cooldownUntil && Date.now() >= this.state.cooldownUntil) { executeKillswitchResume(this.state, this.callbacks); return true; } return false; }
  private emitDailyState(): void { this.callbacks.onDailyStateChange?.({ dailyPnl: this.state.dailyPnl, consecutiveLosses: this.state.consecutiveLosses, peakCapital: this.state.peakCapital, dailyStartTime: this.state.dailyStartTime }); }
  private scheduleDailyReset(): void { this.resetTimer = setTimeout(() => { resetKillswitchDailyState(this.state, this.botStates); this.emitDailyState(); this.scheduleDailyReset(); }, getMillisUntilMidnight()); }
}