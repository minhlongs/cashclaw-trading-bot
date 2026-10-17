// Step 19: BYOK vs Managed Cloud Key Mode Router
// Self-hosted OSS and BASIC users supply their own API keys (BYOK);
// PREMIUM, ENTERPRISE, and MASTER users can route through CashClaw's Managed LLM Pool.

import { type Result, ok, err } from '../../lib/result';
import type { EditionMode } from '../../lib/edition/edition-mode';
import type { SaasTier } from '../tenancy/tenant-policy';
import { getEntitlementsForTier } from './tier-entitlements';

export type KeySourceMode = 'BYOK_USER_KEY' | 'MANAGED_CLOUD_POOL';

export interface KeyRoutingRequest {
  readonly edition: EditionMode;
  readonly tier: SaasTier;
  readonly requestedMode: KeySourceMode;
  readonly userProvidedApiKey?: string;
}

export interface KeyRoutingDecision {
  readonly resolvedMode: KeySourceMode;
  readonly keyIdentifier: string;
}

export function resolveLlmKeyRouting(req: KeyRoutingRequest): Result<KeyRoutingDecision> {
  if (req.requestedMode === 'BYOK_USER_KEY') {
    const trimmed = req.userProvidedApiKey?.trim() ?? '';
    if (trimmed.length < 8) {
      return err('BYOK_KEY_MISSING: Provide a valid personal LLM API key in Setup Wizard');
    }
    return ok({
      resolvedMode: 'BYOK_USER_KEY',
      keyIdentifier: `byok:${trimmed.slice(0, 4)}...`,
    });
  }

  if (req.edition === 'OSS_LOCAL') {
    return err(
      'MANAGED_POOL_UNAVAILABLE_IN_OSS: Managed LLM pool requires CashClaw Cloud SaaS (PREMIUM+)',
    );
  }

  const entitlements = getEntitlementsForTier(req.tier);
  if (!entitlements.managedLlmPoolAllowed) {
    return err(
      `TIER_UPGRADE_REQUIRED: Tier ${req.tier} does not include Managed LLM Pool. Upgrade to PREMIUM or use BYOK.`,
    );
  }

  return ok({
    resolvedMode: 'MANAGED_CLOUD_POOL',
    keyIdentifier: `cloud-pool:${req.tier.toLowerCase()}`,
  });
}
