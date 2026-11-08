import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as getQuotas } from '../quotas/route';
import { POST as postIpn } from '../billing/ipn/route';
import { POST as postNowPaymentsIpn } from '../billing/nowpayments-ipn/route';
import { POST as postSync } from '../sync/route';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '@/ee/billing/nowpayments-ipn';
import { createLocalToCloudSyncBundle } from '@/ee/sync/local-to-cloud-sync';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import { defaultCheckoutOrderStore } from '@/ee/billing/checkout-order-store';

const mockBotListHandler = vi.fn();
const mockBotCreateHandler = vi.fn();
vi.mock('@/forest/api/routes', () => ({
  botListHandler: (...args: unknown[]) => mockBotListHandler(...args),
  botCreateHandler: (...args: unknown[]) => mockBotCreateHandler(...args),
}));

/** Seeds a workspace tier through the production path — a verified IPN upgrade. */
async function seedWorkspaceTier(workspaceId: string, targetTier: 'BASIC' | 'PREMIUM' | 'ENTERPRISE' | 'MASTER') {
  await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
    paymentId: `pay_seed_${workspaceId}`,
    workspaceId,
    targetTier,
    paymentStatus: 'finished',
    payAmount: 29,
    payCurrency: 'USDT',
  });
}

describe('Phase 1: SaaS API Routes Integration', () => {
  beforeEach(() => {
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
    vi.clearAllMocks();
    mockBotListHandler.mockResolvedValue({ ok: true, data: [] });
    mockBotCreateHandler.mockResolvedValue({ ok: true, data: { id: 'sync_test_01' } });
    // Production has no default IPN secret, so the test names one explicitly.
    vi.stubEnv('NOWPAYMENTS_IPN_SECRET', 'ee-routes-ipn-secret');
    defaultCheckoutOrderStore.resetMemoryForTesting();
  });

  describe('GET /api/ee/quotas', () => {
    it('returns workspace entitlements for default BASIC tier', async () => {
      const req = new Request('http://localhost/api/ee/quotas');
      const res = await getQuotas(req);
      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.tier).toBe('BASIC');
      expect((body.entitlements as Record<string, unknown>).maxRunningPaperBots).toBe(1);
    });

    it('ignores a self-declared tier query parameter and returns the D1 tier', async () => {
      await seedWorkspaceTier('ws_quota_ignored', 'PREMIUM');

      const req = new Request('http://localhost/api/ee/quotas?workspaceId=ws_quota_ignored&tier=BASIC');
      const res = await getQuotas(req);
      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.tier).toBe('PREMIUM');
      expect((body.entitlements as Record<string, unknown>).maxRunningPaperBots).toBe(5);
    });

    it('resolves upgraded tier from entitlement store via x-cashclaw-workspace header', async () => {
      const secret = 'ee-routes-ipn-secret';
      // The checkout the server issued: only this record says what was bought.
      await defaultCheckoutOrderStore.recordOrder({
        orderId: 'order_ent_quota_01',
        workspaceId: 'ws_quota_upgraded_01',
        targetTier: 'ENTERPRISE',
        expectedAmountUsd: 149,
        payCurrency: 'USDT',
      });
      const payload = {
        payment_id: 'np_quota_upgrade_01',
        payment_status: 'finished',
        order_id: 'order_ent_quota_01',
        workspace_id: 'ws_quota_upgraded_01',
        target_tier: 'ENTERPRISE',
        pay_amount: 149.0,
        pay_currency: 'USDT',
      };
      const canonical = canonicalizeNowPaymentsJson(payload);
      const signature = await computeNowPaymentsHmacSha512(canonical, secret);

      const ipnRes = await postNowPaymentsIpn(
        new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
          method: 'POST',
          headers: { 'x-nowpayments-sig': signature },
          body: JSON.stringify(payload),
        }),
      );
      expect(ipnRes.status).toBe(200);

      const quotaRes = await getQuotas(
        new Request('http://localhost/api/ee/quotas', {
          headers: { 'x-cashclaw-workspace': 'ws_quota_upgraded_01' },
        }),
      );
      expect(quotaRes.status).toBe(200);
      const body = (await quotaRes.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.workspaceId).toBe('ws_quota_upgraded_01');
      expect(body.tier).toBe('ENTERPRISE');
      expect((body.entitlements as Record<string, unknown>).maxRunningPaperBots).toBe(25);
    });
  });

  describe('POST /api/ee/billing/ipn', () => {
    it('rejects request without signature header', async () => {
      const req = new Request('http://localhost/api/ee/billing/ipn', {
        method: 'POST',
        body: JSON.stringify({ payment_id: 'np_123' }),
      });
      const res = await postIpn(req);
      expect(res.status).toBe(401);
    });

    it('rejects stale timestamp outside 300s replay window (403)', async () => {
      const staleTime = Math.floor(Date.now() / 1000) - 600;
      const req = new Request('http://localhost/api/ee/billing/ipn', {
        method: 'POST',
        headers: {
          'x-nowpayments-sig': 'abc123',
          'x-nowpayments-timestamp': String(staleTime),
        },
        body: JSON.stringify({ payment_id: 'np_123' }),
      });
      const res = await postIpn(req);
      expect(res.status).toBe(403);
    });

    it('processes valid IPN payload with case-normalized HMAC-SHA512 signature', async () => {
      const secret = 'ee-routes-ipn-secret';
      await defaultCheckoutOrderStore.recordOrder({
        orderId: 'order_prem_001',
        workspaceId: 'ws_demo_01',
        targetTier: 'PREMIUM',
        expectedAmountUsd: 29,
        payCurrency: 'USDT',
      });
      const payload = {
        payment_id: 'np_payment_999',
        payment_status: 'finished',
        order_id: 'order_prem_001',
        workspace_id: 'ws_demo_01',
        target_tier: 'PREMIUM',
        pay_amount: 29.0,
        pay_currency: 'USDT',
      };
      const canonical = canonicalizeNowPaymentsJson(payload);
      const signature = await computeNowPaymentsHmacSha512(canonical, secret);

      const req = new Request('http://localhost/api/ee/billing/ipn', {
        method: 'POST',
        headers: {
          'x-nowpayments-sig': `  ${signature.toUpperCase()}  `,
        },
        body: JSON.stringify(payload),
      });

      const res = await postIpn(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.paymentId).toBe('np_payment_999');
      expect(body.targetTier).toBe('PREMIUM');
      expect(body.activated).toBe(true);

      const replayRes = await postIpn(
        new Request('http://localhost/api/ee/billing/ipn', {
          method: 'POST',
          headers: { 'x-nowpayments-sig': signature },
          body: JSON.stringify(payload),
        }),
      );
      expect(replayRes.status).toBe(200);
      const replayBody = (await replayRes.json()) as Record<string, unknown>;
      expect(replayBody.idempotentReplay).toBe(true);
      expect(replayBody.activated).toBe(false);
    });
  });

  describe('POST /api/ee/sync', () => {
    it('accepts and imports valid Local-to-Cloud Sync Bundle and materializes a paper bot', async () => {
      const bundleResult = await createLocalToCloudSyncBundle({
        botName: 'Volatility DCA Local',
        symbol: 'BTCUSDT',
        strategyId: 'volatilityDca',
        intervalMinutes: 60,
        feeBps: 10,
        slippageBps: 5,
        parameters: { window: 20, capital: 2500 },
      });
      expect(bundleResult.ok).toBe(true);
      if (!bundleResult.ok) return;

      const req = new Request('http://localhost/api/ee/sync', {
        method: 'POST',
        headers: { 'x-user-id': 'user_sync_1' },
        body: JSON.stringify(bundleResult.data),
      });

      const res = await postSync(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.botName).toBe('Volatility DCA Local');
      expect(body.botId).toBe('sync_test_01');
      expect(mockBotCreateHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Volatility DCA Local',
          strategy: 'volatility_dca',
          pair: 'BTC/USDT',
          capital: 2500,
          mode: 'paper',
          config: { window: 20, capital: 2500 },
        }),
        'user_sync_1',
      );
    });

    it('returns 422 when botCreateHandler fails to materialize the synced bot', async () => {
      mockBotCreateHandler.mockResolvedValueOnce({ ok: false, error: 'DB insert failed' });
      const bundleResult = await createLocalToCloudSyncBundle({
        botName: 'Failing Bot',
        symbol: 'ETH/USDT',
        strategyId: 'grid',
        intervalMinutes: 15,
        feeBps: 10,
        slippageBps: 5,
        parameters: { levels: 10 },
      });
      expect(bundleResult.ok).toBe(true);
      if (!bundleResult.ok) return;

      const res = await postSync(
        new Request('http://localhost/api/ee/sync', {
          method: 'POST',
          body: JSON.stringify(bundleResult.data),
        }),
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.error).toBe('DB insert failed');
    });

    it('normalizes a case-mismatched exchange so the D1 constraint still accepts the row', async () => {
      const bundleResult = await createLocalToCloudSyncBundle({
        botName: 'Cased Exchange Bot',
        symbol: 'ETHUSDT',
        strategyId: 'grid',
        intervalMinutes: 15,
        feeBps: 10,
        slippageBps: 5,
        parameters: { levels: 5, exchange: 'BINANCE' },
      });
      expect(bundleResult.ok).toBe(true);
      if (!bundleResult.ok) return;

      const res = await postSync(
        new Request('http://localhost/api/ee/sync', {
          method: 'POST',
          headers: { 'x-user-id': 'user_sync_1' },
          body: JSON.stringify(bundleResult.data),
        }),
      );
      expect(res.status).toBe(200);
      expect(mockBotCreateHandler).toHaveBeenCalledWith(
        expect.objectContaining({ exchange: 'binance' }),
        'user_sync_1',
      );
    });

    it('falls back to binance for an exchange outside the supported set', async () => {
      const bundleResult = await createLocalToCloudSyncBundle({
        botName: 'Unsupported Exchange Bot',
        symbol: 'ETH/USDT',
        strategyId: 'grid',
        intervalMinutes: 15,
        feeBps: 10,
        slippageBps: 5,
        parameters: { levels: 5, exchange: 'kraken' },
      });
      expect(bundleResult.ok).toBe(true);
      if (!bundleResult.ok) return;

      const res = await postSync(
        new Request('http://localhost/api/ee/sync', {
          method: 'POST',
          headers: { 'x-user-id': 'user_sync_1' },
          body: JSON.stringify(bundleResult.data),
        }),
      );
      expect(res.status).toBe(200);
      expect(mockBotCreateHandler).toHaveBeenCalledWith(
        expect.objectContaining({ exchange: 'binance' }),
        'user_sync_1',
      );
    });

    it('replaces an out-of-range or non-numeric capital with the safe default', async () => {
      const bundleResult = await createLocalToCloudSyncBundle({
        botName: 'Bad Capital Bot',
        symbol: 'ETH/USDT',
        strategyId: 'grid',
        intervalMinutes: 15,
        feeBps: 10,
        slippageBps: 5,
        parameters: { levels: 5, capital: -50 },
      });
      expect(bundleResult.ok).toBe(true);
      if (!bundleResult.ok) return;

      const res = await postSync(
        new Request('http://localhost/api/ee/sync', {
          method: 'POST',
          headers: { 'x-user-id': 'user_sync_1' },
          body: JSON.stringify(bundleResult.data),
        }),
      );
      expect(res.status).toBe(200);
      expect(mockBotCreateHandler).toHaveBeenCalledWith(
        expect.objectContaining({ capital: 1000 }),
        'user_sync_1',
      );
    });
  });
});
