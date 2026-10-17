// Step 8: Open-Core vs Cloud SaaS Runtime Edition Detector
// Ensures `git clone && npm run dev` works in zero-config single-user OSS mode
// while enabling full multi-tenant quotas and billing in Cloud SaaS mode.

import { z } from 'zod';

export const EditionModeSchema = z.enum(['OSS_LOCAL', 'CLOUD_SAAS']);
export type EditionMode = z.infer<typeof EditionModeSchema>;

export interface EditionConfig {
  readonly mode: EditionMode;
  readonly license: 'Apache-2.0' | 'CashClaw-Commercial';
  readonly singleUserLocal: boolean;
  readonly billingEnabled: boolean;
  readonly managedLlmPoolEnabled: boolean;
  readonly cloudUpgradeUrl: string;
}

export interface EditionEnvInput {
  readonly CASHCLAW_EDITION?: string;
  readonly CASHCLAW_CLOUD_URL?: string;
  readonly NOWPAYMENTS_IPN_SECRET?: string;
}

const DEFAULT_CLOUD_URL = 'https://cloud.cashclaw.io/upgrade';

export function resolveEditionConfig(env: EditionEnvInput = {}): EditionConfig {
  const rawEdition = env.CASHCLAW_EDITION?.trim().toUpperCase();
  const isCloud = rawEdition === 'CLOUD_SAAS';
  const cloudUpgradeUrl =
    env.CASHCLAW_CLOUD_URL && env.CASHCLAW_CLOUD_URL.trim().length > 0
      ? env.CASHCLAW_CLOUD_URL.trim()
      : DEFAULT_CLOUD_URL;

  if (isCloud) {
    return {
      mode: 'CLOUD_SAAS',
      license: 'CashClaw-Commercial',
      singleUserLocal: false,
      billingEnabled: true,
      managedLlmPoolEnabled: true,
      cloudUpgradeUrl,
    };
  }

  return {
    mode: 'OSS_LOCAL',
    license: 'Apache-2.0',
    singleUserLocal: true,
    billingEnabled: false,
    managedLlmPoolEnabled: false,
    cloudUpgradeUrl,
  };
}
