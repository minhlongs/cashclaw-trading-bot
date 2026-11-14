// Gate G13: Paired Spot-Perp Maker Execution, FIFO Queue Lag & Single-Leg Miss Handler.

import type { PaperOrderLifecycleEngine } from '../execution/lifecycle';
import { ZERO_BIGINT, absBigInt, type MicroDoubleEntryLedger } from '../ledger';
import type {
  CapitalProtectionEngine,
  DeterministicPrng,
  ProtectionTickContext,
} from '../protection';
import {
  executeSingleLegLifecycle,
  type LegExecutionOutcome,
} from './paper-forward-leg-order';
import {
  PERP_MARGIN_RATE_BPS,
  SPOT_MARGIN_RATE_BPS,
  applyAdversePriceUsd,
  perpLegSymbol,
  spotLegSymbol,
  toBaseUnits,
  toMicroUsd,
} from './paper-forward-math';
import type { H3MakerSymbolObservation, SignedStrategySpec } from './spec-types';

export interface PairRebalanceContext {
  readonly botId: string;
  readonly dayIndex: number;
  readonly nowMs: number;
  readonly navUsd: number;
  readonly allowNewEntries: boolean;
  readonly forceUnwind: boolean;
  readonly spec: SignedStrategySpec;
  readonly obs: H3MakerSymbolObservation;
  readonly ledger: MicroDoubleEntryLedger;
  readonly lifecycle: PaperOrderLifecycleEngine;
  readonly protection: CapitalProtectionEngine;
  readonly prng: DeterministicPrng;
  readonly tickCtx: ProtectionTickContext;
  readonly refreshTickCtx?: () => ProtectionTickContext;
}

function currentTickCtx(ctx: PairRebalanceContext): ProtectionTickContext {
  return ctx.refreshTickCtx ? ctx.refreshTickCtx() : ctx.tickCtx;
}

function executePairExit(ctx: PairRebalanceContext, spotQty: bigint, perpQty: bigint): LegExecutionOutcome {
  const halfAdv = ctx.spec.parameters.adverseSelectionBps / 2;
  let executed = 0;
  let violations = 0;
  if (spotQty > ZERO_BIGINT) {
    const res = executeSingleLegLifecycle({
      botId: ctx.botId, strategyId: ctx.spec.strategyId,
      idempotencyKey: `h3m_d${ctx.dayIndex}_${ctx.obs.symbol}_spot_exit`,
      legSymbol: spotLegSymbol(ctx.obs.symbol), side: 'sell',
      qtyBase: spotQty, fillQtyBase: spotQty,
      limitPriceUsd: ctx.obs.spotMidUsd,
      fillPriceUsd: applyAdversePriceUsd(ctx.obs.spotMidUsd, 'sell', halfAdv),
      feeBps: ctx.spec.venueSchedule.spotMakerBps, marginRateBps: SPOT_MARGIN_RATE_BPS,
      reduceOnly: true, nowMs: ctx.nowMs,
      protection: ctx.protection, lifecycle: ctx.lifecycle, tickCtx: currentTickCtx(ctx),
    });
    executed += res.executedOrders;
    violations += res.protectionViolations;
  }
  if (perpQty > ZERO_BIGINT) {
    const res = executeSingleLegLifecycle({
      botId: ctx.botId, strategyId: ctx.spec.strategyId,
      idempotencyKey: `h3m_d${ctx.dayIndex}_${ctx.obs.symbol}_perp_exit`,
      legSymbol: perpLegSymbol(ctx.obs.symbol), side: 'buy',
      qtyBase: perpQty, fillQtyBase: perpQty,
      limitPriceUsd: ctx.obs.perpMidUsd,
      fillPriceUsd: applyAdversePriceUsd(ctx.obs.perpMidUsd, 'buy', halfAdv),
      feeBps: ctx.spec.venueSchedule.perpMakerBps, marginRateBps: PERP_MARGIN_RATE_BPS,
      reduceOnly: true, nowMs: ctx.nowMs,
      protection: ctx.protection, lifecycle: ctx.lifecycle, tickCtx: currentTickCtx(ctx),
    });
    executed += res.executedOrders;
    violations += res.protectionViolations;
  }
  return { executedOrders: executed, protectionViolations: violations };
}

