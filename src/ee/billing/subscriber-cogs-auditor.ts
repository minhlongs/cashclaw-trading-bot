// Gate G14: Per-Subscriber Monthly COGS & Gross Margin Floor Calculator
// Evaluates Cloudflare Workers Paid CPU/requests, Durable Object SQLite duration/storage,
// D1 rows read/written, R2 OHLCV cache, payment gateway fee, and Managed LLM FAST/REASONING
// credit cap costs across BASIC ($0), PREMIUM ($29), ENTERPRISE ($99), and MASTER ($299)
// under BEAR, BASE, and BULL (100% hard-cap exhaustion) utilization scenarios.

import type { SaasTier } from '../tenancy/tenant-policy';
import { getEntitlementsForTier } from './tier-entitlements';

export type UtilizationScenario = 'BEAR' | 'BASE' | 'BULL';

export interface SubscriberCogsBreakdown {
  readonly scenario: UtilizationScenario;
  readonly botUtilizationRatio: number;
  readonly creditUtilizationRatio: number;
  readonly monthlyBotTicks: number;
  readonly monthlyWalkForwardRuns: number;
  readonly consumedLlmCredits: number;
  readonly workersCpuAndRequestsUsd: number;
  readonly durableObjectsSqliteUsd: number;
  readonly d1DatabaseReadWriteUsd: number;
  readonly r2ArtifactCacheUsd: number;
  readonly managedLlmCreditsUsd: number;
  readonly paymentGatewayFeeUsd: number;
  readonly totalCogsUsd: number;
  readonly grossMarginUsd: number;
  readonly grossMarginPct: number;
  readonly nonNegativePaidMargin: boolean;
}

export interface TierUnitEconomicsAudit {
  readonly tier: SaasTier;
  readonly priceUsdMonthly: number;
  readonly maxRunningPaperBots: number;
  readonly minCronIntervalMinutes: number;
  readonly monthlyLlmCreditCap: number;
  readonly managedLlmPoolAllowed: boolean;
  readonly scenarios: Readonly<Record<UtilizationScenario, SubscriberCogsBreakdown>>;
  readonly worstCaseGrossMarginUsd: number;
  readonly worstCaseGrossMarginPct: number;
  readonly marginFloorProtected: boolean;
}

export interface FleetSubscriberCogsReport {
  readonly generatedStandard: 'G14_SUBSCRIBER_COGS_V1';
  readonly tiers: Readonly<Record<SaasTier, TierUnitEconomicsAudit>>;
  readonly allPaidTiersPositiveAtFullExhaustion: boolean;
}

interface ScenarioProfile {
  readonly botRatio: number;
  readonly wfRunsPerMonth: number;
  readonly creditRatio: number;
  readonly fastShare: number;
  readonly writeRowsPerTick: number;
}

const MINUTES_PER_MONTH = 43_830; // 365.25 / 12 * 1440
const FAST_CREDIT_WHOLESALE_USD = 0.00035; // 1 credit = 1k FAST tokens (~$0.35 / 1M tokens)
const REASONING_CREDIT_WHOLESALE_USD = 0.0006; // 1 credit = 250 REASONING tokens (~$2.40 / 1M tokens)
const NOWPAYMENTS_MERCHANT_FEE_RATE = 0.005; // 0.5% non-custodial gateway settlement fee

