/**
 * Pre-trade numeric/notional validation, market-data freshness fence,
 * and realized volatility / jump / spread collar gate.
 */

import type {
  MarketMicrostructureSnapshot,
  PreTradeOrderCandidate,
  ProtectionActionCode,
  ProtectionEngineConfig,
} from './protection-types';

export interface GuardCheckFailure {
  readonly action: ProtectionActionCode;
  readonly controlId: number;
  readonly reason: string;
  readonly nonOverridable: boolean;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function evaluateOrderNumericAndNotional(
  order: PreTradeOrderCandidate,
  equityUsd: number,
  nowMs: number,
  config: ProtectionEngineConfig,
): GuardCheckFailure | null {
  const validCoreNumbers =
    isPositiveFinite(order.price) &&
    isPositiveFinite(order.quantity) &&
    isPositiveFinite(equityUsd) &&
    Number.isFinite(nowMs) &&
    isPositiveFinite(order.timestampMs);

  if (!validCoreNumbers) {
    return {
      action: 'REJECT_PRETRADE',
      controlId: 1,
      reason: 'Pre-trade numeric guard: non-finite or non-positive price, quantity, equity, or timestamp',
      nonOverridable: true,
    };
  }

  const clockSkewMs = Math.abs(nowMs - order.timestampMs);
  if (clockSkewMs > config.maxClockSkewMs) {
    return {
      action: 'REJECT_PRETRADE',
      controlId: 1,
      reason: `Pre-trade clock skew ${clockSkewMs}ms exceeds ${config.maxClockSkewMs}ms limit`,
      nonOverridable: false,
    };
  }

  const orderNotionalUsd = order.price * order.quantity;
  if (orderNotionalUsd > equityUsd * config.maxSingleOrderNotionalPct) {
    return {
      action: 'REJECT_PRETRADE',
      controlId: 1,
      reason: `Single-order notional $${orderNotionalUsd.toFixed(2)} exceeds ${(config.maxSingleOrderNotionalPct * 100).toFixed(1)}% NAV cap`,
      nonOverridable: false,
    };
  }

  return null;
}

export function evaluateMarketDataFreshness(
  market: MarketMicrostructureSnapshot | undefined,
  nowMs: number,
  lastTimestampMs: number | undefined,
  config: ProtectionEngineConfig,
): GuardCheckFailure | null {
  if (!market || !isPositiveFinite(market.timestampMs) || !isPositiveFinite(market.midPrice)) {
    return {
      action: 'STALE_DATA_FAIL_CLOSED',
      controlId: 9,
      reason: 'Missing or invalid market microstructure snapshot',
      nonOverridable: false,
    };
  }

  if (lastTimestampMs !== undefined && market.timestampMs < lastTimestampMs) {
    return {
      action: 'STALE_DATA_FAIL_CLOSED',
      controlId: 9,
      reason: `Out-of-order market timestamp ${market.timestampMs} < previous ${lastTimestampMs}`,
      nonOverridable: false,
    };
  }

  const ageMs = nowMs - market.timestampMs;
  if (ageMs > config.maxMarketDataAgeMs || ageMs < -config.maxClockSkewMs) {
    return {
      action: 'STALE_DATA_FAIL_CLOSED',
      controlId: 9,
      reason: `Market feed staleness/skew ageMs=${ageMs} violates [0, ${config.maxMarketDataAgeMs}]ms fence`,
      nonOverridable: false,
    };
  }

  return null;
}

export function evaluateVolatilityAndSpreadGate(
  order: PreTradeOrderCandidate,
  market: MarketMicrostructureSnapshot,
  config: ProtectionEngineConfig,
): GuardCheckFailure | null {
  const shockActive =
    Math.abs(market.barReturnSigma) >= config.volShockSigmaThreshold ||
    Math.abs(market.jumpShockBps) >= config.jumpOrSpreadShockBps ||
    market.spreadBps >= config.jumpOrSpreadShockBps;

  if (!shockActive) return null;

  if (order.orderType === 'MARKET') {
    return {
      action: 'MARKET_ORDER_BAN',
      controlId: 7,
      reason: `Market order banned during vol/jump/spread shock (sigma=${market.barReturnSigma}, spread=${market.spreadBps}bps)`,
      nonOverridable: false,
    };
  }

  const distanceBps = (Math.abs(order.price - market.midPrice) / market.midPrice) * 10_000;
  const crossesTouch =
    (order.side === 'BUY' && order.price >= market.bestAsk) ||
    (order.side === 'SELL' && order.price <= market.bestBid);

  if (distanceBps > config.limitCollarBps || (!order.reduceOnly && crossesTouch)) {
    return {
      action: 'MARKET_ORDER_BAN',
      controlId: 7,
      reason: `Aggressive or out-of-collar limit order blocked under shock (collar=${distanceBps.toFixed(1)}bps)`,
      nonOverridable: false,
    };
  }

  return null;
}
