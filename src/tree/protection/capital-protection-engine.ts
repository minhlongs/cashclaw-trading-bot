/**
 * Deterministic fail-closed CapitalProtectionEngine.
 * Positioned strictly ahead of order matching and venue dispatch across 14 risk controls,
 * separating HALT_ONLY freeze states from bounded REDUCE_ONLY_TWAP controlled unwinds.
 */

import { evaluateLedgerAccounting } from './ledger-and-override-guards';
import { evaluateOrderNumericAndNotional } from './pretrade-numeric-and-staleness-guards';
import {
  evaluatePreTradeOperationalPipeline,
  evaluateSystemAndPortfolioBreakers,
} from './protection-breaker-pipeline';
import { resolveProtectionConfig } from './protection-config';
import {
  applyAuditedOverrideDecision,
  checkAndLatchLedgerState,
  evaluateGlobalKillSwitchGate,
  evaluateNonBypassableSystemGates,
  resolveAuditedOverrideOwner,
} from './protection-core-gates';
import { buildProtectionDecision } from './protection-decision-helpers';
import { ProtectionStateTracker, type ProtectionEngineStateSnapshot } from './protection-state-tracker';
import type {
  GlobalKillSwitchMode,
  LedgerSnapshot,
  OwnerOverrideToken,
  PendingOrderFenceEntry,
  PreTradeOrderCandidate,
  ProtectionDecision,
  ProtectionEngineConfig,
  ProtectionTickContext,
} from './protection-types';

export class CapitalProtectionEngine {
  private readonly config: ProtectionEngineConfig;
  private readonly state = new ProtectionStateTracker();

  public constructor(configOverrides: Partial<ProtectionEngineConfig> = {}, bootLedger?: LedgerSnapshot) {
    this.config = resolveProtectionConfig(configOverrides);
    if (bootLedger) checkAndLatchLedgerState(bootLedger, this.state, this.config);
  }

  public evaluateTick(context: ProtectionTickContext): ProtectionDecision {
    if (this.state.globalKillSwitchActive) {
      return evaluateGlobalKillSwitchGate(context, this.state, this.config);
    }
    const hardGate = evaluateNonBypassableSystemGates(context, this.state, this.config);
    if (hardGate) return hardGate;

    const overrideRes = resolveAuditedOverrideOwner(context, this.state, this.config);
    if (overrideRes.rejectedDecision) return overrideRes.rejectedDecision;

    const systemDecision = evaluateSystemAndPortfolioBreakers(context, this.state, this.config);
    if (systemDecision) {
      return applyAuditedOverrideDecision(systemDecision, overrideRes.ownerId);
    }

    return buildProtectionDecision({
      allowed: true,
      action: 'ALLOW',
      posture: 'PASS',
      controlId: 0,
      reason: 'All tick-level capital protection invariants satisfied',
      cancelRestingRiskIncreasingQuotes: false,
      overrideOwnerId: overrideRes.ownerId,
    });
  }

  public evaluatePreTrade(order: PreTradeOrderCandidate, context: ProtectionTickContext): ProtectionDecision {
    if (this.state.globalKillSwitchActive) {
      return evaluateGlobalKillSwitchGate(context, this.state, this.config, order);
    }
    const hardGate = evaluateNonBypassableSystemGates(context, this.state, this.config);
    if (hardGate) return hardGate;

    const numericCheck = evaluateOrderNumericAndNotional(order, context.equityUsd, context.nowMs, this.config);
    if (numericCheck?.nonOverridable) {
      return buildProtectionDecision({
        allowed: false,
        action: numericCheck.action,
        posture: 'HALT_ONLY',
        controlId: numericCheck.controlId,
        reason: numericCheck.reason,
      });
    }

    const overrideRes = resolveAuditedOverrideOwner(context, this.state, this.config);
    if (overrideRes.rejectedDecision) return overrideRes.rejectedDecision;

    const failure = evaluatePreTradeOperationalPipeline(order, context, this.state, this.config, numericCheck);
    if (failure && !failure.allowed) {
      return applyAuditedOverrideDecision(failure, overrideRes.ownerId);
    }

    return buildProtectionDecision({
      allowed: true,
      action: failure?.action ?? 'ALLOW',
      posture: failure?.posture ?? 'PASS',
      controlId: failure?.controlId ?? 0,
      reason: failure?.reason ?? 'Pre-trade risk controls passed',
      cancelRestingRiskIncreasingQuotes: Boolean(failure),
      unwindStage: failure?.unwindStage,
      unwindSlices: failure?.unwindSlices,
      overrideOwnerId: overrideRes.ownerId,
    });
  }

  public setGlobalKillSwitch(active: boolean, mode: GlobalKillSwitchMode = 'HALT_ONLY'): void {
    this.state.globalKillSwitchActive = active;
    this.state.globalKillSwitchMode = mode;
  }

  public setOwnerOverride(override: OwnerOverrideToken | null): void {
    this.state.activeOwnerOverride = override;
  }

  public reconcileLedger(ledger: LedgerSnapshot): boolean {
    const res = evaluateLedgerAccounting(ledger, this.config.ledgerToleranceMicroUsd);
    this.state.quarantinedSafeMode = !res.ok;
    this.state.quarantineReason = res.reason;
    return res.ok;
  }

  public recordExchangeError(_statusCodeOrError: number | 'TIMEOUT' | 'NETWORK_ERROR'): number {
    this.state.consecutiveExchangeErrors += 1;
    return this.state.consecutiveExchangeErrors;
  }

  public recordExchangeSuccess(): void {
    this.state.consecutiveExchangeErrors = 0;
  }

  public recordStrategyOutcome(strategyId: string, pnlUsd: number, strategyDrawdownPct: number, nowMs: number): void {
    this.state.recordStrategyOutcome(strategyId, pnlUsd, strategyDrawdownPct, nowMs, this.config);
  }

  public recordFillSlippage(symbol: string, expectedBps: number, realizedBps: number, nowMs: number): void {
    this.state.recordFillSlippage(symbol, expectedBps, realizedBps, nowMs, this.config);
  }

  public registerPendingIntent(entry: PendingOrderFenceEntry): void {
    this.state.registerPendingFence(entry);
  }

  public reconcilePendingIntent(intentId: string): boolean {
    return this.state.reconcilePendingFence(intentId);
  }

  public acknowledgeEmergencyRecovery(operatorId: string, recoveryToken: string): boolean {
    if (operatorId.trim().length === 0 || recoveryToken.trim().length < 8) return false;
    this.state.emergencyHaltLatched = false;
    this.state.emergencyHaltReason = null;
    return true;
  }

  public getStateSnapshot(): ProtectionEngineStateSnapshot {
    return this.state.snapshot();
  }
}
