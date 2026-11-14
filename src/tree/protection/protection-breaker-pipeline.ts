/**
 * Pure portfolio and venue breaker pipeline used by CapitalProtectionEngine.
 * Evaluates staleness, gateway error strikes, pending-intent fences, cross-venue
 * dislocation, stablecoin depeg, 24h rolling loss latch, two-stage MDD TWAP,
 * strategy cooldown, symbol slippage quarantine, volatility collar, and leverage caps.
 */

import { evaluateCollateralPeg, evaluateVenueDislocation } from './ledger-and-override-guards';
import { evaluateConcentrationBetaAndLeverage } from './portfolio-exposure-guards';
import {
  evaluateOrderNumericAndNotional,
  evaluateVolatilityAndSpreadGate,
} from './pretrade-numeric-and-staleness-guards';
import {
  buildProtectionDecision,
  computeMinLiquidationBufferPct,
  evaluateAllMarketsFreshness,
  resolveUnwindDecision,
} from './protection-decision-helpers';
import type { ProtectionStateTracker } from './protection-state-tracker';
import type {
  PreTradeOrderCandidate,
  ProtectionDecision,
  ProtectionEngineConfig,
  ProtectionTickContext,
} from './protection-types';

function evaluateVenueAndCollateralGates(
  ctx: ProtectionTickContext,
  config: ProtectionEngineConfig,
  order?: PreTradeOrderCandidate,
): ProtectionDecision | null {
  if (ctx.venuePrices && ctx.venuePrices.length > 0) {
    const disloc = evaluateVenueDislocation(ctx.venuePrices, config.maxVenueDislocationBps);
    if (disloc.breached) {
      return buildProtectionDecision({
        allowed: false,
        action: 'SEV1_VENUE_DISLOCATION',
        posture: 'HALT_ONLY',
        controlId: 8,
        reason: disloc.reason,
      });
    }
  }

  if (ctx.collateralSamples && ctx.collateralSamples.length > 0) {
    const peg = evaluateCollateralPeg(
      ctx.collateralSamples,
      config.stablecoinPegLower,
      config.stablecoinPegUpper,
      config.depegStressHaircut,
    );
    if (peg.depegged && (!order || !order.reduceOnly)) {
      return buildProtectionDecision({
        allowed: false,
        action: 'COLLATERAL_DEPEG',
        posture: 'HALT_ONLY',
        controlId: 4,
        reason: String(peg.reason),
        effectiveCollateralUsd: peg.effectiveCollateralUsd,
      });
    }
  }
  return null;
}

