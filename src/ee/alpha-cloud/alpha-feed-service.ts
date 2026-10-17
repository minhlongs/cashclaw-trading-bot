// Step 14: Managed Alpha Zoo Pre-Computed IC/IR Feed Service
// Open-source users get the raw Alpha Zoo engine; Cloud SaaS users get daily
// pre-computed IC/IR survival leaderboards across multi-pair universes.

import type { SaasTier } from '../tenancy/tenant-policy';

export interface CloudAlphaFeedItem {
  readonly alphaId: string;
  readonly formulaCanonical: string;
  readonly rankIcMean: number;
  readonly rankIr: number;
  readonly turnoverDaily: number;
  readonly walkForwardSurvived: boolean;
  readonly minTier: SaasTier;
  readonly safetyMode: 'PAPER_ADVISORY_ONLY';
}

const TIER_RANK: Readonly<Record<SaasTier, number>> = {
  BASIC: 1,
  PREMIUM: 2,
  ENTERPRISE: 3,
  MASTER: 4,
};

export const CURATED_CLOUD_ALPHA_FEED: readonly CloudAlphaFeedItem[] = [
  {
    alphaId: 'alpha_cs_reversal_v1',
    formulaCanonical: 'rank(delta(close, 5))',
    rankIcMean: 0.042,
    rankIr: 1.38,
    turnoverDaily: 0.24,
    walkForwardSurvived: true,
    minTier: 'BASIC',
    safetyMode: 'PAPER_ADVISORY_ONLY',
  },
  {
    alphaId: 'alpha_vol_adjusted_mom_v2',
    formulaCanonical: 'safe_div(delta(close, 10), ts_std(close, 10))',
    rankIcMean: 0.068,
    rankIr: 1.94,
    turnoverDaily: 0.18,
    walkForwardSurvived: true,
    minTier: 'PREMIUM',
    safetyMode: 'PAPER_ADVISORY_ONLY',
  },
  {
    alphaId: 'alpha_microstructure_vwap_v3',
    formulaCanonical: 'zscore(safe_div(sub(close, vwap), vwap))',
    rankIcMean: 0.089,
    rankIr: 2.41,
    turnoverDaily: 0.15,
    walkForwardSurvived: true,
    minTier: 'ENTERPRISE',
    safetyMode: 'PAPER_ADVISORY_ONLY',
  },
] as const;

export function getCloudAlphaFeedForTier(
  tier: SaasTier,
  catalog: readonly CloudAlphaFeedItem[] = CURATED_CLOUD_ALPHA_FEED,
): readonly CloudAlphaFeedItem[] {
  const callerRank = TIER_RANK[tier];
  return catalog.filter(
    (item) => item.walkForwardSurvived && callerRank >= TIER_RANK[item.minTier],
  );
}
