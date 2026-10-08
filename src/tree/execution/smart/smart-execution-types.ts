// Smart Execution Contracts — TWAP, VWAP, Microstructure Urgency Guard & SOR
import type { ExchangeId } from '../../exchange/types';

export type UrgencyMode = 'AGGRESSIVE_TAKER' | 'PASSIVE_POST_ONLY' | 'PAUSED_COOLDOWN';

export interface SlicedOrderChunk {
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly targetQuantity: number;
  readonly scheduledDelayMs: number;
  readonly executionUrgency: UrgencyMode;
}

export interface TwapSlicingConfig {
  readonly totalQuantity: number;
  readonly durationMinutes: number;
  readonly sliceCount: number;
  readonly jitterRatio?: number; // e.g. 0.20 for ±20% jitter
}

export interface VwapVolumeBucket {
  readonly hourUtc: number; // 0..23
  readonly relativeVolumeWeight: number; // sum to 1.0
}

export interface VenueLiquidityProfile {
  readonly exchange: ExchangeId;
  readonly topAskPrice: number;
  readonly topBidPrice: number;
  readonly depthSize: number;
  readonly takerFeeBps: number;
  readonly makerFeeBps: number;
}

export interface SorAllocation {
  readonly exchange: ExchangeId;
  readonly allocatedQuantity: number;
  readonly expectedEffectivePrice: number;
  readonly expectedFeeUsd: number;
}
