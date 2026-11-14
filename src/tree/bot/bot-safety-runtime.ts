// Default runtime capital protection, order lifecycle, and micro-unit ledger bundle for BotManagerFactory.
// Pure Apache-2.0 open-core wiring: zero src/ee or src/forest imports.

import { PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  BASE_UNITS_PER_ASSET,
  D1AtomicLedgerBatcher,
  MICRO_USD_PER_USD,
  MicroDoubleEntryLedger,
  ZERO_BIGINT,
  type D1DatabaseLike,
  type LedgerPositionRecord,
} from '../ledger';
import {
  CapitalProtectionEngine,
  type MarketMicrostructureSnapshot,
  type PositionExposure,
  type ProtectionTickContext,
} from '../protection';
import type { BotConfig, BotState, ProtectionOrderHint } from './types';

const MICRO_SCALE_NUM = Number(MICRO_USD_PER_USD);
const BASE_SCALE_NUM = Number(BASE_UNITS_PER_ASSET);

export interface BuildBotSafetyRuntimeInput {
  readonly botId: string;
  readonly initialCapital: number;
  readonly getConfig: () => BotConfig;
  readonly getState: () => BotState;
  readonly getLastTickPrice: () => number | null;
  readonly getD1Database?: () => D1DatabaseLike | null;
}

export interface BotSafetyRuntimeBundle {
  readonly protectionEngine: CapitalProtectionEngine;
  readonly lifecycleEngine: PaperOrderLifecycleEngine;
  readonly ledger: MicroDoubleEntryLedger;
  readonly ledgerBatcher?: D1AtomicLedgerBatcher;
  readonly protectionContextProvider: (orderHint?: ProtectionOrderHint) => ProtectionTickContext;
}

function buildFreshMarketSnapshot(symbol: string, midPrice: number, equityUsd: number, nowMs: number): MarketMicrostructureSnapshot {
  const halfSpread = midPrice * 0.0001;
  return {
    symbol, timestampMs: nowMs, midPrice,
    bestBid: midPrice - halfSpread, bestAsk: midPrice + halfSpread,
    spreadBps: 2, bookDepthUsd: Math.max(100_000, equityUsd * 10),
    barVolumeUsd: Math.max(1_000_000, equityUsd * 50), barReturnSigma: 0, jumpShockBps: 0,
  };
}

function mapLedgerPositions(records: readonly LedgerPositionRecord[], primarySymbol: string, primaryMidPrice: number): PositionExposure[] {
  const exposures: PositionExposure[] = [];
  for (const rec of records) {
    if (rec.signedQtyBase === ZERO_BIGINT) continue;
    const signedQty = Number(rec.signedQtyBase) / BASE_SCALE_NUM;
    const entryPrice = Number(rec.openNotionalMicroUsd) / MICRO_SCALE_NUM / Math.abs(signedQty);
    const markPrice = rec.symbol === primarySymbol && primaryMidPrice > 0 ? primaryMidPrice : entryPrice;
    exposures.push({
      symbol: rec.symbol, signedNotionalUsd: signedQty * markPrice,
      entryPrice, markPrice, betaToBtc: rec.symbol.startsWith('BTC') ? 1.0 : 0.8,
    });
  }
  return exposures;
}

function resolveMidPrice(lastTickPrice: number | null, orderHint?: ProtectionOrderHint): number {
  if (lastTickPrice !== null && Number.isFinite(lastTickPrice) && lastTickPrice > 0) return lastTickPrice;
  if (lastTickPrice === null && orderHint?.price !== undefined && Number.isFinite(orderHint.price) && orderHint.price > 0) {
    return orderHint.price;
  }
  return 0;
}

