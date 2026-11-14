/**
 * Controlled reduce-only passive TWAP unwind planner.
 * Enforces <= 1% participation cap of stressed bar/book liquidity and falls back
 * to HALT_ONLY immediately whenever feed freshness or orderbook depth is unsafe.
 */

import { evaluateMarketDataFreshness } from './pretrade-numeric-and-staleness-guards';
import type {
  MarketMicrostructureSnapshot,
  PositionExposure,
  ProtectionEngineConfig,
  ProtectionPosture,
  TwapSliceIntent,
  UnwindStage,
} from './protection-types';

export type TwapUnwindPlan =
  | {
      readonly safeToUnwind: true;
      readonly posture: 'REDUCE_ONLY_TWAP';
      readonly stage: UnwindStage;
      readonly slices: readonly TwapSliceIntent[];
      readonly fallbackReason: null;
    }
  | {
      readonly safeToUnwind: false;
      readonly posture: ProtectionPosture;
      readonly stage: UnwindStage;
      readonly slices: readonly TwapSliceIntent[];
      readonly fallbackReason: string;
    };

export function isBookSafeForTwap(
  market: MarketMicrostructureSnapshot | undefined,
  nowMs: number,
  lastTimestampMs: number | undefined,
  config: ProtectionEngineConfig,
): { ok: true; market: MarketMicrostructureSnapshot; reason: null } | { ok: false; market: null; reason: string } {
  if (!market) {
    return { ok: false, market: null, reason: 'Missing market microstructure snapshot for TWAP unwind' };
  }

  const freshnessFailure = evaluateMarketDataFreshness(market, nowMs, lastTimestampMs, config);
  if (freshnessFailure) {
    return { ok: false, market: null, reason: freshnessFailure.reason };
  }

  if (
    !Number.isFinite(market.bookDepthUsd) ||
    !Number.isFinite(market.barVolumeUsd) ||
    market.bookDepthUsd < config.minSafeBookDepthUsd ||
    market.barVolumeUsd <= 0
  ) {
    return {
      ok: false,
      market: null,
      reason: `Orderbook depth $${market.bookDepthUsd} below safe TWAP floor $${config.minSafeBookDepthUsd}`,
    };
  }

  if (!Number.isFinite(market.spreadBps) || market.spreadBps > config.maxUnwindSpreadBps) {
    return {
      ok: false,
      market: null,
      reason: `Spread ${market.spreadBps} bps exceeds safe TWAP collar ${config.maxUnwindSpreadBps} bps`,
    };
  }

  return { ok: true, market, reason: null };
}

function buildPositionSlice(
  pos: PositionExposure,
  market: MarketMicrostructureSnapshot,
  unwindFraction: number,
  config: ProtectionEngineConfig,
): TwapSliceIntent | null {
  const targetUnwindUsd = Math.abs(pos.signedNotionalUsd) * Math.min(1, Math.max(0, unwindFraction));
  if (targetUnwindUsd < config.minSliceNotionalUsd) return null;

  const liquidityBasisUsd = Math.min(market.bookDepthUsd, market.barVolumeUsd);
  const maxSliceUsd = liquidityBasisUsd * config.maxTwapParticipationRate;
  if (maxSliceUsd < config.minSliceNotionalUsd) return null;

  const sliceNotionalUsd = Math.min(targetUnwindUsd, maxSliceUsd);
  const side: 'BUY' | 'SELL' = pos.signedNotionalUsd > 0 ? 'SELL' : 'BUY';
  const rawTouch = side === 'SELL' ? Math.max(market.midPrice, market.bestAsk) : Math.min(market.midPrice, market.bestBid);
  const safePrice = rawTouch > 0 ? rawTouch : market.midPrice;
  const sliceQuantity = sliceNotionalUsd / safePrice;
  const participationRate = sliceNotionalUsd / liquidityBasisUsd;
  const estimatedTotalSlices = Math.max(1, Math.ceil(targetUnwindUsd / sliceNotionalUsd));

  return {
    symbol: pos.symbol,
    side,
    orderType: 'LIMIT',
    reduceOnly: true,
    sliceQuantity: Number(sliceQuantity.toFixed(8)),
    sliceNotionalUsd: Number(sliceNotionalUsd.toFixed(2)),
    limitPrice: Number(safePrice.toFixed(6)),
    participationRate: Number(participationRate.toFixed(6)),
    sliceIndex: 0,
    estimatedTotalSlices,
  };
}

export function buildReduceOnlyTwapPlan(
  positions: readonly PositionExposure[],
  markets: Readonly<Record<string, MarketMicrostructureSnapshot>>,
  lastTimestamps: Readonly<Record<string, number>>,
  unwindFraction: number,
  stage: UnwindStage,
  nowMs: number,
  config: ProtectionEngineConfig,
): TwapUnwindPlan {
  const activePositions = positions.filter((p) => Math.abs(p.signedNotionalUsd) >= config.minSliceNotionalUsd);
  if (activePositions.length === 0) {
    return {
      safeToUnwind: false,
      posture: 'HALT_ONLY',
      stage,
      slices: [],
      fallbackReason: 'No open exposure requires TWAP unwind; holding HALT_ONLY',
    };
  }

  const slices: TwapSliceIntent[] = [];
  for (const pos of activePositions) {
    const safety = isBookSafeForTwap(markets[pos.symbol], nowMs, lastTimestamps[pos.symbol], config);
    if (!safety.ok) {
      return {
        safeToUnwind: false,
        posture: 'HALT_ONLY',
        stage,
        slices: [],
        fallbackReason: safety.reason,
      };
    }

    const slice = buildPositionSlice(pos, safety.market, unwindFraction, config);
    if (!slice) {
      return {
        safeToUnwind: false,
        posture: 'HALT_ONLY',
        stage,
        slices: [],
        fallbackReason: `Stressed participation cap for ${pos.symbol} below minimum executable slice`,
      };
    }
    slices.push(slice);
  }

  return {
    safeToUnwind: true,
    posture: 'REDUCE_ONLY_TWAP',
    stage,
    slices,
    fallbackReason: null,
  };
}