function resolvePerpEntryLegConfig(
  ctx: PairRebalanceContext,
  perpId: string,
  halfAdv: number,
): { idempotencyKey: string; feeBps: number; slipBps: number } {
  const uMiss = ctx.obs.legMissUniformDraw ?? ctx.prng.nextUnit();
  if (uMiss < ctx.spec.parameters.singleLegMissProbability) {
    return {
      idempotencyKey: `${perpId}_emerg_taker`,
      feeBps: ctx.spec.venueSchedule.perpTakerBps,
      slipBps: ((ctx.obs.spreadBps ?? 4) / 2) + halfAdv,
    };
  }
  return { idempotencyKey: perpId, feeBps: ctx.spec.venueSchedule.perpMakerBps, slipBps: halfAdv };
}

function executePairEntry(ctx: PairRebalanceContext): LegExecutionOutcome {
  const spotTickCtx = ctx.tickCtx;
  const perLegCapPct = Math.min(
    0.20,
    (ctx.spec.parameters.maxGrossLeverage * 0.995) / (2 * ctx.spec.universe.length),
  );
  const usedGrossUsd = spotTickCtx.positions.reduce(
    (sum, p) => sum + Math.abs(p.signedNotionalUsd),
    0,
  );
  const availPairGrossUsd = Math.max(
    0,
    spotTickCtx.equityUsd * ctx.spec.parameters.maxGrossLeverage * 0.99 - usedGrossUsd,
  );
  const pairUnitUsd = ctx.obs.spotMidUsd + ctx.obs.perpMidUsd;
  const targetSpotUsd = Math.min(
    spotTickCtx.equityUsd * perLegCapPct,
    pairUnitUsd > 0 ? availPairGrossUsd * (ctx.obs.spotMidUsd / pairUnitUsd) : 0,
  );
  if (targetSpotUsd < 25) return { executedOrders: 0, protectionViolations: 0 };

  const qtyBase = toBaseUnits(targetSpotUsd / ctx.obs.spotMidUsd);
  const uFifo = ctx.obs.fifoUniformDraw ?? ctx.prng.nextUnit();
  const queueFilled = ctx.spec.parameters.fifoFillProbability > 0 && uFifo <= ctx.spec.parameters.fifoFillProbability;
  const frac = Math.min(1, Math.max(0.05, ctx.obs.fifoFillFraction ?? 1.0));
  const fillQty = queueFilled ? (qtyBase * BigInt(Math.round(frac * 10_000))) / BigInt(10_000) : ZERO_BIGINT;
  const halfAdv = ctx.spec.parameters.adverseSelectionBps / 2;

  const spotId = `h3m_d${ctx.dayIndex}_${ctx.obs.symbol}_spot_entry`;
  const perpId = `h3m_d${ctx.dayIndex}_${ctx.obs.symbol}_perp_entry`;
  const spotRes = executeSingleLegLifecycle({
    botId: ctx.botId, strategyId: ctx.spec.strategyId, idempotencyKey: spotId,
    legSymbol: spotLegSymbol(ctx.obs.symbol), side: 'buy', qtyBase, fillQtyBase: fillQty,
    limitPriceUsd: ctx.obs.spotMidUsd,
    fillPriceUsd: applyAdversePriceUsd(ctx.obs.spotMidUsd, 'buy', halfAdv),
    feeBps: ctx.spec.venueSchedule.spotMakerBps, marginRateBps: SPOT_MARGIN_RATE_BPS,
    reduceOnly: false, nowMs: ctx.nowMs, protection: ctx.protection, lifecycle: ctx.lifecycle, tickCtx: spotTickCtx,
  });
  if (!queueFilled || spotRes.executedOrders === 0) return spotRes;

  const pairId = `pair_d${ctx.dayIndex}_${ctx.obs.symbol}`;
  const perpCfg = resolvePerpEntryLegConfig(ctx, perpId, halfAdv);
  ctx.lifecycle.registerPairedLegs({
    pairId, symbol: ctx.obs.symbol, legAClientOrderId: spotId, legBClientOrderId: perpCfg.idempotencyKey,
  });
  const perpRes = executeSingleLegLifecycle({
    botId: ctx.botId, strategyId: ctx.spec.strategyId, idempotencyKey: perpCfg.idempotencyKey,
    legSymbol: perpLegSymbol(ctx.obs.symbol), side: 'sell', qtyBase: fillQty, fillQtyBase: fillQty,
    limitPriceUsd: ctx.obs.perpMidUsd,
    fillPriceUsd: applyAdversePriceUsd(ctx.obs.perpMidUsd, 'sell', perpCfg.slipBps),
    feeBps: perpCfg.feeBps, marginRateBps: PERP_MARGIN_RATE_BPS,
    reduceOnly: false, nowMs: ctx.nowMs, protection: ctx.protection, lifecycle: ctx.lifecycle,
    tickCtx: currentTickCtx(ctx),
  });
  const pairEval = ctx.lifecycle.evaluatePairedLegs(pairId, toMicroUsd(ctx.obs.spotMidUsd), ctx.nowMs + 4_000);
  if (perpRes.executedOrders === 0 || (pairEval.ok && pairEval.data.unhedgedQtyBase > ZERO_BIGINT)) {
    const unwindQty = pairEval.ok && pairEval.data.unhedgedQtyBase > ZERO_BIGINT ? pairEval.data.unhedgedQtyBase : fillQty;
    const unwindSlip = ((ctx.obs.spreadBps ?? 4) / 2) + halfAdv;
    const unwindRes = executeSingleLegLifecycle({
      botId: ctx.botId, strategyId: ctx.spec.strategyId, idempotencyKey: `${spotId}_emerg_unwind`,
      legSymbol: spotLegSymbol(ctx.obs.symbol), side: 'sell', qtyBase: unwindQty, fillQtyBase: unwindQty,
      limitPriceUsd: ctx.obs.spotMidUsd, fillPriceUsd: applyAdversePriceUsd(ctx.obs.spotMidUsd, 'sell', unwindSlip),
      feeBps: ctx.spec.venueSchedule.spotTakerBps, marginRateBps: SPOT_MARGIN_RATE_BPS,
      reduceOnly: true, nowMs: ctx.nowMs + 20, protection: ctx.protection, lifecycle: ctx.lifecycle,
      tickCtx: currentTickCtx(ctx),
    });
    return {
      executedOrders: spotRes.executedOrders + perpRes.executedOrders + unwindRes.executedOrders,
      protectionViolations: spotRes.protectionViolations + perpRes.protectionViolations + unwindRes.protectionViolations,
    };
  }
  return {
    executedOrders: spotRes.executedOrders + perpRes.executedOrders,
    protectionViolations: spotRes.protectionViolations + perpRes.protectionViolations,
  };
}

export function executeH3MakerSymbolStep(ctx: PairRebalanceContext): LegExecutionOutcome {
  const spotPos = ctx.ledger.getPosition(spotLegSymbol(ctx.obs.symbol));
  const perpPos = ctx.ledger.getPosition(perpLegSymbol(ctx.obs.symbol));
  const hasPos = spotPos.signedQtyBase > ZERO_BIGINT || perpPos.signedQtyBase < ZERO_BIGINT;

  if (hasPos) {
    if (ctx.forceUnwind || ctx.obs.impliedCarryAnnualBps <= ctx.spec.parameters.exitAnnualBps) {
      return executePairExit(ctx, spotPos.signedQtyBase, absBigInt(perpPos.signedQtyBase));
    }
    return { executedOrders: 0, protectionViolations: 0 };
  }

  if (!ctx.allowNewEntries || ctx.obs.impliedCarryAnnualBps < ctx.spec.parameters.entryAnnualBps) {
    return { executedOrders: 0, protectionViolations: 0 };
  }
  return executePairEntry(ctx);
}
