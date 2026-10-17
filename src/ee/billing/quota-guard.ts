// Step 17: Quota & Concurrency Enforcement Middleware
// Returns structured QUOTA_EXCEEDED errors with upgradeUrl when Cloud SaaS limits are reached.

import { type Result, ok, err } from '../../lib/result';
import type { SaasTier } from '../tenancy/tenant-policy';
import { getEntitlementsForTier } from './tier-entitlements';

export interface QuotaCheckInput {
  readonly tier: SaasTier;
  readonly activeRunningBots: number;
  readonly requestedWalkForwardWindows: number;
  readonly upgradeBaseUrl?: string;
}

export interface QuotaApproved {
  readonly allowed: true;
  readonly tier: SaasTier;
  readonly remainingBotSlots: number;
}

export function enforceWorkspaceQuota(input: QuotaCheckInput): Result<QuotaApproved> {
  const spec = getEntitlementsForTier(input.tier);
  const upgradeUrl = input.upgradeBaseUrl ?? 'https://cloud.cashclaw.io/billing/upgrade';

  if (input.activeRunningBots >= spec.maxRunningPaperBots) {
    return err(
      `QUOTA_EXCEEDED: Tier ${input.tier} allows max ${spec.maxRunningPaperBots} running 24/7 paper bots (current: ${input.activeRunningBots}). Upgrade at ${upgradeUrl}`,
    );
  }

  if (input.requestedWalkForwardWindows > spec.maxWalkForwardWindows) {
    return err(
      `QUOTA_EXCEEDED: Tier ${input.tier} allows max ${spec.maxWalkForwardWindows} walk-forward windows (requested: ${input.requestedWalkForwardWindows}). Upgrade at ${upgradeUrl}`,
    );
  }

  return ok({
    allowed: true,
    tier: input.tier,
    remainingBotSlots: spec.maxRunningPaperBots - input.activeRunningBots - 1,
  });
}
