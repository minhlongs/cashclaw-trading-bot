/**
 * Non-bypassable line-1 kill-switch, double-entry accounting fence,
 * corrupt numeric guard, and TTL-bounded owner override helpers.
 */

import { evaluateLedgerAccounting, validateOwnerOverride } from './ledger-and-override-guards';
import {
  buildProtectionDecision,
  hasCorruptContextNumbers,
  resolveUnwindDecision,
} from './protection-decision-helpers';
import type { ProtectionStateTracker } from './protection-state-tracker';
import type {
  LedgerSnapshot,
  PreTradeOrderCandidate,
  ProtectionDecision,
  ProtectionEngineConfig,
  ProtectionTickContext,
} from './protection-types';

export function checkAndLatchLedgerState(
  ledger: LedgerSnapshot,
  state: ProtectionStateTracker,
  config: ProtectionEngineConfig,
): boolean {
  const res = evaluateLedgerAccounting(ledger, config.ledgerToleranceMicroUsd);
  if (!res.ok) {
    state.quarantinedSafeMode = true;
    state.quarantineReason = res.reason;
  }
  return res.ok;
}

export function evaluateGlobalKillSwitchGate(
  context: ProtectionTickContext,
  state: ProtectionStateTracker,
  config: ProtectionEngineConfig,
  order?: PreTradeOrderCandidate,
): ProtectionDecision {
  if (context.ledger) checkAndLatchLedgerState(context.ledger, state, config);
  if (
    state.globalKillSwitchMode !== 'REDUCE_ONLY_TWAP' ||
    state.quarantinedSafeMode ||
    hasCorruptContextNumbers(context)
  ) {
    return buildProtectionDecision({
      allowed: false,
      action: 'GLOBAL_KILL_SWITCH',
      posture: 'HALT_ONLY',
      controlId: 12,
      reason: 'Independent global kill-switch active: HALT_ONLY freeze',
    });
  }

  return resolveUnwindDecision(
    context,
    state,
    config,
    1.0,
    'KILL_SWITCH_UNWIND',
    'GLOBAL_KILL_SWITCH',
    12,
    'Global kill-switch REDUCE_ONLY_TWAP requested',
    order,
  );
}

export function evaluateNonBypassableSystemGates(
  context: ProtectionTickContext,
  state: ProtectionStateTracker,
  config: ProtectionEngineConfig,
): ProtectionDecision | null {
  if (context.ledger) checkAndLatchLedgerState(context.ledger, state, config);
  if (state.quarantinedSafeMode) {
    return buildProtectionDecision({
      allowed: false,
      action: 'QUARANTINED_SAFE_MODE',
      posture: 'HALT_ONLY',
      controlId: 14,
      reason: String(state.quarantineReason),
    });
  }
  if (hasCorruptContextNumbers(context)) {
    return buildProtectionDecision({
      allowed: false,
      action: 'REJECT_PRETRADE',
      posture: 'HALT_ONLY',
      controlId: 1,
      reason: 'Corrupt or non-positive portfolio equity, peak equity, or clock state',
    });
  }
  return null;
}

export function resolveAuditedOverrideOwner(
  ctx: ProtectionTickContext,
  state: ProtectionStateTracker,
  config: ProtectionEngineConfig,
): { ownerId: string | null; rejectedDecision: ProtectionDecision | null } {
  if (ctx.ownerOverride !== undefined) {
    const check = validateOwnerOverride(ctx.ownerOverride, ctx.nowMs, config.maxOwnerOverrideTtlMs);
    if (!check.valid) {
      return {
        ownerId: null,
        rejectedDecision: buildProtectionDecision({
          allowed: false,
          action: 'REJECT_PRETRADE',
          posture: 'HALT_ONLY',
          controlId: 13,
          reason: check.reason,
        }),
      };
    }
    return { ownerId: check.ownerId, rejectedDecision: null };
  }

  if (state.activeOwnerOverride !== null) {
    const check = validateOwnerOverride(state.activeOwnerOverride, ctx.nowMs, config.maxOwnerOverrideTtlMs);
    return { ownerId: check.valid ? check.ownerId : null, rejectedDecision: null };
  }

  return { ownerId: null, rejectedDecision: null };
}

export function applyAuditedOverrideDecision(
  decision: ProtectionDecision,
  ownerId: string | null,
): ProtectionDecision {
  if (!ownerId) return decision;
  return buildProtectionDecision({
    allowed: true,
    action: 'ALLOW',
    posture: 'PASS',
    controlId: decision.controlId,
    reason: `Audited owner override applied over ${decision.action}: ${decision.reason}`,
    cancelRestingRiskIncreasingQuotes: false,
    overrideOwnerId: ownerId,
  });
}
