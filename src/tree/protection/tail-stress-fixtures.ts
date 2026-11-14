/**
 * Deterministic baseline market, position, and order builders for tail-stress verification.
 */

import type {
  MarketMicrostructureSnapshot,
  PositionExposure,
  PreTradeOrderCandidate,
  ProtectionTickContext,
} from './protection-types';

export const STRESS_BASE_TIMESTAMP_MS = 1_763_078_400_000;

export function makeStressMarket(
  symbol: string,
  overrides: Partial<MarketMicrostructureSnapshot> = {},
): MarketMicrostructureSnapshot {
  const midPrice = overrides.midPrice ?? 100_000;
  const spreadBps = overrides.spreadBps ?? 10;
  const halfSpread = midPrice * (spreadBps / 20_000);
  return {
    symbol,
    timestampMs: STRESS_BASE_TIMESTAMP_MS,
    midPrice,
    bestBid: Number((midPrice - halfSpread).toFixed(6)),
    bestAsk: Number((midPrice + halfSpread).toFixed(6)),
    spreadBps,
    bookDepthUsd: 1_000_000,
    barVolumeUsd: 2_500_000,
    barReturnSigma: 0.8,
    jumpShockBps: 15,
    ...overrides,
  };
}

export function makeStressPosition(
  symbol: string,
  signedNotionalUsd: number,
  overrides: Partial<PositionExposure> = {},
): PositionExposure {
  return {
    symbol,
    signedNotionalUsd,
    entryPrice: 100_000,
    markPrice: 100_000,
    betaToBtc: symbol.startsWith('BTC') ? 1.0 : 0.75,
    maintenanceMarginRate: 0.04,
    ...overrides,
  };
}

export function makeStressContext(
  overrides: Partial<ProtectionTickContext> = {},
): ProtectionTickContext {
  const btcMarket = makeStressMarket('BTCUSDT');
  return {
    nowMs: STRESS_BASE_TIMESTAMP_MS + 500,
    equityUsd: 100_000,
    peakEquityUsd: 100_000,
    rolling24hPnlUsd: 0,
    rolling24hRefEquityUsd: 100_000,
    positions: [],
    markets: { BTCUSDT: btcMarket },
    ledger: { assetsUsd: 120_000, liabilitiesUsd: 20_000, equityUsd: 100_000 },
    ...overrides,
  };
}

export function makeStressOrder(
  overrides: Partial<PreTradeOrderCandidate> = {},
): PreTradeOrderCandidate {
  return {
    orderId: 'ord-stress-1',
    botId: 'bot-alpha-1',
    strategyId: 'strat-neutral-1',
    symbol: 'BTCUSDT',
    side: 'BUY',
    orderType: 'LIMIT',
    price: 99_950,
    quantity: 0.05,
    reduceOnly: false,
    timestampMs: STRESS_BASE_TIMESTAMP_MS + 400,
    betaToBtc: 1.0,
    ...overrides,
  };
}