const SCENARIO_PROFILES: Readonly<Record<UtilizationScenario, ScenarioProfile>> = {
  BEAR: { botRatio: 0.2, wfRunsPerMonth: 2, creditRatio: 0.15, fastShare: 0.8, writeRowsPerTick: 0.25 },
  BASE: { botRatio: 0.55, wfRunsPerMonth: 6, creditRatio: 0.5, fastShare: 0.7, writeRowsPerTick: 0.5 },
  BULL: { botRatio: 1.0, wfRunsPerMonth: 16, creditRatio: 1.0, fastShare: 0.0, writeRowsPerTick: 1.2 },
};

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function computeScenarioCogs(tier: SaasTier, scenario: UtilizationScenario): SubscriberCogsBreakdown {
  const spec = getEntitlementsForTier(tier);
  const profile = SCENARIO_PROFILES[scenario];

  const activeBots = spec.maxRunningPaperBots * profile.botRatio;
  const ticksPerBot = Math.floor(MINUTES_PER_MONTH / spec.minDurableCronIntervalMinutes);
  const monthlyBotTicks = Math.round(activeBots * ticksPerBot);
  const dashboardRequests = Math.round(2_500 * (0.4 + profile.botRatio));
  const totalWorkerRequests = monthlyBotTicks + dashboardRequests;
  const totalCpuMs = monthlyBotTicks * 4.5 + profile.wfRunsPerMonth * spec.maxWalkForwardWindows * 35;

  // Cloudflare Workers Paid: $0.30 / 1M requests + $0.02 / 1M CPU-ms
  const workersCpuAndRequestsUsd = round4(
    (totalWorkerRequests / 1_000_000) * 0.3 + (totalCpuMs / 1_000_000) * 0.02,
  );

  // Durable Objects SQLite: $0.15 / 1M lease requests + $12.50 / 1M GB-s (0.125 GB * 0.008s/tick) + storage
  const doGbSeconds = monthlyBotTicks * 0.125 * 0.008;
  const doStorageGb = 0.005 * Math.max(1, activeBots);
  const durableObjectsSqliteUsd = round4(
    (monthlyBotTicks / 1_000_000) * 0.15 + (doGbSeconds / 1_000_000) * 12.5 + doStorageGb * 0.2,
  );

  // Cloudflare D1: $0.001 / 1M rows read + $1.00 / 1M rows written + $0.75 / GB-mo storage
  const d1RowsRead = monthlyBotTicks * 18 + profile.wfRunsPerMonth * spec.maxWalkForwardWindows * 500;
  const d1RowsWritten =
    monthlyBotTicks * profile.writeRowsPerTick + profile.wfRunsPerMonth * spec.maxWalkForwardWindows * 12;
  const d1StorageGb = 0.002 * Math.max(1, activeBots);
  const d1DatabaseReadWriteUsd = round4(
    (d1RowsRead / 1_000_000) * 0.001 + (d1RowsWritten / 1_000_000) * 1.0 + d1StorageGb * 0.75,
  );

  // Cloudflare R2 OHLCV & snapshot cache: $0.015 / GB-mo + Class A ($4.50/1M) + Class B ($0.36/1M)
  const r2StorageGb = 0.05 + 0.01 * activeBots;
  const r2ClassAOps = profile.wfRunsPerMonth * 20;
  const r2ClassBOps = monthlyBotTicks * 0.1 + profile.wfRunsPerMonth * 200;
  const r2ArtifactCacheUsd = round4(
    r2StorageGb * 0.015 + (r2ClassAOps / 1_000_000) * 4.5 + (r2ClassBOps / 1_000_000) * 0.36,
  );

  // Managed LLM Credits: strictly 0 when managedLlmPoolAllowed === false (BASIC tier is BYOK/LOCAL only)
  const consumedLlmCredits = spec.managedLlmPoolAllowed
    ? Math.round(spec.monthlyLlmCredits * profile.creditRatio)
    : 0;
  const blendedCreditCost =
    profile.fastShare * FAST_CREDIT_WHOLESALE_USD +
    (1 - profile.fastShare) * REASONING_CREDIT_WHOLESALE_USD;
  const managedLlmCreditsUsd = round4(consumedLlmCredits * blendedCreditCost);

  const paymentGatewayFeeUsd =
    spec.priceUsdMonthly > 0 ? round4(spec.priceUsdMonthly * NOWPAYMENTS_MERCHANT_FEE_RATE) : 0;

  const totalCogsUsd = round4(
    workersCpuAndRequestsUsd +
      durableObjectsSqliteUsd +
      d1DatabaseReadWriteUsd +
      r2ArtifactCacheUsd +
      managedLlmCreditsUsd +
      paymentGatewayFeeUsd,
  );
  const grossMarginUsd = round4(spec.priceUsdMonthly - totalCogsUsd);
  const grossMarginPct =
    spec.priceUsdMonthly > 0 ? round2((grossMarginUsd / spec.priceUsdMonthly) * 100) : 0;

  return {
    scenario,
    botUtilizationRatio: profile.botRatio,
    creditUtilizationRatio: spec.managedLlmPoolAllowed ? profile.creditRatio : 0,
    monthlyBotTicks,
    monthlyWalkForwardRuns: profile.wfRunsPerMonth,
    consumedLlmCredits,
    workersCpuAndRequestsUsd,
    durableObjectsSqliteUsd,
    d1DatabaseReadWriteUsd,
    r2ArtifactCacheUsd,
    managedLlmCreditsUsd,
    paymentGatewayFeeUsd,
    totalCogsUsd,
    grossMarginUsd,
    grossMarginPct,
    nonNegativePaidMargin: spec.priceUsdMonthly > 0 ? grossMarginUsd > 0 : totalCogsUsd < 0.05,
  };
}

export function auditTierSubscriberCogs(tier: SaasTier): TierUnitEconomicsAudit {
  const spec = getEntitlementsForTier(tier);
  const bear = computeScenarioCogs(tier, 'BEAR');
  const base = computeScenarioCogs(tier, 'BASE');
  const bull = computeScenarioCogs(tier, 'BULL');

  return {
    tier,
    priceUsdMonthly: spec.priceUsdMonthly,
    maxRunningPaperBots: spec.maxRunningPaperBots,
    minCronIntervalMinutes: spec.minDurableCronIntervalMinutes,
    monthlyLlmCreditCap: spec.monthlyLlmCredits,
    managedLlmPoolAllowed: spec.managedLlmPoolAllowed,
    scenarios: { BEAR: bear, BASE: base, BULL: bull },
    worstCaseGrossMarginUsd: bull.grossMarginUsd,
    worstCaseGrossMarginPct: bull.grossMarginPct,
    marginFloorProtected: bull.nonNegativePaidMargin,
  };
}

export function auditAllTiersSubscriberCogs(): FleetSubscriberCogsReport {
  const tiers: Record<SaasTier, TierUnitEconomicsAudit> = {
    BASIC: auditTierSubscriberCogs('BASIC'),
    PREMIUM: auditTierSubscriberCogs('PREMIUM'),
    ENTERPRISE: auditTierSubscriberCogs('ENTERPRISE'),
    MASTER: auditTierSubscriberCogs('MASTER'),
  };

  const paidTiers: readonly SaasTier[] = ['PREMIUM', 'ENTERPRISE', 'MASTER'];
  const allPaidTiersPositiveAtFullExhaustion = paidTiers.every(
    (tier) => tiers[tier].scenarios.BULL.grossMarginUsd > 0,
  );

  return {
    generatedStandard: 'G14_SUBSCRIBER_COGS_V1',
    tiers,
    allPaidTiersPositiveAtFullExhaustion,
  };
}
