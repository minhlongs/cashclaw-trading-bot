// Killswitch — Global circuit breaker for all trading bots
// Triggers on: daily loss limit, consecutive losses, manual halt, system error

import type { OrderResult } from '../exchange/types';

export interface KillswitchCallbacks {
  onHalt: (reason: string) => void;
  onResume: () => void;
  onOrderPlaced: (order: OrderResult) => void;
  onOrderFilled: (order: OrderResult) => void;
  onError: (error: Error, context: string) => void;
}

export interface KillswitchConfig {
  maxDailyLossPct: number;
  maxConsecutiveLosses: number;
  maxDrawdownPct: number;
  cooldownMinutes: number;
}

export interface KillswitchState {
  enabled: boolean;
  halted: boolean;
  haltReason: string | null;
  haltTimestamp: number | null;
  dailyPnl: number;
  consecutiveLosses: number;
  peakCapital: number;
  currentDrawdown: number;
  cooldownUntil: number | null;
  dailyStartTime: number;
}

const DEFAULT_CONFIG: KillswitchConfig = {
  maxDailyLossPct: 10,
  maxConsecutiveLosses: 5,
  maxDrawdownPct: 15,
  cooldownMinutes: 30,
};

export class Killswitch {
  private config: KillswitchConfig;
  private callbacks: KillswitchCallbacks;
  private state: KillswitchState;
  private botStates = new Map<string, { dailyPnl: number; consecutiveLosses: number }>();

  constructor(callbacks: KillswitchCallbacks, config: Partial<KillswitchConfig> = {}) {
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
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

  get isEnabled(): boolean {
    return this.state.enabled;
  }

  get isHalted(): boolean {
    return this.state.halted;
  }

  get haltReason(): string | null {
    return this.state.haltReason;
  }

  isTradingEnabled(): boolean {
    if (!this.state.enabled) return false;
    if (this.state.halted) {
      // Check cooldown
      if (this.state.cooldownUntil && Date.now() > this.state.cooldownUntil) {
        this.resume('Cooldown expired');
        return true;
      }
      return false;
    }
    return true;
  }

  registerBot(botId: string, initialCapital: number): void {
    this.botStates.set(botId, { dailyPnl: 0, consecutiveLosses: 0 });
    if (initialCapital > this.state.peakCapital) {
      this.state.peakCapital = initialCapital;
    }
  }

  unregisterBot(botId: string): void {
    this.botStates.delete(botId);
  }

  onOrderFilled(order: OrderResult): void {
    if (!this.state.enabled) return;

    this.callbacks.onOrderFilled(order);
    const pnl = order.pnl ?? 0;
    this.updateDailyPnl(pnl);

    if (pnl < 0) {
      this.state.consecutiveLosses++;
      if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses) {
        this.halt(`Max consecutive losses reached: ${this.state.consecutiveLosses}`);
      }
    } else {
      this.state.consecutiveLosses = 0;
    }

    this.updateDrawdown();
  }

  updateDailyPnl(pnl: number): void {
    this.state.dailyPnl += pnl;

    const lossPct = Math.abs(this.state.dailyPnl / this.state.peakCapital) * 100;
    if (lossPct >= this.config.maxDailyLossPct) {
      this.halt(`Daily loss limit reached: ${lossPct.toFixed(2)}%`);
    }
  }

  private updateDrawdown(): void {
    if (this.state.peakCapital > 0) {
      const currentCapital = this.state.peakCapital + this.state.dailyPnl;
      this.state.currentDrawdown = ((this.state.peakCapital - currentCapital) / this.state.peakCapital) * 100;

      if (this.state.currentDrawdown >= this.config.maxDrawdownPct) {
        this.halt(`Max drawdown reached: ${this.state.currentDrawdown.toFixed(2)}%`);
      }
    }
  }

  updatePeakCapital(capital: number): void {
    if (capital > this.state.peakCapital) {
      this.state.peakCapital = capital;
    }
  }

  private halt(reason: string): void {
    if (this.state.halted) return;

    this.state.halted = true;
    this.state.haltReason = reason;
    this.state.haltTimestamp = Date.now();
    this.state.cooldownUntil = Date.now() + this.config.cooldownMinutes * 60 * 1000;

    this.callbacks.onHalt(reason);
  }

  private resume(reason: string): void {
    this.state.halted = false;
    this.state.haltReason = null;
    this.state.haltTimestamp = null;
    this.state.cooldownUntil = null;
    this.state.dailyPnl = 0;
    this.state.consecutiveLosses = 0;

    this.callbacks.onResume();
  }

  manualHalt(reason: string): void {
    this.halt(`Manual halt: ${reason}`);
  }

  manualResume(): void {
    if (this.state.halted) {
      this.resume('Manual resume');
    }
  }

  disable(): void {
    this.state.enabled = false;
  }

  enable(): void {
    this.state.enabled = true;
  }

  reset(): void {
    this.state.dailyPnl = 0;
    this.state.consecutiveLosses = 0;
    this.state.halted = false;
    this.state.haltReason = null;
    this.state.haltTimestamp = null;
    this.state.cooldownUntil = null;
    this.state.peakCapital = 0;
    this.state.currentDrawdown = 0;

    for (const [, bot] of this.botStates) {
      bot.dailyPnl = 0;
      bot.consecutiveLosses = 0;
    }
  }

  getState(): KillswitchState {
    return { ...this.state };
  }
}