function buildMarketsRecord(
  targetSymbol: string, configSymbol: string, midPrice: number,
  positions: readonly PositionExposure[], equityUsd: number, nowMs: number,
): Record<string, MarketMicrostructureSnapshot> {
  const markets: Record<string, MarketMicrostructureSnapshot> = {};
  if (midPrice > 0) {
    markets[targetSymbol] = buildFreshMarketSnapshot(targetSymbol, midPrice, equityUsd, nowMs);
    if (configSymbol !== targetSymbol) {
      markets[configSymbol] = buildFreshMarketSnapshot(configSymbol, midPrice, equityUsd, nowMs);
    }
  }
  for (const pos of positions) {
    if (!markets[pos.symbol] && pos.markPrice > 0) {
      markets[pos.symbol] = buildFreshMarketSnapshot(pos.symbol, pos.markPrice, equityUsd, nowMs);
    }
  }
  return markets;
}

export function createBotSafetyRuntime(input: BuildBotSafetyRuntimeInput): BotSafetyRuntimeBundle {
  const { botId, initialCapital, getConfig, getState, getLastTickPrice, getD1Database } = input;
  const nowInitMs = Date.now();
  const ledger = new MicroDoubleEntryLedger(botId);
  ledger.depositCapital(`init_deposit_${botId}`, BigInt(Math.max(1, Math.round(initialCapital * MICRO_SCALE_NUM))), nowInitMs);

  const lifecycleEngine = new PaperOrderLifecycleEngine({ botId, ledger });
  const protectionEngine = new CapitalProtectionEngine({
    marketNeutralMode: false, maxSingleOrderNotionalPct: 0.25, maxSingleAssetWeightPct: 0.25,
  });
  const d1 = getD1Database?.() ?? null;
  const ledgerBatcher = d1 ? new D1AtomicLedgerBatcher(d1) : undefined;

  let peakEquityUsd = Math.max(0.01, initialCapital);
  let lastNowMs = nowInitMs;

  const protectionContextProvider = (orderHint?: ProtectionOrderHint): ProtectionTickContext => {
    const nowMs = Math.max(Date.now(), lastNowMs);
    lastNowMs = nowMs;
    const config = getConfig();
    const state = getState();
    const sheet = ledger.getBalanceSheet();
    const balances = ledger.getAccountBalances();
    const baseCapitalUsd = Math.max(0.01, Number(balances.INITIAL_CAPITAL) / MICRO_SCALE_NUM);
    const hasLedgerRealized =
      balances.REALIZED_PNL !== ZERO_BIGINT || balances.FEES_EXPENSE !== ZERO_BIGINT || balances.FUNDING_NET !== ZERO_BIGINT;
    const rolling24hPnlUsd = hasLedgerRealized ? Number(sheet.equityMicroUsd) / MICRO_SCALE_NUM - baseCapitalUsd : state.totalPnl;
    const equityUsd = Math.max(0.01, baseCapitalUsd + rolling24hPnlUsd);
    if (equityUsd > peakEquityUsd) peakEquityUsd = equityUsd;

    const targetSymbol = orderHint?.symbol ?? config.symbol;
    const midPrice = resolveMidPrice(getLastTickPrice(), orderHint);
    const positions = mapLedgerPositions(ledger.exportSnapshot().positions, targetSymbol, midPrice);
    const assetsMicroUsd = Number(sheet.assetsMicroUsd);
    const equityMicroUsd = Number(sheet.equityMicroUsd);

    return {
      nowMs, equityUsd, peakEquityUsd, rolling24hPnlUsd, rolling24hRefEquityUsd: baseCapitalUsd,
      positions,
      markets: buildMarketsRecord(targetSymbol, config.symbol, midPrice, positions, equityUsd, nowMs),
      ledger: {
        assetsMicroUsd, liabilitiesMicroUsd: Number(sheet.liabilitiesMicroUsd), equityMicroUsd,
        assetsUsd: assetsMicroUsd / MICRO_SCALE_NUM, liabilitiesUsd: 0, equityUsd: equityMicroUsd / MICRO_SCALE_NUM,
      },
    };
  };

  return { protectionEngine, lifecycleEngine, ledger, ledgerBatcher, protectionContextProvider };
}
