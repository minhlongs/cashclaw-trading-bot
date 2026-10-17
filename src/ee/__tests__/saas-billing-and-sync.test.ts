import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getEntitlementsForTier } from '../billing/tier-entitlements';
import { enforceWorkspaceQuota } from '../billing/quota-guard';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
  verifyAndProcessNowPaymentsIpn,
} from '../billing/nowpayments-ipn';
import { resolveLlmKeyRouting } from '../billing/key-mode-router';
import {
  createLocalToCloudSyncBundle,
  verifyAndImportCloudSyncBundle,
} from '../sync/local-to-cloud-sync';

describe('Phase 4 (Steps 16-20): SaaS Billing, Quotas & Conversion Funnel', () => {
  it('Step 16: Defines canonical BASIC | PREMIUM | ENTERPRISE | MASTER entitlements & D1 migration', () => {
    expect(getEntitlementsForTier('BASIC').maxRunningPaperBots).toBe(1);
    expect(getEntitlementsForTier('PREMIUM').maxRunningPaperBots).toBe(5);
    expect(getEntitlementsForTier('ENTERPRISE').maxRunningPaperBots).toBe(25);
    expect(getEntitlementsForTier('MASTER').maxRunningPaperBots).toBe(100);

    const migrationSql = fs.readFileSync(
      path.resolve(__dirname, '../../../migrations/0013_saas_entitlements.sql'),
      'utf8',
    );
    expect(migrationSql).toContain("CHECK (tier IN ('BASIC', 'PREMIUM', 'ENTERPRISE', 'MASTER'))");
  });

  it('Step 17: Enforces workspace quotas and returns upgrade URL on overflow', () => {
    const blocked = enforceWorkspaceQuota({
      tier: 'BASIC',
      activeRunningBots: 1,
      requestedWalkForwardWindows: 4,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toContain('QUOTA_EXCEEDED');
      expect(blocked.error).toContain('https://cloud.cashclaw.io/billing/upgrade');
    }

    const allowed = enforceWorkspaceQuota({
      tier: 'PREMIUM',
      activeRunningBots: 2,
      requestedWalkForwardWindows: 8,
    });
    expect(allowed.ok).toBe(true);
  });

  it('Step 18: Verifies NOWPayments IPN HMAC-SHA512 signature and activates tier idempotently', async () => {
    const secret = 'ipn_secret_test_key';
    const payload = {
      payment_id: 'np_998877',
      payment_status: 'finished',
      order_id: 'ord_1',
      workspace_id: 'ws_pro',
      target_tier: 'PREMIUM',
      pay_amount: 29,
      pay_currency: 'usdttrc20',
    };

    const canonical = canonicalizeNowPaymentsJson(payload);
    const sig = await computeNowPaymentsHmacSha512(canonical, secret);
    const ledger = new Set<string>();

    const first = await verifyAndProcessNowPaymentsIpn(payload, sig, secret, ledger);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.data.activated).toBe(true);
      expect(first.data.newTier).toBe('PREMIUM');
      expect(first.data.idempotentReplay).toBe(false);
    }

    const replay = await verifyAndProcessNowPaymentsIpn(payload, sig, secret, ledger);
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.data.activated).toBe(false);
      expect(replay.data.idempotentReplay).toBe(true);
    }
  });

  it('Step 19: Routes BYOK vs Managed Cloud LLM Pool according to edition and tier', () => {
    const ossPoolDenied = resolveLlmKeyRouting({
      edition: 'OSS_LOCAL',
      tier: 'BASIC',
      requestedMode: 'MANAGED_CLOUD_POOL',
    });
    expect(ossPoolDenied.ok).toBe(false);

    const cloudPremiumPool = resolveLlmKeyRouting({
      edition: 'CLOUD_SAAS',
      tier: 'PREMIUM',
      requestedMode: 'MANAGED_CLOUD_POOL',
    });
    expect(cloudPremiumPool.ok).toBe(true);
  });

  it('Step 20: Strips secrets and verifies SHA-256 checksum on 1-click Local-to-Cloud sync bundle', async () => {
    const exported = await createLocalToCloudSyncBundle({
      botName: 'BTC Vol-DCA Paper',
      symbol: 'BTCUSDT',
      strategyId: 'volatilityDca',
      intervalMinutes: 60,
      feeBps: 10,
      slippageBps: 5,
      parameters: {
        baseOrderUsd: 100,
        lookbackBars: 20,
        binanceApiKey: 'SHOULD_BE_STRIPPED',
      },
    });

    expect(exported.ok).toBe(true);
    if (exported.ok) {
      expect(exported.data.payload.parameters).not.toHaveProperty('binanceApiKey');
      const imported = await verifyAndImportCloudSyncBundle(exported.data);
      expect(imported.ok).toBe(true);
    }
  });
});
