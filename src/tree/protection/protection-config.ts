/**
 * Institutional fail-closed threshold defaults and ceiling normalizer.
 * Hard risk ceilings (leverage, beta, participation rate, override TTL) are clamped
 * so caller misconfiguration cannot weaken survival invariants.
 */

import type { ProtectionEngineConfig } from './protection-types';

export const DEFAULT_PROTECTION_CONFIG: ProtectionEngineConfig = {
  maxSingleOrderNotionalPct: 0.10,
  maxClockSkewMs: 5_000,
  maxStrategyDrawdownPct: 0.04,
  maxStrategyLossStreak: 3,
  strategyCooldownMs: 1_800_000,
  maxSingleAssetWeightPct: 0.25,
  marketNeutralMode: true,
  maxNeutralBtcBeta: 0.50,
  maxDirectionalBtcBeta: 1.00,
  maxGrossLeverage: 1.50,
  maxRolling24hLossPct: 0.025,
  softDrawdownPct: 0.08,
  hardDrawdownPct: 0.12,
  volShockSigmaThreshold: 4.0,
  jumpOrSpreadShockBps: 150,
  limitCollarBps: 100,
  maxExchangeErrorStrikes: 3,
  maxMarketDataAgeMs: 15_000,
  slippageAnomalyMultiplier: 2.5,
  slippageAnomalyStreakThreshold: 3,
  symbolQuarantineMs: 900_000,
  maxPendingAckMs: 5_000,
  maxOwnerOverrideTtlMs: 3_600_000,
  ledgerToleranceMicroUsd: 10_000,
  maxTwapParticipationRate: 0.01,
  minSafeBookDepthUsd: 10_000,
  maxUnwindSpreadBps: 250,
  minSliceNotionalUsd: 25,
  maxVenueDislocationBps: 200,
  stablecoinPegLower: 0.985,
  stablecoinPegUpper: 1.015,
  depegStressHaircut: 0.85,
  minLiquidationBufferPct: 0.35,
  oiCascadeDropThresholdPct: -0.20,
};

export function resolveProtectionConfig(
  overrides: Partial<ProtectionEngineConfig> = {},
): ProtectionEngineConfig {
  const merged: ProtectionEngineConfig = {
    ...DEFAULT_PROTECTION_CONFIG,
    ...overrides,
  };

  return {
    ...merged,
    maxSingleOrderNotionalPct: Math.min(0.25, Math.max(0.001, merged.maxSingleOrderNotionalPct)),
    maxSingleAssetWeightPct: Math.min(0.25, Math.max(0.01, merged.maxSingleAssetWeightPct)),
    maxNeutralBtcBeta: Math.min(0.50, Math.max(0.01, merged.maxNeutralBtcBeta)),
    maxDirectionalBtcBeta: Math.min(1.00, Math.max(0.05, merged.maxDirectionalBtcBeta)),
    maxGrossLeverage: Math.min(1.50, Math.max(0.10, merged.maxGrossLeverage)),
    maxOwnerOverrideTtlMs: Math.min(3_600_000, Math.max(1_000, merged.maxOwnerOverrideTtlMs)),
    ledgerToleranceMicroUsd: Math.min(10_000, Math.max(0, Math.trunc(merged.ledgerToleranceMicroUsd))),
    maxTwapParticipationRate: Math.min(0.01, Math.max(0.0005, merged.maxTwapParticipationRate)),
  };
}
