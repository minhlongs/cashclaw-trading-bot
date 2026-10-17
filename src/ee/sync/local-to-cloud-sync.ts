// Step 20: 1-Click Local-to-Cloud Sync Bridge (CLI Export -> SaaS Import)
// Exports a sanitized, secret-free paper strategy bundle with SHA-256 integrity hash
// so local Apache-2.0 users can migrate to 24/7 Cloud SaaS in one click.

import { z } from 'zod';
import { type Result, ok, err } from '../../lib/result';

export const SyncStrategyConfigSchema = z.object({
  botName: z.string().min(1).max(80),
  symbol: z.string().min(3).max(20),
  strategyId: z.enum(['volatilityDca', 'grid', 'meanReversion']),
  intervalMinutes: z.number().int().min(1).max(1440),
  feeBps: z.number().min(0).max(500),
  slippageBps: z.number().min(0).max(500),
  parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
});

export type SyncStrategyConfig = z.infer<typeof SyncStrategyConfigSchema>;

export interface SignedCloudSyncBundle {
  readonly schemaVersion: '1.0';
  readonly safetyMode: 'PAPER_ONLY';
  readonly exportedFromEdition: 'OSS_LOCAL';
  readonly payload: SyncStrategyConfig;
  readonly sha256Checksum: string;
}

const FORBIDDEN_SECRET_KEY_PATTERN = /(secret|api_?key|token|password|private)/i;

export function stripSecretsFromParameters(
  rawParams: Record<string, number | string | boolean>,
): Record<string, number | string | boolean> {
  const clean: Record<string, number | string | boolean> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (!FORBIDDEN_SECRET_KEY_PATTERN.test(k)) {
      clean[k] = v;
    }
  }
  return clean;
}

export async function computeBundleSha256(payload: SyncStrategyConfig): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(JSON.stringify(payload)),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createLocalToCloudSyncBundle(
  rawConfig: SyncStrategyConfig,
): Promise<Result<SignedCloudSyncBundle>> {
  const sanitized: SyncStrategyConfig = {
    ...rawConfig,
    parameters: stripSecretsFromParameters(rawConfig.parameters),
  };
  const parsed = SyncStrategyConfigSchema.safeParse(sanitized);
  if (!parsed.success) {
    return err(`SYNC_EXPORT_INVALID: ${parsed.error.message}`);
  }
  const sha256Checksum = await computeBundleSha256(parsed.data);
  return ok({
    schemaVersion: '1.0',
    safetyMode: 'PAPER_ONLY',
    exportedFromEdition: 'OSS_LOCAL',
    payload: parsed.data,
    sha256Checksum,
  });
}

export async function verifyAndImportCloudSyncBundle(
  bundle: SignedCloudSyncBundle,
): Promise<Result<SyncStrategyConfig>> {
  if (bundle.safetyMode !== 'PAPER_ONLY') {
    return err('ADR_001_VIOLATION: Cloud sync only accepts PAPER_ONLY strategy bundles');
  }
  const parsed = SyncStrategyConfigSchema.safeParse(bundle.payload);
  if (!parsed.success) {
    return err(`SYNC_IMPORT_INVALID: ${parsed.error.message}`);
  }
  const expectedChecksum = await computeBundleSha256(parsed.data);
  if (expectedChecksum !== bundle.sha256Checksum) {
    return err('SYNC_CHECKSUM_MISMATCH: Bundle integrity verification failed');
  }
  return ok(parsed.data);
}
