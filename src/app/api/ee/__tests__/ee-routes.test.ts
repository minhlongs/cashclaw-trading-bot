import { describe, it, expect } from 'vitest';
import { GET as getQuotas } from '../quotas/route';
import { POST as postIpn } from '../billing/ipn/route';
import { POST as postNowPaymentsIpn } from '../billing/nowpayments-ipn/route';
import { POST as postSync } from '../sync/route';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '@/ee/billing/nowpayments-ipn';
import { createLocalToCloudSyncBundle } from '@/ee/sync/local-to-cloud-sync';

describe('Phase 1: SaaS API Routes Integration', () => {
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

    it('returns workspace entitlements for PREMIUM tier when specified', async () => {
      const req = new Request('http://localhost/api/ee/quotas?tier=PREMIUM');
      const res = await getQuotas(req);
      expect(res.status).toBe(200);

      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.tier).toBe('PREMIUM');
      expect((body.entitlements as Record<string, unknown>).maxRunningPaperBots).toBe(5);
    });

    it('resolves upgraded tier from entitlement store via x-cashclaw-workspace header', async () => {
      const secret = 'test_ipn_secret';
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
      const secret = 'test_ipn_secret';
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
    it('accepts and imports valid Local-to-Cloud Sync Bundle', async () => {
      const bundleResult = await createLocalToCloudSyncBundle({
        botName: 'Volatility DCA Local',
        symbol: 'BTC/USDT',
        strategyId: 'volatilityDca',
        intervalMinutes: 60,
        feeBps: 10,
        slippageBps: 5,
        parameters: { window: 20 },
      });
      expect(bundleResult.ok).toBe(true);
      if (!bundleResult.ok) return;

      const req = new Request('http://localhost/api/ee/sync', {
        method: 'POST',
        body: JSON.stringify(bundleResult.data),
      });

      const res = await postSync(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.botName).toBe('Volatility DCA Local');
    });
  });
});
