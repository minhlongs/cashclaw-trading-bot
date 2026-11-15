// Default runtime capital protection, order lifecycle, and micro-unit ledger bundle for BotManagerFactory.
// Pure Apache-2.0 open-core wiring: zero src/ee or src/forest imports.

import { PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  BASE_UNITS_PER_ASSET, D1AtomicLedgerBatcher, MICRO_USD_PER_USD, MicroDoubleEntryLedger,
  ZERO_BIGINT, type D1DatabaseLike, type LedgerPositionRecord,
} from '../ledger';
import {
  CapitalProtectionEngine, type MarketMicrostructureSnapshot,
  type PositionExposure, type ProtectionTickContext,
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
  readonly getLastTickTimestampMs?: () => number | null;
  readonly getD1Database?: () => D1DatabaseLike | null;
}

export interface BotSafetyRuntimeBundle {
  readonly protectionEngine: CapitalProtectionEngine;
  readonly lifecycleEngine: PaperOrderLifecycleEngine;
  readonly ledger: MicroDoubleEntryLedger;
  readonly ledgerBatcher?: D1AtomicLedgerBatcher;
  readonly protectionContextProvider: (orderHint?: ProtectionOrderHint) => ProtectionTickContext;
}

function buildMarketSnapshot(
  symbol: string, midPrice: number, equityUsd: number, snapshotTimestampMs: number,
): MarketMicrostructureSnapshot {
  const halfSpread = midPrice * 0.0001;
  return {
    symbol, timestampMs: snapshotTimestampMs, midPrice,
    bestBid: midPrice - halfSpread, bestAsk: midPrice + halfSpread,
    spreadBps: 2, bookDepthUsd: Math.max(100_000, equityUsd * 10),
    barVolumeUsd: Math.max(1_000_000, equityUsd * 50), barReturnSigma: 0, jumpShockBps: 0,
  };
}

function mapLedgerPositions(
  records: readonly LedgerPositionRecord[], primarySymbol: string, primaryMidPrice: number,
): PositionExposure[] {
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

function resolveMidPrice(
  lastTickPrice: number | null, configSymbol: string, orderHint?: ProtectionOrderHint,
): number {
  const hasValidTick = lastTickPrice !== null && Number.isFinite(lastTickPrice) && lastTickPrice > 0;
  const sameSymbol = !orderHint?.symbol || orderHint.symbol === configSymbol;
  if (sameSymbol) return hasValidTick ? lastTickPrice : 0;
  if (hasValidTick && orderHint?.price !== undefined && Number.isFinite(orderHint.price) && orderHint.price > 0) {
    return orderHint.price;
  }
  return 0;
}

function buildMarketsRecord(
  targetSymbol: string, configSymbol: string, midPrice: number, lastTickPrice: number | null,
  positions: readonly PositionExposure[], equityUsd: number, tickTimestampMs: number,
): Record<string, MarketMicrostructureSnapshot> {
  const markets: Record<string, MarketMicrostructureSnapshot> = {};
  if (midPrice > 0 && tickTimestampMs > 0) {
    markets[targetSymbol] = buildMarketSnapshot(targetSymbol, midPrice, equityUsd, tickTimestampMs);
  }
  if (configSymbol !== targetSymbol && lastTickPrice !== null && Number.isFinite(lastTickPrice) && lastTickPrice > 0 && tickTimestampMs > 0) {
    markets[configSymbol] = buildMarketSnapshot(configSymbol, lastTickPrice, equityUsd, tickTimestampMs);
  }
  for (const pos of positions) {
    if (!markets[pos.symbol] && pos.markPrice > 0 && tickTimestampMs > 0) {
      markets[pos.symbol] = buildMarketSnapshot(pos.symbol, pos.markPrice, equityUsd, tickTimestampMs);
    }
  }
  return markets;
}

export function createBotSafetyRuntime(input: BuildBotSafetyRuntimeInput): BotSafetyRuntimeBundle {
  const { botId, initialCapital, getConfig, getState, getLastTickPrice, getLastTickTimestampMs, getD1Database } = input;
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
    const targetSymbol = orderHint?.symbol ?? config.symbol;
    const lastTick = getLastTickPrice();
    const rawTickTs = getLastTickTimestampMs ? getLastTickTimestampMs() : nowMs;
    const tickTimestampMs = rawTickTs !== null && Number.isFinite(rawTickTs) && rawTickTs > 0
      ? rawTickTs
      : getLastTickTimestampMs ? (lastTick === null ? 0 : nowMs) : nowMs;
    const midPrice = resolveMidPrice(lastTick, config.symbol, orderHint);
    const positions = mapLedgerPositions(ledger.exportSnapshot().positions, targetSymbol, midPrice);
    const unrealizedPnlUsd = positions.reduce(
      (sum, p) => sum + (p.signedNotionalUsd / (p.markPrice || 1)) * (p.markPrice - p.entryPrice), 0,
    );
    const realizedPnlUsd = hasLedgerRealized
      ? Number(sheet.equityMicroUsd) / MICRO_SCALE_NUM - baseCapitalUsd : state.totalPnl;
    const rolling24hPnlUsd = realizedPnlUsd + unrealizedPnlUsd;
    const equityUsd = Math.max(0.01, baseCapitalUsd + rolling24hPnlUsd);
    if (equityUsd > peakEquityUsd) peakEquityUsd = equityUsd;
    const assetsMicroUsd = Number(sheet.assetsMicroUsd);
    const equityMicroUsd = Number(sheet.equityMicroUsd);

    return {
      nowMs, equityUsd, peakEquityUsd, rolling24hPnlUsd, rolling24hRefEquityUsd: baseCapitalUsd,
      positions,
      markets: buildMarketsRecord(targetSymbol, config.symbol, midPrice, lastTick, positions, equityUsd, tickTimestampMs),
      ledger: {
        assetsMicroUsd, liabilitiesMicroUsd: Number(sheet.liabilitiesMicroUsd), equityMicroUsd,
        assetsUsd: assetsMicroUsd / MICRO_SCALE_NUM, liabilitiesUsd: 0, equityUsd: equityMicroUsd / MICRO_SCALE_NUM,
      },
    };
  };

  return { protectionEngine, lifecycleEngine, ledger, ledgerBatcher, protectionContextProvider };
}
