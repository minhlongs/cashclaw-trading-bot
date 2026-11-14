// Gate G13: Protection Context Builder & Single-Leg Lifecycle Order Executor.

import type { PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  MICRO_USD_PER_USD,
  ZERO_BIGINT,
  computeNotionalMicroUsd,
  type MicroDoubleEntryLedger,
} from '../ledger';
import type {
  CapitalProtectionEngine,
  MarketMicrostructureSnapshot,
  PreTradeOrderCandidate,
  ProtectionTickContext,
} from '../protection';
import {
  computeFeeMicroUsd,
  fromBaseUnits,
  perpLegSymbol,
  spotLegSymbol,
  toMicroUsd,
  type PortfolioValuation,
} from './paper-forward-math';
import type { H3MakerSymbolObservation } from './spec-types';

function buildLegMarketSnapshot(
  legSym: string,
  midUsd: number,
  spreadBps: number,
  bookDepthUsd: number,
  dataTs: number,
): MarketMicrostructureSnapshot {
  const halfSpread = (spreadBps / 20_000) * midUsd;
  return {
    symbol: legSym,
    timestampMs: dataTs,
    midPrice: midUsd,
    bestBid: midUsd - halfSpread,
    bestAsk: midUsd + halfSpread,
    spreadBps,
    bookDepthUsd,
    barVolumeUsd: bookDepthUsd * 10,
    barReturnSigma: 0.8,
    jumpShockBps: 5,
  };
}

export function buildProtectionContext(params: {
  readonly nowMs: number;
  readonly valuation: PortfolioValuation;
  readonly peakNavUsd: number;
  readonly prevNavUsd: number;
  readonly ledger: MicroDoubleEntryLedger;
  readonly observations: readonly H3MakerSymbolObservation[];
}): ProtectionTickContext {
  const sheet = params.ledger.getBalanceSheet();
  const markets: Record<string, MarketMicrostructureSnapshot> = {};
  for (const obs of params.observations) {
    const spread = obs.spreadBps ?? 4.0;
    const depth = obs.bookDepthUsd ?? 500_000;
    const ts = obs.dataTimestampMs ?? params.nowMs;
    markets[spotLegSymbol(obs.symbol)] = buildLegMarketSnapshot(
      spotLegSymbol(obs.symbol), obs.spotMidUsd, spread, depth, ts,
    );
    markets[perpLegSymbol(obs.symbol)] = buildLegMarketSnapshot(
      perpLegSymbol(obs.symbol), obs.perpMidUsd, spread, depth, ts,
    );
  }
  return {
    nowMs: params.nowMs,
    equityUsd: Math.max(0.01, params.valuation.navUsd),
    peakEquityUsd: Math.max(params.peakNavUsd, params.valuation.navUsd),
    rolling24hPnlUsd: params.valuation.navUsd - params.prevNavUsd,
    rolling24hRefEquityUsd: Math.max(0.01, params.prevNavUsd),
    positions: params.valuation.positions,
    markets,
    ledger: {
      assetsMicroUsd: Number(sheet.assetsMicroUsd),
      liabilitiesMicroUsd: Number(sheet.liabilitiesMicroUsd),
      equityMicroUsd: Number(sheet.equityMicroUsd),
      assetsUsd: Number(sheet.assetsMicroUsd) / Number(MICRO_USD_PER_USD),
      liabilitiesUsd: 0,
      equityUsd: Number(sheet.equityMicroUsd) / Number(MICRO_USD_PER_USD),
    },
  };
}

export interface SingleLegOrderParams {
  readonly botId: string;
  readonly strategyId: string;
  readonly idempotencyKey: string;
  readonly legSymbol: string;
  readonly side: 'buy' | 'sell';
  readonly qtyBase: bigint;
  readonly fillQtyBase: bigint;
  readonly limitPriceUsd: number;
  readonly fillPriceUsd: number;
  readonly feeBps: number;
  readonly marginRateBps: bigint;
  readonly reduceOnly: boolean;
  readonly nowMs: number;
  readonly protection: CapitalProtectionEngine;
  readonly lifecycle: PaperOrderLifecycleEngine;
  readonly tickCtx: ProtectionTickContext;
}

export interface LegExecutionOutcome {
  readonly executedOrders: number;
  readonly protectionViolations: number;
}

export function executeSingleLegLifecycle(params: SingleLegOrderParams): LegExecutionOutcome {
  const candidate: PreTradeOrderCandidate = {
    orderId: params.idempotencyKey,
    botId: params.botId,
    strategyId: params.strategyId,
    symbol: params.legSymbol,
    side: params.side === 'buy' ? 'BUY' : 'SELL',
    orderType: 'LIMIT',
    price: params.limitPriceUsd,
    quantity: fromBaseUnits(params.qtyBase),
    reduceOnly: params.reduceOnly,
    timestampMs: params.nowMs,
  };
  const pre = params.protection.evaluatePreTrade(candidate, params.tickCtx);
  if (!pre.allowed) return { executedOrders: 0, protectionViolations: 1 };

  const sub = params.lifecycle.submitOrder({
    idempotencyKey: params.idempotencyKey,
    symbol: params.legSymbol,
    side: params.side,
    type: 'limit',
    quantityBase: params.qtyBase,
    priceMicroUsd: toMicroUsd(params.limitPriceUsd),
    reduceOnly: params.reduceOnly,
    marginRateBps: params.marginRateBps,
    nowMs: params.nowMs,
  });
  if (!sub.ok) return { executedOrders: 0, protectionViolations: 1 };

  if (params.fillQtyBase <= ZERO_BIGINT) {
    params.lifecycle.cancelOrder(params.idempotencyKey, params.nowMs + 50);
    return { executedOrders: 0, protectionViolations: 0 };
  }

  const fillMicroUsd = toMicroUsd(params.fillPriceUsd);
  const notionalMicroUsd = computeNotionalMicroUsd(params.fillQtyBase, fillMicroUsd);
  const fillRes = params.lifecycle.applyFillEvent({
    fillEventId: `fill_${params.idempotencyKey}`,
    clientOrderId: params.idempotencyKey,
    seq: 1,
    fillQtyBase: params.fillQtyBase,
    fillPriceMicroUsd: fillMicroUsd,
    feeMicroUsd: computeFeeMicroUsd(notionalMicroUsd, params.feeBps),
    timestampMs: params.nowMs + 10,
  });
  if (!fillRes.ok) {
    params.lifecycle.cancelOrder(params.idempotencyKey, params.nowMs + 50);
    return { executedOrders: 0, protectionViolations: 1 };
  }
  if (params.fillQtyBase < params.qtyBase) {
    params.lifecycle.cancelOrder(params.idempotencyKey, params.nowMs + 50);
  }
  return { executedOrders: 1, protectionViolations: 0 };
}
