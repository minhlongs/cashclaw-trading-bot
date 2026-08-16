// Killswitch — Global circuit breaker for all trading bots
// Triggers on: daily loss limit, consecutive losses, manual halt, system error

import type { KillswitchCallbacks, KillswitchConfig, KillswitchState } from './killswitch-types';
import type { OrderResult } from '@/tree/exchange/types';
import { appendAudit } from '@/forest/flight-recorder/audit-ledger';
import { serializeDetail } from '@/forest/api/handlers/serialize-detail';
import { createLogger } from '@/lib/logger';

const log = createLogger('killswitch');

export type { KillswitchCallbacks, KillswitchConfig, KillswitchState };

export class Killswitch {
  private callbacks: KillswitchCallbacks;
  private config: KillswitchConfig;
  private state: KillswitchState;
  private botStates = new Map<string, { dailyPnl: number; consecutiveLosses: number; capital: number }>();
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
    this.scheduleDailyReset();
  }

  // ── Bot registration ──────────────────────────────────────────
  registerBot(botId: string, capital: number): void {
    this.botStates.set(botId, { dailyPnl: 0, consecutiveLosses: 0, capital });
    if (capital > this.state.peakCapital) {
      this.state.peakCapital = capital;
      this.emitDailyState();
    }
  }

  unregisterBot(botId: string): void {
    this.botStates.delete(botId);
  }

  // ── Public API ──────────────────────────────────────────────
  disable(): void {
    this.state.enabled = false;
  }

  enable(): void {
    this.state.enabled = true;
    this.state.halted = false;
    this.state.cooldownUntil = null;
  }

  manualHalt(reason: string): void {
    this.halt(`Manual halt: ${reason}`);
  }

  manualResume(): void {
    if (this.state.halted) {
      this.resume();
    }
  }

  onOrderPlaced(order: { id: string; symbol?: string }): void {
    if (!this.state.enabled) return;
    this.callbacks.onOrderPlaced(order as unknown as OrderResult);
  }

  onOrderFilled(order: { id: string; pnl?: number; symbol?: string }): void {
    if (!this.state.enabled) return;
    this.callbacks.onOrderFilled(order as unknown as OrderResult);
    if (this.state.halted) return;
    const pnl = order.pnl ?? 0;
    this.state.dailyPnl += pnl;
    if (pnl < 0) {
      this.state.consecutiveLosses++;
      if (this.state.consecutiveLosses >= this.config.maxConsecutiveLosses) {
        this.halt(`Max consecutive losses reached: ${this.state.consecutiveLosses}`);
        this.emitDailyState();
        return;
      }
    } else {
      this.state.consecutiveLosses = 0;
    }
    if (this.state.peakCapital > 0) {
      const dailyPnlPct = Math.abs(this.state.dailyPnl / this.state.peakCapital) * 100;
      if (this.state.dailyPnl < 0 && dailyPnlPct >= this.config.maxDailyLossPct) {
        this.halt(`Daily loss limit exceeded: ${dailyPnlPct.toFixed(1)}%`);
        this.emitDailyState();
        return;
      }
      const cur = this.state.peakCapital + this.state.dailyPnl;
      this.state.currentDrawdown = ((this.state.peakCapital - cur) / this.state.peakCapital) * 100;
      if (this.state.currentDrawdown >= this.config.maxDrawdownPct) {
        this.halt(`Max drawdown reached: ${this.state.currentDrawdown.toFixed(2)}%`);
      }
    }
    this.emitDailyState();
  }

  updateDailyPnl(_pnl: number): void {
    // Daily PnL is already tracked in onOrderFilled; this method kept for API compat.
  }

  updatePeakCapital(capital: number): void {
    this.state.peakCapital = Math.max(this.state.peakCapital, capital);
    if (this.state.peakCapital > 0) {
      this.state.currentDrawdown = Math.abs(
        ((this.state.peakCapital - capital) / this.state.peakCapital) * 100
      );
    }
  }

  reset(): void {
    this.state.halted = false;
    this.state.haltReason = null;
    this.state.haltTimestamp = null;
    this.state.cooldownUntil = null;
    this.state.dailyPnl = 0;
    this.state.consecutiveLosses = 0;
    this.state.peakCapital = 0;
    this.state.currentDrawdown = 0;
    this.state.enabled = true;
    this.botStates.clear();
    this.emitDailyState();
  }

  recordError(error: Error, context: string): void {
    this.callbacks.onError(error, context);
  }

  // ── Accessors ────────────────────────────────────────────────
  get haltReason(): string | null {
    return this.state.haltReason;
  }

  isHalted(): boolean {
    return this.state.halted;
  }

  isManualHalt(): boolean {
    return this.state.halted && this.state.haltReason?.startsWith('Manual') === true;
  }

  getHaltReason(): string | null {
    return this.state.haltReason;
  }

  isTradingEnabled(): boolean {
    if (!this.state.enabled) return false;
    if (this.state.halted) {
      if (this.state.cooldownUntil && Date.now() >= this.state.cooldownUntil) {
        this.resume();
        return true;
      }
      return false;
    }
    return true;
  }

  private resume(): void {
    this.state.halted = false;
    this.state.haltReason = null;
    this.state.cooldownUntil = null;
    this.callbacks.onResume();
  }

  getState(): KillswitchState {
    return { ...this.state };
  }

  private halt(reason: string): void {
    if (this.state.halted) return;
    this.state.halted = true;
    this.state.haltReason = reason;
    this.state.haltTimestamp = Date.now();
    this.state.cooldownUntil = Date.now() + this.config.cooldownMinutes * 60_000;
    this.callbacks.onHalt(reason);
    if (this.auditEnabled) {
      const botId = this.botStates.keys().next().value ?? undefined;
      void appendAudit({
        action: 'killswitch.halt',
        botId,
        detailJson: serializeDetail({ reason, dailyPnl: this.state.dailyPnl }),
      }).catch((auditError) => {
        const error = auditError instanceof Error ? auditError : new Error(String(auditError));
        log.warn('killswitch audit write failed', { action: 'killswitch.halt', detail: error.message });
      });
    }
  }

  private emitDailyState(): void {
    if (this.callbacks.onDailyStateChange) {
      this.callbacks.onDailyStateChange({
        dailyPnl: this.state.dailyPnl,
        consecutiveLosses: this.state.consecutiveLosses,
        peakCapital: this.state.peakCapital,
        dailyStartTime: this.state.dailyStartTime,
      });
    }
  }

  private scheduleDailyReset(): void {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.resetTimer = setTimeout(() => {
      this.dailyReset();
      this.scheduleDailyReset();
    }, tomorrow.getTime() - Date.now());
  }

  private dailyReset(): void {
    this.state.dailyPnl = 0;
    this.state.consecutiveLosses = 0;
    this.state.dailyStartTime = Date.now();
    this.state.peakCapital = 0;
    this.state.currentDrawdown = 0;
    for (const [, bot] of this.botStates) {
      bot.dailyPnl = 0;
      bot.consecutiveLosses = 0;
    }
    this.emitDailyState();
  }
}