export function evaluateSystemAndPortfolioBreakers(
  ctx: ProtectionTickContext,
  state: ProtectionStateTracker,
  config: ProtectionEngineConfig,
  order?: PreTradeOrderCandidate,
): ProtectionDecision | null {
  const stale = evaluateAllMarketsFreshness(ctx, state, config, order?.symbol);
  if (stale) return stale;

  if (state.consecutiveExchangeErrors >= config.maxExchangeErrorStrikes) {
    return buildProtectionDecision({
      allowed: false,
      action: 'DEGRADED_HALT',
      posture: 'HALT_ONLY',
      controlId: 8,
      reason: `Exchange gateway error strikes (${state.consecutiveExchangeErrors}) >= ${config.maxExchangeErrorStrikes}`,
    });
  }

  const fence = order
    ? state.findBlockingFence(order.botId, order.symbol, order.orderId, ctx.nowMs, config.maxPendingAckMs)
    : state.findAnyOverdueFence(ctx.nowMs, config.maxPendingAckMs);
  if (fence) {
    return buildProtectionDecision({
      allowed: false,
      action: 'RECONCILING',
      posture: 'HALT_ONLY',
      controlId: 11,
      reason: `Unreconciled order fence active for intent=${fence.intentId} (${fence.status})`,
    });
  }

  const venueOrPeg = evaluateVenueAndCollateralGates(ctx, config, order);
  if (venueOrPeg) return venueOrPeg;

  const rollingLossPct = -ctx.rolling24hPnlUsd / ctx.rolling24hRefEquityUsd;
  if (rollingLossPct >= config.maxRolling24hLossPct) {
    state.emergencyHaltLatched = true;
    state.emergencyHaltReason = `24h rolling loss ${(rollingLossPct * 100).toFixed(2)}% breached -${(config.maxRolling24hLossPct * 100).toFixed(2)}% limit`;
  }

  const drawdownPct = Math.max(0, (ctx.peakEquityUsd - ctx.equityUsd) / ctx.peakEquityUsd);
  if (drawdownPct >= config.hardDrawdownPct) {
    return resolveUnwindDecision(ctx, state, config, 1.0, 'HARD_100_PCT', 'CONTROLLED_LIQUIDATION', 6, `Hard MDD ${(drawdownPct * 100).toFixed(2)}%`, order);
  }
  if (drawdownPct >= config.softDrawdownPct) {
    return resolveUnwindDecision(ctx, state, config, 0.5, 'SOFT_50_PCT', 'CONTROLLED_LIQUIDATION', 6, `Soft MDD ${(drawdownPct * 100).toFixed(2)}%`, order);
  }

  const liqBuf = computeMinLiquidationBufferPct(ctx.positions, ctx);
  if (liqBuf.needsBufferUnwind) {
    return resolveUnwindDecision(ctx, state, config, liqBuf.unwindFraction, 'BUFFER_DEFENSE', 'CONTROLLED_LIQUIDATION', 6, `Liquidation buffer ${(liqBuf.minBufferPct * 100).toFixed(1)}% defense`, order);
  }

  if (state.emergencyHaltLatched && (!order || !order.reduceOnly)) {
    return buildProtectionDecision({
      allowed: false,
      action: 'EMERGENCY_HALT',
      posture: 'HALT_ONLY',
      controlId: 5,
      reason: String(state.emergencyHaltReason),
    });
  }
  return null;
}

export function evaluatePreTradeOperationalPipeline(
  order: PreTradeOrderCandidate,
  ctx: ProtectionTickContext,
  state: ProtectionStateTracker,
  config: ProtectionEngineConfig,
  numericCheck: ReturnType<typeof evaluateOrderNumericAndNotional>,
): ProtectionDecision | null {
  const sys = evaluateSystemAndPortfolioBreakers(ctx, state, config, order);
  if (sys && !sys.allowed) return sys;

  if (numericCheck) {
    return buildProtectionDecision({ allowed: false, action: numericCheck.action, posture: 'HALT_ONLY', controlId: numericCheck.controlId, reason: numericCheck.reason });
  }

  if (!order.reduceOnly) {
    const cd = state.getActiveStrategyCooldown(order.strategyId, ctx.nowMs);
    if (cd) {
      return buildProtectionDecision({ allowed: false, action: 'STRATEGY_COOLDOWN', posture: 'HALT_ONLY', controlId: 2, reason: `Strategy ${order.strategyId} quarantined until ${cd.cooldownUntilMs}` });
    }
    const sq = state.getActiveSymbolQuarantine(order.symbol, ctx.nowMs);
    if (sq) {
      return buildProtectionDecision({ allowed: false, action: 'ILLIQUID_QUARANTINE', posture: 'HALT_ONLY', controlId: 10, reason: `Symbol ${order.symbol} quarantined after ${sq.anomalyStreak} slippage anomalies` });
    }
  }

  const market = ctx.markets[order.symbol] as typeof ctx.markets[string];
  const volFail = evaluateVolatilityAndSpreadGate(order, market, config);
  if (volFail) {
    return buildProtectionDecision({ allowed: false, action: volFail.action, posture: 'HALT_ONLY', controlId: volFail.controlId, reason: volFail.reason });
  }

  const expFail = evaluateConcentrationBetaAndLeverage(order, ctx.positions, ctx.equityUsd, config);
  if (expFail) {
    return buildProtectionDecision({ allowed: false, action: expFail.action, posture: 'HALT_ONLY', controlId: expFail.controlId, reason: expFail.reason });
  }

  return sys;
}
