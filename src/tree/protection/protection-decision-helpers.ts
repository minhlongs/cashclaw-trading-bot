/**
 * Pure decision builders and tick/pre-trade helper evaluators for CapitalProtectionEngine.
 */

import { evaluateMarketDataFreshness } from './pretrade-numeric-and-staleness-guards';
import type { ProtectionStateTracker } from './protection-state-tracker';
import type {
  PositionExposure,
  PreTradeOrderCandidate,
  ProtectionActionCode,
  ProtectionDecision,
  ProtectionEngineConfig,
  ProtectionPosture,
  ProtectionTickContext,
  TwapSliceIntent,
  UnwindStage,
} from './protection-types';
import { buildReduceOnlyTwapPlan } from './twap-unwind-planner';

export function buildProtectionDecision(params: {
  allowed: boolean;
  action: ProtectionActionCode;
  posture: ProtectionPosture;
  controlId: number;
  reason: string;
  cancelRestingRiskIncreasingQuotes?: boolean;
  unwindStage?: UnwindStage;
  unwindSlices?: readonly TwapSliceIntent[];
  effectiveCollateralUsd?: number;
  overrideOwnerId?: string | null;
}): ProtectionDecision {
  return {
    allowed: params.allowed,
    action: params.action,
    posture: params.posture,
    controlId: params.controlId,
    reason: params.reason,
    cancelRestingRiskIncreasingQuotes: params.cancelRestingRiskIncreasingQuotes ?? !params.allowed,
    blindMarketLiquidationOrders: 0,
    unwindStage: params.unwindStage ?? 'NONE',
    unwindSlices: params.unwindSlices ?? [],
    effectiveCollateralUsd: params.effectiveCollateralUsd,
    auditOverrideApplied: Boolean(params.overrideOwnerId),
    overrideOwnerId: params.overrideOwnerId ?? undefined,
  };
}

export function hasCorruptContextNumbers(ctx: ProtectionTickContext): boolean {
  return (
    !Number.isFinite(ctx.nowMs) ||
    ctx.nowMs <= 0 ||
    !Number.isFinite(ctx.equityUsd) ||
    ctx.equityUsd <= 0 ||
    !Number.isFinite(ctx.peakEquityUsd) ||
    ctx.peakEquityUsd <= 0 ||
    !Number.isFinite(ctx.rolling24hPnlUsd) ||
    !Number.isFinite(ctx.rolling24hRefEquityUsd) ||
    ctx.rolling24hRefEquityUsd <= 0
  );
}

export function computeMinLiquidationBufferPct(
  positions: readonly PositionExposure[],
  ctx: ProtectionTickContext,
): { minBufferPct: number; needsBufferUnwind: boolean; unwindFraction: number } {
  let minBufferPct = 1.0;
  let needsBufferUnwind = false;
  let unwindFraction = 0;

  for (const pos of positions) {
    if (Math.abs(pos.signedNotionalUsd) <= 0 || pos.markPrice <= 0) continue;
    const market = ctx.markets[pos.symbol];
    const oiCascade = (market?.oiChangePct ?? 0) <= -0.20;
    const stressFactor = oiCascade ? 1.25 : 1.0;
    const mmr = (pos.maintenanceMarginRate ?? 0.05) * stressFactor;
    const leverage = Math.abs(pos.signedNotionalUsd) / ctx.equityUsd;
    const derivedBuffer =
      pos.simulatedLiqPrice !== undefined && pos.simulatedLiqPrice > 0
        ? Math.abs(pos.markPrice - pos.simulatedLiqPrice) / pos.markPrice
        : Math.max(0, 1 / Math.max(0.25, leverage) - mmr);
    const effectiveBuffer = oiCascade ? derivedBuffer / stressFactor : derivedBuffer;

    if (effectiveBuffer < minBufferPct) minBufferPct = effectiveBuffer;
    if (effectiveBuffer < 0.35 || (oiCascade && leverage > 0.85)) {
      needsBufferUnwind = true;
      unwindFraction = Math.max(unwindFraction, 0.45);
    }
  }

  return { minBufferPct: Number(minBufferPct.toFixed(4)), needsBufferUnwind, unwindFraction };
}

export function evaluateAllMarketsFreshness(
  ctx: ProtectionTickContext,
  state: ProtectionStateTracker,
  config: ProtectionEngineConfig,
  requiredSymbol?: string,
): ProtectionDecision | null {
  const symbols = new Set<string>(Object.keys(ctx.markets));
  if (requiredSymbol) symbols.add(requiredSymbol);
  for (const pos of ctx.positions) {
    if (Math.abs(pos.signedNotionalUsd) > 0) symbols.add(pos.symbol);
  }
  if (symbols.size === 0) {
    return buildProtectionDecision({
      allowed: false,
      action: 'STALE_DATA_FAIL_CLOSED',
      posture: 'HALT_ONLY',
      controlId: 9,
      reason: 'No market microstructure snapshots supplied; failing closed',
    });
  }

  const lastMap = state.getLastTimestampsRecord();
  for (const sym of symbols) {
    const failure = evaluateMarketDataFreshness(ctx.markets[sym], ctx.nowMs, lastMap[sym], config);
    if (failure) {
      return buildProtectionDecision({
        allowed: false,
        action: failure.action,
        posture: 'HALT_ONLY',
        controlId: failure.controlId,
        reason: failure.reason,
      });
    }
  }

  for (const sym of symbols) {
    const snap = ctx.markets[sym];
    if (snap) state.updateMarketTimestamp(sym, snap.timestampMs);
  }
  return null;
}

export function resolveUnwindDecision(
  ctx: ProtectionTickContext,
  state: ProtectionStateTracker,
  config: ProtectionEngineConfig,
  unwindFraction: number,
  stage: UnwindStage,
  action: ProtectionActionCode,
  controlId: number,
  reasonPrefix: string,
  order?: PreTradeOrderCandidate,
): ProtectionDecision {
  const plan = buildReduceOnlyTwapPlan(
    ctx.positions,
    ctx.markets,
    state.getLastTimestampsRecord(),
    unwindFraction,
    stage,
    ctx.nowMs,
    config,
  );

  if (!plan.safeToUnwind) {
    return buildProtectionDecision({
      allowed: false,
      action,
      posture: 'HALT_ONLY',
      controlId,
      reason: `${reasonPrefix}; TWAP unsafe (${plan.fallbackReason}) -> fallback HALT_ONLY`,
      unwindStage: stage,
      unwindSlices: [],
    });
  }

  const matchingReduceOrder =
    order !== undefined &&
    order.reduceOnly &&
    order.orderType === 'LIMIT' &&
    plan.slices.some(
      (s) => s.symbol === order.symbol && s.side === order.side && order.price * order.quantity <= s.sliceNotionalUsd * 1.0001,
    );

  return buildProtectionDecision({
    allowed: order === undefined ? false : matchingReduceOrder,
    action,
    posture: 'REDUCE_ONLY_TWAP',
    controlId,
    reason: `${reasonPrefix}; emitting bounded <= 1% participation reduceOnly TWAP slices`,
    cancelRestingRiskIncreasingQuotes: true,
    unwindStage: stage,
    unwindSlices: plan.slices,
  });
}
