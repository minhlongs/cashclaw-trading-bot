// Step 24: Anonymous Opt-In CLI Telemetry & OSS-to-SaaS Conversion Funnel Tracker
// Privacy-first: disabled by default in OSS_LOCAL unless explicitly opted in,
// never accepts or transmits PII/secrets, and tracks conversion stages deterministically.

import { z } from 'zod';
import { type Result, ok, err } from '../../lib/result';
import type { SaasTier } from '../tenancy/tenant-policy';

export const FunnelStageSchema = z.enum([
  'OSS_CLI_QUICKSTART_RUN',
  'SYNC_BUNDLE_EXPORTED',
  'CLOUD_BUNDLE_IMPORTED',
  'QUOTA_WALL_HIT',
  'NOWPAYMENTS_TIER_UPGRADED',
]);

export type FunnelStage = z.infer<typeof FunnelStageSchema>;

export const FunnelEventSchema = z.object({
  anonymousInstallId: z.string().min(6).max(64),
  stage: FunnelStageSchema,
  timestampMs: z.number().int().positive(),
  targetTier: z.enum(['BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER']).optional(),
  strategyId: z.enum(['volatilityDca', 'grid', 'meanReversion']).optional(),
});

export type FunnelEvent = z.infer<typeof FunnelEventSchema>;

export interface FunnelConversionSummary {
  readonly totalInstalls: number;
  readonly exportedSyncBundles: number;
  readonly importedToCloud: number;
  readonly upgradedPaidWorkspaces: number;
  readonly cliToCloudRate: number;
  readonly cloudToPaidRate: number;
}

export function recordOptInFunnelEvent(
  telemetryOptIn: boolean,
  rawEvent: FunnelEvent,
  sink: FunnelEvent[],
): Result<{ readonly recorded: boolean }> {
  if (!telemetryOptIn) {
    return ok({ recorded: false });
  }
  const parsed = FunnelEventSchema.safeParse(rawEvent);
  if (!parsed.success) {
    return err(`TELEMETRY_EVENT_INVALID: ${parsed.error.message}`);
  }
  sink.push(parsed.data);
  return ok({ recorded: true });
}

export function summarizeConversionFunnel(events: readonly FunnelEvent[]): FunnelConversionSummary {
  const byStage = (stage: FunnelStage): Set<string> =>
    new Set(events.filter((e) => e.stage === stage).map((e) => e.anonymousInstallId));

  const cliUsers = byStage('OSS_CLI_QUICKSTART_RUN');
  const exported = byStage('SYNC_BUNDLE_EXPORTED');
  const imported = byStage('CLOUD_BUNDLE_IMPORTED');
  const upgraded = byStage('NOWPAYMENTS_TIER_UPGRADED');

  const totalInstalls = cliUsers.size;
  const exportedSyncBundles = exported.size;
  const importedToCloud = imported.size;
  const upgradedPaidWorkspaces = upgraded.size;

  return {
    totalInstalls,
    exportedSyncBundles,
    importedToCloud,
    upgradedPaidWorkspaces,
    cliToCloudRate: totalInstalls === 0 ? 0 : Number((importedToCloud / totalInstalls).toFixed(4)),
    cloudToPaidRate:
      importedToCloud === 0 ? 0 : Number((upgradedPaidWorkspaces / importedToCloud).toFixed(4)),
  };
}

export function recommendUpgradeTierForQuotaHit(currentTier: SaasTier): SaasTier {
  if (currentTier === 'BASIC') return 'PREMIUM';
  if (currentTier === 'PREMIUM') return 'ENTERPRISE';
  return 'MASTER';
}
