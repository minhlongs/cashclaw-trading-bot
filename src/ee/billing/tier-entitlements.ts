// Step 16: Canonical 4-Tier SaaS Entitlements Matrix (BASIC | PREMIUM | ENTERPRISE | MASTER)
// Strictly uppercase tier enum per Sophia/CashClaw project standards.

import type { SaasTier } from '../tenancy/tenant-policy';

export interface TierEntitlementSpec {
  readonly tier: SaasTier;
  readonly priceUsdMonthly: number;
  readonly maxRunningPaperBots: number;
  readonly maxWalkForwardWindows: number;
  readonly monthlyLlmCredits: number;
  readonly managedLlmPoolAllowed: boolean;
  readonly customWebhookAlertsAllowed: boolean;
}

export const SAAS_TIER_ENTITLEMENTS: Readonly<Record<SaasTier, TierEntitlementSpec>> = {
  BASIC: {
    tier: 'BASIC',
    priceUsdMonthly: 0,
    maxRunningPaperBots: 1,
    maxWalkForwardWindows: 4,
    monthlyLlmCredits: 1_000,
    managedLlmPoolAllowed: false,
    customWebhookAlertsAllowed: false,
  },
  PREMIUM: {
    tier: 'PREMIUM',
    priceUsdMonthly: 29,
    maxRunningPaperBots: 5,
    maxWalkForwardWindows: 16,
    monthlyLlmCredits: 10_000,
    managedLlmPoolAllowed: true,
    customWebhookAlertsAllowed: true,
  },
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    priceUsdMonthly: 99,
    maxRunningPaperBots: 25,
    maxWalkForwardWindows: 64,
    monthlyLlmCredits: 50_000,
    managedLlmPoolAllowed: true,
    customWebhookAlertsAllowed: true,
  },
  MASTER: {
    tier: 'MASTER',
    priceUsdMonthly: 299,
    maxRunningPaperBots: 100,
    maxWalkForwardWindows: 256,
    monthlyLlmCredits: 250_000,
    managedLlmPoolAllowed: true,
    customWebhookAlertsAllowed: true,
  },
};

export function getEntitlementsForTier(tier: SaasTier): TierEntitlementSpec {
  return SAAS_TIER_ENTITLEMENTS[tier];
}
