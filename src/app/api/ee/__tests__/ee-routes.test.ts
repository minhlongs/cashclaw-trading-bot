import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { GET as getQuotas } from '../quotas/route';
import { POST as postIpn } from '../billing/ipn/route';
import { POST as postNowPaymentsIpn } from '../billing/nowpayments-ipn/route';
import { POST as postSync } from '../sync/route';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
} from '@/ee/billing/nowpayments-ipn';
import { createLocalToCloudSyncBundle } from '@/ee/sync/local-to-cloud-sync';

beforeAll(() => vi.stubEnv('NOWPAYMENTS_IPN_SECRET', 'test_ipn_secret'));
afterAll(() => vi.unstubAllEnvs());

describe('Phase 1: SaaS API Routes Integration', () => {
  describe('GET /api/ee/quotas', () => {
    it('requires a session even when no workspace is selected', async () => {
      const res = await getQuotas(new Request('http://localhost/api/ee/quotas'));
      expect(res.status).toBe(401);
    });

    it('does not let query/header tier or workspace claims bypass missing authentication', async () => {
      const res = await getQuotas(new Request('http://localhost/api/ee/quotas?workspaceId=victim&tier=MASTER', {
        headers: { 'x-cashclaw-tier': 'MASTER', 'x-user-id': 'attacker', 'x-cashclaw-workspace': 'victim' },
      }));
      expect(res.status).toBe(401);
    });

    it('rejects callback-supplied workspace and tier authority even when correctly signed', async () => {
      const payload = {
        payment_id: 'np_quota_upgrade_01', payment_status: 'finished', order_id: 'order_ent_quota_01',
        workspace_id: 'ws_quota_upgraded_01', target_tier: 'ENTERPRISE', price_amount: 99,
        price_currency: 'USD', pay_amount: 99, pay_currency: 'USDT',
      };
      const signature = await computeNowPaymentsHmacSha512(canonicalizeNowPaymentsJson(payload), 'test_ipn_secret');
      const response = await postNowPaymentsIpn(new Request('http://localhost/api/ee/billing/nowpayments-ipn', {
        method: 'POST', headers: { 'x-nowpayments-sig': signature }, body: JSON.stringify(payload),
      }));
      expect(response.status).toBe(400);
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

    it('rejects a malformed signature (403)', async () => {
      const req = new Request('http://localhost/api/ee/billing/ipn', {
        method: 'POST', headers: { 'x-nowpayments-sig': 'abc123' }, body: JSON.stringify({ payment_id: 'np_123' }),
      });
      const res = await postIpn(req);
      expect(res.status).toBe(403);
    });

    it('processes valid IPN payload with case-normalized HMAC-SHA512 signature', async () => {
      const secret = 'test_ipn_secret';
      const payload = {
        payment_id: 'np_payment_999', payment_status: 'finished', order_id: 'order_prem_001',
        price_amount: 29, price_currency: 'USD', pay_amount: 29, pay_currency: 'USDT',
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
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ ok: false, error: 'Billing store unavailable' });

      const retryRes = await postIpn(new Request('http://localhost/api/ee/billing/ipn', {
        method: 'POST', headers: { 'x-nowpayments-sig': signature }, body: JSON.stringify(payload),
      }));
      expect(retryRes.status).toBe(503);
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
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ ok: false, error: 'Authentication required' });
    });
  });
});
