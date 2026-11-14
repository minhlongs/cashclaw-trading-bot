/**
 * Deterministic fail-closed capital protection contracts.
 * Pure domain types positioned strictly ahead of order matching and venue dispatch.
 */

export type ProtectionPosture = 'PASS' | 'HALT_ONLY' | 'REDUCE_ONLY_TWAP';

export type ProtectionActionCode =
  | 'ALLOW'
  | 'REJECT_PRETRADE'
  | 'STRATEGY_COOLDOWN'
  | 'EMERGENCY_HALT'
  | 'CONTROLLED_LIQUIDATION'
  | 'MARKET_ORDER_BAN'
  | 'DEGRADED_HALT'
  | 'STALE_DATA_FAIL_CLOSED'
  | 'ILLIQUID_QUARANTINE'
  | 'RECONCILING'
  | 'GLOBAL_KILL_SWITCH'
  | 'QUARANTINED_SAFE_MODE'
  | 'SEV1_VENUE_DISLOCATION'
  | 'COLLATERAL_DEPEG';

export type GlobalKillSwitchMode = 'HALT_ONLY' | 'REDUCE_ONLY_TWAP';

export type UnwindStage = 'NONE' | 'SOFT_50_PCT' | 'HARD_100_PCT' | 'BUFFER_DEFENSE' | 'KILL_SWITCH_UNWIND';

export interface LedgerSnapshot {
  readonly assetsUsd?: number;
  readonly liabilitiesUsd?: number;
  readonly equityUsd?: number;
  readonly assetsMicroUsd?: number;
  readonly liabilitiesMicroUsd?: number;
  readonly equityMicroUsd?: number;
}

export interface OwnerOverrideToken {
  readonly ownerId: string;
  readonly reason: string;
  readonly signatureToken: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

export interface PositionExposure {
  readonly symbol: string;
  readonly signedNotionalUsd: number;
  readonly entryPrice: number;
  readonly markPrice: number;
  readonly betaToBtc: number;
  readonly maintenanceMarginRate?: number;
  readonly simulatedLiqPrice?: number;
}

export interface MarketMicrostructureSnapshot {
  readonly symbol: string;
  readonly timestampMs: number;
  readonly midPrice: number;
  readonly bestBid: number;
  readonly bestAsk: number;
  readonly spreadBps: number;
  readonly bookDepthUsd: number;
  readonly barVolumeUsd: number;
  readonly barReturnSigma: number;
  readonly jumpShockBps: number;
  readonly oiChangePct?: number;
}

export interface VenuePriceSample {
  readonly symbol: string;
  readonly venueA: string;
  readonly venueAPrice: number;
  readonly venueB: string;
  readonly venueBPrice: number;
}

export interface CollateralPriceSample {
  readonly asset: string;
  readonly priceUsd: number;
  readonly nominalAmount: number;
}

export interface PreTradeOrderCandidate {
  readonly orderId: string;
  readonly botId: string;
  readonly strategyId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly orderType: 'MARKET' | 'LIMIT';
  readonly price: number;
  readonly quantity: number;
  readonly reduceOnly: boolean;
  readonly timestampMs: number;
  readonly betaToBtc?: number;
}

export interface TwapSliceIntent {
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly orderType: 'LIMIT';
  readonly reduceOnly: true;
  readonly sliceQuantity: number;
  readonly sliceNotionalUsd: number;
  readonly limitPrice: number;
  readonly participationRate: number;
  readonly sliceIndex: number;
  readonly estimatedTotalSlices: number;
}

export interface PendingOrderFenceEntry {
  readonly intentId: string;
  readonly botId: string;
  readonly symbol: string;
  readonly dispatchedAtMs: number;
  readonly status: 'PENDING_INTENT' | 'IN_FLIGHT';
}

export interface ProtectionTickContext {
  readonly nowMs: number;
  readonly equityUsd: number;
  readonly peakEquityUsd: number;
  readonly rolling24hPnlUsd: number;
  readonly rolling24hRefEquityUsd: number;
  readonly positions: readonly PositionExposure[];
  readonly markets: Readonly<Record<string, MarketMicrostructureSnapshot>>;
  readonly ledger?: LedgerSnapshot;
  readonly venuePrices?: readonly VenuePriceSample[];
  readonly collateralSamples?: readonly CollateralPriceSample[];
  readonly ownerOverride?: OwnerOverrideToken;
}

export interface ProtectionDecision {
  readonly allowed: boolean;
  readonly action: ProtectionActionCode;
  readonly posture: ProtectionPosture;
  readonly controlId: number;
  readonly reason: string;
  readonly cancelRestingRiskIncreasingQuotes: boolean;
  readonly blindMarketLiquidationOrders: 0;
  readonly unwindStage: UnwindStage;
  readonly unwindSlices: readonly TwapSliceIntent[];
  readonly effectiveCollateralUsd?: number;
  readonly auditOverrideApplied: boolean;
  readonly overrideOwnerId?: string;
}

export interface ProtectionEngineConfig {
  readonly maxSingleOrderNotionalPct: number;
  readonly maxClockSkewMs: number;
  readonly maxStrategyDrawdownPct: number;
  readonly maxStrategyLossStreak: number;
  readonly strategyCooldownMs: number;
  readonly maxSingleAssetWeightPct: number;
  readonly marketNeutralMode: boolean;
  readonly maxNeutralBtcBeta: number;
  readonly maxDirectionalBtcBeta: number;
  readonly maxGrossLeverage: number;
  readonly maxRolling24hLossPct: number;
  readonly softDrawdownPct: number;
  readonly hardDrawdownPct: number;
  readonly volShockSigmaThreshold: number;
  readonly jumpOrSpreadShockBps: number;
  readonly limitCollarBps: number;
  readonly maxExchangeErrorStrikes: number;
  readonly maxMarketDataAgeMs: number;
  readonly slippageAnomalyMultiplier: number;
  readonly slippageAnomalyStreakThreshold: number;
  readonly symbolQuarantineMs: number;
  readonly maxPendingAckMs: number;
  readonly maxOwnerOverrideTtlMs: number;
  readonly ledgerToleranceMicroUsd: number;
  readonly maxTwapParticipationRate: number;
  readonly minSafeBookDepthUsd: number;
  readonly maxUnwindSpreadBps: number;
  readonly minSliceNotionalUsd: number;
  readonly maxVenueDislocationBps: number;
  readonly stablecoinPegLower: number;
  readonly stablecoinPegUpper: number;
  readonly depegStressHaircut: number;
  readonly minLiquidationBufferPct: number;
  readonly oiCascadeDropThresholdPct: number;
}
