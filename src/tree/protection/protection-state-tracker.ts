/**
 * Deterministic mutable runtime state tracker for CapitalProtectionEngine.
 * Isolates per-strategy cooldowns, symbol slippage quarantines, gateway error strikes,
 * pending-intent fences, and latched emergency/ledger states.
 */

import type {
  GlobalKillSwitchMode,
  OwnerOverrideToken,
  PendingOrderFenceEntry,
  ProtectionEngineConfig,
} from './protection-types';

export interface StrategyCooldownEntry {
  readonly strategyId: string;
  readonly consecutiveLosses: number;
  readonly drawdownPct: number;
  readonly cooldownUntilMs: number | null;
}

export interface SymbolSlippageEntry {
  readonly symbol: string;
  readonly anomalyStreak: number;
  readonly quarantinedUntilMs: number | null;
}

export interface ProtectionEngineStateSnapshot {
  readonly globalKillSwitchActive: boolean;
  readonly globalKillSwitchMode: GlobalKillSwitchMode;
  readonly quarantinedSafeMode: boolean;
  readonly quarantineReason: string | null;
  readonly emergencyHaltLatched: boolean;
  readonly emergencyHaltReason: string | null;
  readonly consecutiveExchangeErrors: number;
  readonly pendingIntentsCount: number;
}

export class ProtectionStateTracker {
  public globalKillSwitchActive = false;
  public globalKillSwitchMode: GlobalKillSwitchMode = 'HALT_ONLY';
  public quarantinedSafeMode = false;
  public quarantineReason: string | null = null;
  public emergencyHaltLatched = false;
  public emergencyHaltReason: string | null = null;
  public consecutiveExchangeErrors = 0;
  public activeOwnerOverride: OwnerOverrideToken | null = null;

  private readonly strategyStates = new Map<string, StrategyCooldownEntry>();
  private readonly symbolSlippage = new Map<string, SymbolSlippageEntry>();
  private readonly pendingFences = new Map<string, PendingOrderFenceEntry>();
  private readonly lastMarketTimestamps = new Map<string, number>();

  public recordStrategyOutcome(
    strategyId: string,
    pnlUsd: number,
    strategyDrawdownPct: number,
    nowMs: number,
    config: ProtectionEngineConfig,
  ): StrategyCooldownEntry {
    const prev = this.strategyStates.get(strategyId);
    const consecutiveLosses = pnlUsd < 0 ? (prev?.consecutiveLosses ?? 0) + 1 : 0;
    const breached =
      consecutiveLosses >= config.maxStrategyLossStreak ||
      strategyDrawdownPct >= config.maxStrategyDrawdownPct;
    const nextCooldown = breached
      ? Math.max(prev?.cooldownUntilMs ?? 0, nowMs + config.strategyCooldownMs)
      : (prev?.cooldownUntilMs ?? null);
    const entry: StrategyCooldownEntry = {
      strategyId,
      consecutiveLosses,
      drawdownPct: strategyDrawdownPct,
      cooldownUntilMs: nextCooldown,
    };
    this.strategyStates.set(strategyId, entry);
    return entry;
  }

  public getActiveStrategyCooldown(strategyId: string, nowMs: number): StrategyCooldownEntry | null {
    const entry = this.strategyStates.get(strategyId);
    if (entry && entry.cooldownUntilMs !== null && nowMs < entry.cooldownUntilMs) {
      return entry;
    }
    return null;
  }

  public recordFillSlippage(
    symbol: string,
    expectedSlippageBps: number,
    realizedSlippageBps: number,
    nowMs: number,
    config: ProtectionEngineConfig,
  ): SymbolSlippageEntry {
    const prev = this.symbolSlippage.get(symbol);
    const isAnomaly =
      expectedSlippageBps <= 0 ||
      !Number.isFinite(realizedSlippageBps) ||
      realizedSlippageBps > expectedSlippageBps * config.slippageAnomalyMultiplier;
    const anomalyStreak = isAnomaly ? (prev?.anomalyStreak ?? 0) + 1 : 0;
    const quarantinedUntilMs =
      anomalyStreak >= config.slippageAnomalyStreakThreshold
        ? Math.max(prev?.quarantinedUntilMs ?? 0, nowMs + config.symbolQuarantineMs)
        : (prev?.quarantinedUntilMs ?? null);
    const entry: SymbolSlippageEntry = { symbol, anomalyStreak, quarantinedUntilMs };
    this.symbolSlippage.set(symbol, entry);
    return entry;
  }

  public getActiveSymbolQuarantine(symbol: string, nowMs: number): SymbolSlippageEntry | null {
    const entry = this.symbolSlippage.get(symbol);
    if (entry && entry.quarantinedUntilMs !== null && nowMs < entry.quarantinedUntilMs) {
      return entry;
    }
    return null;
  }

  public registerPendingFence(entry: PendingOrderFenceEntry): void {
    this.pendingFences.set(entry.intentId, entry);
  }

  public reconcilePendingFence(intentId: string): boolean {
    return this.pendingFences.delete(intentId);
  }

  public findBlockingFence(
    botId: string,
    symbol: string,
    orderId: string,
    nowMs: number,
    maxPendingAckMs: number,
  ): PendingOrderFenceEntry | null {
    for (const entry of this.pendingFences.values()) {
      if (entry.intentId === orderId) return entry;
      const sameScope = entry.botId === botId && entry.symbol === symbol;
      if (!sameScope) continue;
      if (entry.status === 'PENDING_INTENT' || nowMs - entry.dispatchedAtMs > maxPendingAckMs) {
        return entry;
      }
    }
    return null;
  }

  public findAnyOverdueFence(nowMs: number, maxPendingAckMs: number): PendingOrderFenceEntry | null {
    for (const entry of this.pendingFences.values()) {
      if (entry.status === 'PENDING_INTENT' || nowMs - entry.dispatchedAtMs > maxPendingAckMs) {
        return entry;
      }
    }
    return null;
  }

  public getLastTimestampsRecord(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.lastMarketTimestamps.entries());
  }

  public updateMarketTimestamp(symbol: string, timestampMs: number): void {
    const prev = this.lastMarketTimestamps.get(symbol);
    if (prev === undefined || timestampMs >= prev) {
      this.lastMarketTimestamps.set(symbol, timestampMs);
    }
  }

  public snapshot(): ProtectionEngineStateSnapshot {
    return {
      globalKillSwitchActive: this.globalKillSwitchActive,
      globalKillSwitchMode: this.globalKillSwitchMode,
      quarantinedSafeMode: this.quarantinedSafeMode,
      quarantineReason: this.quarantineReason,
      emergencyHaltLatched: this.emergencyHaltLatched,
      emergencyHaltReason: this.emergencyHaltReason,
      consecutiveExchangeErrors: this.consecutiveExchangeErrors,
      pendingIntentsCount: this.pendingFences.size,
    };
  }
}
